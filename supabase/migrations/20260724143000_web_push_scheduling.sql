create table public.web_push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  endpoint text not null check (
    length(endpoint) between 16 and 4096 and
    endpoint ~ '^https://'
  ),
  p256dh text not null check (
    length(p256dh) between 40 and 200 and
    p256dh ~ '^[A-Za-z0-9_-]+=*$'
  ),
  auth_secret text not null check (
    length(auth_secret) between 10 and 100 and
    auth_secret ~ '^[A-Za-z0-9_-]+=*$'
  ),
  expiration_time timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id),
  foreign key (user_id, device_id)
    references public.devices(user_id, id)
    on delete cascade
);

create table public.web_push_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  subscription_id uuid not null
    references public.web_push_subscriptions(id)
    on delete cascade,
  scope text not null check (length(scope) between 1 and 512),
  reminder_key text not null check (length(reminder_key) between 1 and 512),
  fire_at timestamptz not null,
  route text not null check (length(route) between 1 and 512),
  repeat_local_time text,
  time_zone text,
  claimed_at timestamptz,
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (repeat_local_time is null and time_zone is null) or
    (repeat_local_time is not null and time_zone is not null)
  ),
  unique (subscription_id, scope, reminder_key)
);

create index web_push_reminders_due
  on public.web_push_reminders (fire_at)
  where claimed_at is null;

alter table public.web_push_subscriptions enable row level security;
alter table public.web_push_reminders enable row level security;

revoke all
  on public.web_push_subscriptions,
     public.web_push_reminders
  from anon, authenticated;

grant select, insert, update, delete
  on public.web_push_subscriptions,
     public.web_push_reminders
  to service_role;

