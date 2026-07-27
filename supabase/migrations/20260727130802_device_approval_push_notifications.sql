create table public.device_push_tokens (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  expo_push_token text not null,
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id),
  unique (expo_push_token),
  foreign key (user_id, device_id)
    references public.devices(user_id, id) on delete cascade,
  check (
    expo_push_token ~
      '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{20,200}\]$'
  )
);

alter table public.device_push_tokens enable row level security;

create policy device_push_tokens_no_direct_access
  on public.device_push_tokens
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on public.device_push_tokens from public, anon, authenticated;

alter table public.device_approvals
  add column notification_requested_at timestamptz;

create or replace function public.register_device_push_token(
  p_current_device_id uuid,
  p_current_device_proof text,
  p_expo_push_token text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_platform text;
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

  if p_expo_push_token is null or
     p_expo_push_token !~
       '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{20,200}\]$' then
    raise exception 'The push token is invalid.';
  end if;

  select platform
    into current_platform
    from public.devices
    where user_id = auth.uid()
      and id = p_current_device_id
      and trusted_at is not null
      and revoked_at is null;

  if current_platform not in ('ios', 'android') then
    raise exception 'Push registration requires a trusted mobile device.';
  end if;

  delete from public.device_push_tokens
  where expo_push_token = p_expo_push_token
    and (
      user_id <> auth.uid() or
      device_id <> p_current_device_id
    );

  insert into public.device_push_tokens (
    user_id,
    device_id,
    expo_push_token,
    platform,
    updated_at
  )
  values (
    auth.uid(),
    p_current_device_id,
    p_expo_push_token,
    current_platform,
    now()
  )
  on conflict (user_id, device_id)
  do update set
    expo_push_token = excluded.expo_push_token,
    platform = excluded.platform,
    updated_at = now();
end;
$$;

create or replace function public.unregister_device_push_token(
  p_current_device_id uuid,
  p_current_device_proof text
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

  delete from public.device_push_tokens
  where user_id = auth.uid()
    and device_id = p_current_device_id;
end;
$$;

create or replace function public.claim_device_approval_push(
  p_user_id uuid,
  p_device_id uuid,
  p_device_proof text
)
returns table (expo_push_token text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or
     p_device_proof is null or
     length(p_device_proof) < 64 or
     length(p_device_proof) > 200 then
    return;
  end if;

  update public.device_approvals
  set notification_requested_at = now()
  where user_id = p_user_id
    and device_id = p_device_id
    and claimed_at is null
    and approved_at is null
    and expires_at > now()
    and requested_at > now() - interval '2 minutes'
    and (
      notification_requested_at is null or
      notification_requested_at < now() - interval '1 minute'
    )
    and exists (
      select 1
      from public.devices
      where devices.user_id = p_user_id
        and devices.id = p_device_id
        and devices.trusted_at is null
        and devices.revoked_at is null
        and devices.device_proof_hash = encode(
          extensions.digest(p_device_proof, 'sha256'),
          'hex'
        )
    );

  if not found then
    return;
  end if;

  return query
    select tokens.expo_push_token
    from public.device_push_tokens as tokens
    join public.devices as devices
      on devices.user_id = tokens.user_id
      and devices.id = tokens.device_id
    where tokens.user_id = p_user_id
      and tokens.device_id <> p_device_id
      and devices.trusted_at is not null
      and devices.revoked_at is null
    order by tokens.updated_at desc
    limit 100;
end;
$$;

create or replace function public.purge_revoked_device_push_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null or new.trusted_at is null then
    delete from public.device_push_tokens
    where user_id = new.user_id
      and device_id = new.id;
  end if;
  return new;
end;
$$;

create trigger devices_purge_revoked_push_token
  after update of revoked_at, trusted_at on public.devices
  for each row execute function public.purge_revoked_device_push_token();

revoke execute on function public.register_device_push_token(
  uuid, text, text
) from public, anon;
revoke execute on function public.unregister_device_push_token(
  uuid, text
) from public, anon;
revoke execute on function public.claim_device_approval_push(
  uuid, uuid, text
) from public, anon, authenticated;
revoke execute on function public.purge_revoked_device_push_token()
  from public, anon, authenticated;

grant execute on function public.register_device_push_token(
  uuid, text, text
) to authenticated;
grant execute on function public.unregister_device_push_token(
  uuid, text
) to authenticated;
grant execute on function public.claim_device_approval_push(
  uuid, uuid, text
) to service_role;
