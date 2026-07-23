create or replace function public.reject_device_write_while_deleting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.account_deletion_requests
    where user_id = new.user_id
      and cancelled_at is null
      and completed_at is null
  ) then
    raise exception 'The account is read-only while deletion is pending.';
  end if;

  return new;
end;
$$;

create trigger devices_reject_write_while_deleting
  before insert or update on public.devices
  for each row execute function public.reject_device_write_while_deleting();

revoke execute on function public.reject_device_write_while_deleting()
  from public, anon, authenticated;

create table public.device_approvals (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  encrypted_content_key jsonb,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid,
  expires_at timestamptz not null default now() + interval '15 minutes',
  claimed_at timestamptz,
  primary key (user_id, device_id),
  foreign key (user_id, device_id)
    references public.devices(user_id, id) on delete cascade
);

create index device_approvals_expiry
  on public.device_approvals (user_id, expires_at);

alter table public.device_approvals enable row level security;

create policy device_approvals_owner
  on public.device_approvals
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.device_approvals from anon, authenticated;
grant select (
  user_id,
  device_id,
  encrypted_content_key,
  requested_at,
  approved_at,
  approved_by,
  expires_at,
  claimed_at
) on public.device_approvals to authenticated;

create or replace function public.request_device_approval(
  p_device_id uuid,
  p_device_proof text,
  p_name text,
  p_platform text
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

  if p_platform not in ('ios', 'android', 'web', 'macos', 'windows', 'linux') then
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
    now(),
    null,
    null,
    now() + interval '15 minutes',
    null
  )
  on conflict (user_id, device_id)
  do update set
    encrypted_content_key = null,
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

  if not exists (
    select 1 from public.device_approvals
    where user_id = auth.uid()
      and device_id = p_target_device_id
      and claimed_at is null
      and expires_at > now()
  ) then
    raise exception 'The device approval request has expired.';
  end if;

  if p_encrypted_content_key is null or
     jsonb_typeof(p_encrypted_content_key) <> 'object' or
     pg_column_size(p_encrypted_content_key) > 16384 or
     coalesce(p_encrypted_content_key ->> 'version', '') <> '1' or
     coalesce(p_encrypted_content_key ->> 'algorithm', '') <> 'AES-256-GCM' or
     coalesce(p_encrypted_content_key ->> 'targetDeviceId', '') <>
       p_target_device_id::text or
     coalesce(p_encrypted_content_key ->> 'keyId', '') <> (
       select key_id::text
       from public.account_keys
       where user_id = auth.uid()
     ) or
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
    and claimed_at is null;
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
      claimed_at = now()
  where user_id = auth.uid()
    and device_id = p_device_id;
end;
$$;

create or replace function public.reject_device_approval(
  p_current_device_id uuid,
  p_current_device_proof text,
  p_target_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_pending boolean;
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
    raise exception 'The current device cannot reject itself.';
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

  select trusted_at is null
    into target_is_pending
    from public.devices
    where user_id = auth.uid()
      and id = p_target_device_id
      and revoked_at is null;

  if target_is_pending is null then
    raise exception 'The target device is unavailable.';
  end if;

  delete from public.device_approvals
  where user_id = auth.uid()
    and device_id = p_target_device_id
    and claimed_at is null;

  if not found then
    raise exception 'There is no pending approval request.';
  end if;

  if target_is_pending then
    delete from public.devices
    where user_id = auth.uid()
      and id = p_target_device_id
      and trusted_at is null;
  end if;
end;
$$;

revoke execute on function public.request_device_approval(
  uuid, text, text, text
) from public, anon;
revoke execute on function public.approve_trusted_device(
  uuid, text, uuid, jsonb
) from public, anon;
revoke execute on function public.complete_device_approval(uuid, text)
  from public, anon;
revoke execute on function public.reject_device_approval(uuid, text, uuid)
  from public, anon;

grant execute on function public.request_device_approval(
  uuid, text, text, text
) to authenticated;
grant execute on function public.approve_trusted_device(
  uuid, text, uuid, jsonb
) to authenticated;
grant execute on function public.complete_device_approval(uuid, text)
  to authenticated;
grant execute on function public.reject_device_approval(uuid, text, uuid)
  to authenticated;

create or replace function public.broadcast_device_approval_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := coalesce(new.user_id, old.user_id);
begin
  perform realtime.send(
    jsonb_build_object(
      'deviceId',
      coalesce(new.device_id, old.device_id)
    ),
    'changed',
    'organa:' || owner_id::text || ':devices',
    true
  );
  return null;
end;
$$;

create trigger device_approvals_broadcast_change
  after insert or update or delete on public.device_approvals
  for each row execute function public.broadcast_device_approval_change();

revoke execute on function public.broadcast_device_approval_change()
  from public, anon, authenticated;
