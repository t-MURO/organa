alter table public.device_approvals
  add column request_public_key text;

alter table public.device_approvals
  add constraint device_approvals_request_public_key_format
  check (
    request_public_key is null or
    request_public_key ~ '^[0-9a-f]{64}$'
  );

grant select (request_public_key)
  on public.device_approvals to authenticated;

revoke execute on function public.request_device_approval(
  uuid, text, text, text
) from authenticated;

create or replace function public.request_device_approval(
  p_device_id uuid,
  p_device_proof text,
  p_name text,
  p_platform text,
  p_request_public_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_device public.devices;
  proof_hash text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.account_deletion_requests
    where user_id = auth.uid()
      and cancelled_at is null
      and completed_at is null
  ) then
    raise exception 'The account is read-only while deletion is pending.';
  end if;

  if p_platform not in (
    'ios',
    'android',
    'web',
    'macos',
    'windows',
    'linux'
  ) then
    raise exception 'Unsupported device platform.';
  end if;

  if length(trim(p_name)) = 0 or length(trim(p_name)) > 80 then
    raise exception 'Invalid device name.';
  end if;

  if p_device_proof is null or
     length(p_device_proof) < 64 or
     length(p_device_proof) > 200 then
    raise exception 'Invalid device proof.';
  end if;

  if p_request_public_key is null or
     p_request_public_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid device approval public key.';
  end if;

  if exists (
    select 1 from public.devices
    where id = p_device_id
      and user_id <> auth.uid()
  ) then
    raise exception 'The device identifier belongs to another account.';
  end if;

  proof_hash := encode(
    extensions.digest(p_device_proof, 'sha256'),
    'hex'
  );

  select *
    into existing_device
    from public.devices
    where user_id = auth.uid()
      and id = p_device_id;

  if found then
    if existing_device.revoked_at is not null then
      raise exception 'A revoked device requires recovery-key enrollment.';
    end if;
    if existing_device.device_proof_hash <> proof_hash then
      raise exception 'The device proof is invalid.';
    end if;

    update public.devices
    set name = trim(p_name),
        platform = p_platform,
        last_seen_at = now()
    where user_id = auth.uid()
      and id = p_device_id;
  else
    insert into public.devices (
      id,
      user_id,
      name,
      platform,
      device_proof_hash,
      trusted_at,
      primary_reminder,
      notifications_enabled,
      last_seen_at
    )
    values (
      p_device_id,
      auth.uid(),
      trim(p_name),
      p_platform,
      proof_hash,
      null,
      false,
      false,
      now()
    );
  end if;

  insert into public.device_approvals (
    user_id,
    device_id,
    encrypted_content_key,
    request_public_key,
    requested_at,
    approved_at,
    approved_by,
    expires_at,
    claimed_at
  )
  values (
    auth.uid(),
    p_device_id,
    null,
    p_request_public_key,
    now(),
    null,
    null,
    now() + interval '15 minutes',
    null
  )
  on conflict (user_id, device_id)
  do update set
    encrypted_content_key = null,
    request_public_key = excluded.request_public_key,
    requested_at = now(),
    approved_at = null,
    approved_by = null,
    expires_at = now() + interval '15 minutes',
    claimed_at = null;
end;
$$;

create or replace function public.approve_trusted_device(
  p_current_device_id uuid,
  p_current_device_proof text,
  p_target_device_id uuid,
  p_encrypted_content_key jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.device_proof_is_valid(
    p_current_device_id,
    p_current_device_proof
  ) then
    raise exception 'The current device proof is invalid.';
  end if;

  if p_current_device_id = p_target_device_id then
    raise exception 'A different trusted device must approve this request.';
  end if;

  if exists (
    select 1
    from public.account_deletion_requests
    where user_id = auth.uid()
      and cancelled_at is null
      and completed_at is null
  ) then
    raise exception 'The account is read-only while deletion is pending.';
  end if;

  if not exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and id = p_target_device_id
      and revoked_at is null
  ) then
    raise exception 'The target device is unavailable.';
  end if;

  if p_encrypted_content_key is null or
     jsonb_typeof(p_encrypted_content_key) <> 'object' or
     pg_column_size(p_encrypted_content_key) > 16384 or
     coalesce(p_encrypted_content_key ->> 'version', '') <> '2' or
     coalesce(p_encrypted_content_key ->> 'algorithm', '') <>
       'X25519-HKDF-SHA256-AES-256-GCM' or
     coalesce(p_encrypted_content_key ->> 'targetDeviceId', '') <>
       p_target_device_id::text or
     coalesce(p_encrypted_content_key ->> 'keyId', '') <> (
       select key_id::text
       from public.account_keys
       where user_id = auth.uid()
     ) or
     coalesce(p_encrypted_content_key ->> 'recipientPublicKey', '') !~
       '^[0-9a-f]{64}$' or
     coalesce(p_encrypted_content_key ->> 'senderPublicKey', '') !~
       '^[0-9a-f]{64}$' or
     length(coalesce(p_encrypted_content_key ->> 'combined', '')) < 40 or
     length(coalesce(p_encrypted_content_key ->> 'combined', '')) > 15000 then
    raise exception 'The encrypted device approval is invalid.';
  end if;

  update public.device_approvals
  set encrypted_content_key = p_encrypted_content_key,
      approved_at = now(),
      approved_by = p_current_device_id,
      expires_at = now() + interval '15 minutes'
  where user_id = auth.uid()
    and device_id = p_target_device_id
    and request_public_key =
      p_encrypted_content_key ->> 'recipientPublicKey'
    and claimed_at is null
    and expires_at > now();

  if not found then
    raise exception 'The device approval request has expired.';
  end if;
end;
$$;

create or replace function public.complete_device_approval(
  p_device_id uuid,
  p_device_proof text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  is_first_reminder_device boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if exists (
    select 1
    from public.account_deletion_requests
    where user_id = auth.uid()
      and cancelled_at is null
      and completed_at is null
  ) then
    raise exception 'The account is read-only while deletion is pending.';
  end if;

  if not exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and id = p_device_id
      and revoked_at is null
      and device_proof_hash = encode(
        extensions.digest(p_device_proof, 'sha256'),
        'hex'
      )
  ) then
    raise exception 'The device proof is invalid.';
  end if;

  if not exists (
    select 1 from public.device_approvals
    where user_id = auth.uid()
      and device_id = p_device_id
      and encrypted_content_key is not null
      and request_public_key is not null
      and approved_at is not null
      and claimed_at is null
      and expires_at > now()
  ) then
    raise exception 'The device approval is unavailable or expired.';
  end if;

  select not exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and primary_reminder
      and revoked_at is null
  ) into is_first_reminder_device;

  update public.devices
  set trusted_at = coalesce(trusted_at, now()),
      primary_reminder = case
        when trusted_at is null then is_first_reminder_device
        else primary_reminder
      end,
      notifications_enabled = case
        when trusted_at is null then is_first_reminder_device
        else notifications_enabled
      end,
      last_seen_at = now()
  where user_id = auth.uid()
    and id = p_device_id;

  update public.device_approvals
  set encrypted_content_key = null,
      request_public_key = null,
      claimed_at = now()
  where user_id = auth.uid()
    and device_id = p_device_id;
end;
$$;

revoke execute on function public.request_device_approval(
  uuid, text, text, text, text
) from public, anon;
grant execute on function public.request_device_approval(
  uuid, text, text, text, text
) to authenticated;