create or replace function public.replace_web_push_schedule(
  p_current_device_id uuid,
  p_current_device_proof text,
  p_scope text,
  p_entries jsonb,
  p_subscription jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_device public.devices%rowtype;
  subscription_id uuid;
  entry jsonb;
  entry_fire_at timestamptz;
  entry_key text;
  entry_repeat_local_time text;
  entry_route text;
  entry_time_zone text;
  endpoint_value text;
  p256dh_value text;
  auth_value text;
  expiration_value timestamptz;
  local_candidate timestamptz;
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

  if p_scope is null or
     length(p_scope) > 512 or
     p_scope !~ '^(check-in|task:[A-Za-z0-9%._~-]+)$' then
    raise exception 'The Web Push schedule scope is invalid.';
  end if;

  if jsonb_typeof(p_entries) <> 'array' or
     jsonb_array_length(p_entries) > 100 then
    raise exception 'The Web Push schedule entries are invalid.';
  end if;

  select *
    into active_device
    from public.devices
    where user_id = auth.uid()
      and id = p_current_device_id
      and trusted_at is not null
      and revoked_at is null;

  if active_device.id is null then
    raise exception 'The current device is not trusted.';
  end if;

  delete from public.web_push_reminders
  using public.web_push_subscriptions
  where web_push_reminders.subscription_id = web_push_subscriptions.id
    and web_push_subscriptions.user_id = auth.uid()
    and web_push_subscriptions.device_id = p_current_device_id
    and web_push_reminders.scope = p_scope;

  if jsonb_array_length(p_entries) = 0 then
    return;
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

  if active_device.platform <> 'web' or
     not (
       active_device.primary_reminder or
       active_device.notifications_enabled
     ) then
    raise exception 'Web Push is not enabled for this device.';
  end if;

  if p_subscription is null or jsonb_typeof(p_subscription) <> 'object' then
    raise exception 'A Web Push subscription is required.';
  end if;

  endpoint_value := p_subscription ->> 'endpoint';
  p256dh_value := p_subscription ->> 'p256dh';
  auth_value := p_subscription ->> 'auth';

  if endpoint_value is null or
     length(endpoint_value) not between 16 and 4096 or
     endpoint_value !~ '^https://' or
     p256dh_value is null or
     length(p256dh_value) not between 40 and 200 or
     p256dh_value !~ '^[A-Za-z0-9_-]+=*$' or
     auth_value is null or
     length(auth_value) not between 10 and 100 or
     auth_value !~ '^[A-Za-z0-9_-]+=*$' then
    raise exception 'The Web Push subscription is invalid.';
  end if;

  begin
    expiration_value := case
      when p_subscription ->> 'expirationTime' is null then null
      else to_timestamp(
        (p_subscription ->> 'expirationTime')::double precision / 1000
      )
    end;
  exception when others then
    raise exception 'The Web Push subscription expiry is invalid.';
  end;

  if expiration_value is not null and expiration_value <= now() then
    raise exception 'The Web Push subscription has expired.';
  end if;

  insert into public.web_push_subscriptions (
    user_id,
    device_id,
    endpoint,
    p256dh,
    auth_secret,
    expiration_time
  )
  values (
    auth.uid(),
    p_current_device_id,
    endpoint_value,
    p256dh_value,
    auth_value,
    expiration_value
  )
  on conflict (user_id, device_id)
  do update set
    endpoint = excluded.endpoint,
    p256dh = excluded.p256dh,
    auth_secret = excluded.auth_secret,
    expiration_time = excluded.expiration_time,
    updated_at = now()
  returning id into subscription_id;

  for entry in select value from jsonb_array_elements(p_entries)
  loop
    if jsonb_typeof(entry) <> 'object' or
       exists (
         select 1
         from jsonb_object_keys(entry) as entry_key_name
         where entry_key_name not in (
           'fireAt',
           'key',
           'repeatLocalTime',
           'route',
           'timeZone'
         )
       ) then
      raise exception 'A Web Push schedule entry is invalid.';
    end if;

    entry_key := entry ->> 'key';
    entry_route := entry ->> 'route';
    entry_repeat_local_time := entry ->> 'repeatLocalTime';
    entry_time_zone := entry ->> 'timeZone';

    if entry ->> 'fireAt' is null or
       entry_key is null or
       length(entry_key) > 512 or
       entry_key !~ '^[A-Za-z0-9%:._~-]+$' or
       entry_route is null or
       length(entry_route) > 512 or
       entry_route !~ '^/(check-in|focus\?taskId=[A-Za-z0-9%._~-]+)$'
    then
      raise exception 'A Web Push schedule entry contains invalid routing.';
    end if;

    begin
      entry_fire_at := (entry ->> 'fireAt')::timestamptz;
    exception when others then
      raise exception 'A Web Push delivery time is invalid.';
    end;

    if entry_fire_at > now() + interval '370 days' then
      raise exception 'A Web Push delivery time is too far in the future.';
    end if;

    if entry_repeat_local_time is not null or entry_time_zone is not null then
      if p_scope <> 'check-in' or
         entry_key <> 'check-in:daily' or
         entry_route <> '/check-in' or
         entry_repeat_local_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or
         entry_time_zone is null or
         length(entry_time_zone) > 100 then
        raise exception 'The repeating Web Push schedule is invalid.';
      end if;

      begin
        local_candidate := (
          (now() at time zone entry_time_zone)::date +
          entry_repeat_local_time::time
        ) at time zone entry_time_zone;
      exception when others then
        raise exception 'The Web Push timezone is invalid.';
      end;

      if entry_fire_at <= now() then
        entry_fire_at := local_candidate;
        if entry_fire_at <= now() then
          entry_fire_at := (
            (now() at time zone entry_time_zone)::date +
            1 +
            entry_repeat_local_time::time
          ) at time zone entry_time_zone;
        end if;
      end if;
    elsif entry_fire_at <= now() then
      continue;
    end if;

    insert into public.web_push_reminders (
      subscription_id,
      scope,
      reminder_key,
      fire_at,
      route,
      repeat_local_time,
      time_zone
    )
    values (
      subscription_id,
      p_scope,
      entry_key,
      entry_fire_at,
      entry_route,
      entry_repeat_local_time,
      entry_time_zone
    );
  end loop;
end;
$$;

revoke execute on function public.replace_web_push_schedule(
  uuid, text, text, jsonb, jsonb
)
  from public, anon;
grant execute on function public.replace_web_push_schedule(
  uuid, text, text, jsonb, jsonb
)
  to authenticated;

create or replace function public.remove_current_web_push_subscription(
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

  delete from public.web_push_subscriptions
  where user_id = auth.uid()
    and device_id = p_current_device_id;
end;
$$;

revoke execute on function public.remove_current_web_push_subscription(
  uuid, text
)
  from public, anon;
grant execute on function public.remove_current_web_push_subscription(
  uuid, text
)
  to authenticated;

create or replace function public.claim_due_web_push_reminders(
  p_limit integer default 100
)
returns table (
  id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth_secret text,
  reminder_key text,
  route text,
  repeat_local_time text,
  time_zone text,
  attempts integer
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select reminders.id
    from public.web_push_reminders as reminders
    join public.web_push_subscriptions as subscriptions
      on subscriptions.id = reminders.subscription_id
    join public.devices
      on devices.user_id = subscriptions.user_id
      and devices.id = subscriptions.device_id
    where reminders.fire_at <= now()
      and (
        reminders.claimed_at is null or
        reminders.claimed_at < now() - interval '5 minutes'
      )
      and reminders.attempts < 5
      and (
        subscriptions.expiration_time is null or
        subscriptions.expiration_time > now()
      )
      and devices.trusted_at is not null
      and devices.revoked_at is null
      and (devices.primary_reminder or devices.notifications_enabled)
    order by reminders.fire_at, reminders.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update of reminders skip locked
  ),
  claimed as (
    update public.web_push_reminders as reminders
    set claimed_at = now(),
        attempts = reminders.attempts + 1,
        updated_at = now()
    from due
    where reminders.id = due.id
    returning reminders.*
  )
  select
    claimed.id,
    subscriptions.id,
    subscriptions.endpoint,
    subscriptions.p256dh,
    subscriptions.auth_secret,
    claimed.reminder_key,
    claimed.route,
    claimed.repeat_local_time,
    claimed.time_zone,
    claimed.attempts
  from claimed
  join public.web_push_subscriptions as subscriptions
    on subscriptions.id = claimed.subscription_id;
$$;

revoke execute on function public.claim_due_web_push_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_web_push_reminders(integer)
  to service_role;

create or replace function public.remove_quiet_web_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is not null or
     not (new.primary_reminder or new.notifications_enabled) then
    delete from public.web_push_subscriptions
    where user_id = new.user_id
      and device_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.remove_quiet_web_push_subscription()
  from public, anon, authenticated;

create trigger devices_remove_quiet_web_push_subscription
after update of primary_reminder, notifications_enabled, revoked_at
on public.devices
for each row
execute function public.remove_quiet_web_push_subscription();
