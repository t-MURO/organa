create extension if not exists pgcrypto with schema extensions;

create table public.account_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key_id uuid not null,
  recovery_key_envelope jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null check (platform in ('ios', 'android', 'web', 'macos', 'windows', 'linux')),
  public_key text,
  trusted_at timestamptz,
  revoked_at timestamptz,
  primary_reminder boolean not null default false,
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, id)
);

create unique index devices_one_primary_reminder_per_user
  on public.devices (user_id)
  where primary_reminder and revoked_at is null;

create table public.encrypted_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  ciphertext jsonb,
  field_versions jsonb not null default '{}'::jsonb,
  version bigint not null default 1,
  deleted boolean not null default false,
  updated_by uuid not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, record_type, record_id),
  foreign key (user_id, updated_by)
    references public.devices(user_id, id)
);

create index encrypted_records_updated_at
  on public.encrypted_records (user_id, updated_at);

create table public.encrypted_record_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  version bigint not null,
  ciphertext jsonb,
  field_versions jsonb not null,
  deleted boolean not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, record_type, record_id, version)
);

create index encrypted_record_history_retention
  on public.encrypted_record_history (user_id, recorded_at);

create table public.sync_mutations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  record_type text not null,
  record_id text not null,
  operation text not null check (operation in ('upsert', 'delete')),
  ciphertext jsonb,
  field_versions jsonb not null default '{}'::jsonb,
  base_version bigint not null default 0,
  applied_version bigint,
  created_at timestamptz not null,
  applied_at timestamptz,
  foreign key (user_id, device_id)
    references public.devices(user_id, id)
);

create index sync_mutations_user_created
  on public.sync_mutations (user_id, created_at);

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  execute_after timestamptz not null default now() + interval '1 hour',
  cancelled_at timestamptz,
  completed_at timestamptz,
  check (execute_after >= requested_at + interval '1 hour')
);

alter table public.account_keys enable row level security;
alter table public.devices enable row level security;
alter table public.encrypted_records enable row level security;
alter table public.encrypted_record_history enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy account_keys_owner
  on public.account_keys
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy devices_owner
  on public.devices
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy encrypted_records_owner
  on public.encrypted_records
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and
    exists (
      select 1
      from public.devices
      where devices.user_id = auth.uid()
        and devices.id = encrypted_records.updated_by
        and devices.revoked_at is null
        and devices.trusted_at is not null
    )
  );

create policy sync_mutations_owner
  on public.sync_mutations
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id and
    exists (
      select 1
      from public.devices
      where devices.user_id = auth.uid()
        and devices.id = sync_mutations.device_id
        and devices.revoked_at is null
        and devices.trusted_at is not null
    )
  );

create policy encrypted_record_history_owner
  on public.encrypted_record_history
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy account_deletion_owner
  on public.account_deletion_requests
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all
  on public.account_keys,
     public.devices,
     public.encrypted_records,
     public.encrypted_record_history,
     public.sync_mutations,
     public.account_deletion_requests
  from anon, authenticated;

grant select
  on public.account_keys,
     public.devices,
     public.encrypted_records,
     public.encrypted_record_history,
     public.account_deletion_requests
  to authenticated;

grant insert, update on public.account_keys to authenticated;

create or replace function public.apply_encrypted_mutation(
  p_mutation_id uuid,
  p_device_id uuid,
  p_record_type text,
  p_record_id text,
  p_operation text,
  p_ciphertext jsonb,
  p_field_versions jsonb,
  p_base_version bigint,
  p_created_at timestamptz
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version bigint;
  current_ciphertext jsonb;
  current_deleted boolean;
  current_field_versions jsonb;
  current_updated_at timestamptz;
  current_version bigint;
  field_name text;
  incoming_field_version timestamptz;
  stored_field_version timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_operation not in ('upsert', 'delete') then
    raise exception 'Unsupported mutation operation.';
  end if;

  if p_record_type not in (
    'task',
    'brain_dump_bullet',
    'brain_dump_update',
    'check_in',
    'template',
    'settings'
  ) then
    raise exception 'Unsupported record type.';
  end if;

  if length(p_record_id) = 0 or length(p_record_id) > 256 then
    raise exception 'Invalid record identifier.';
  end if;

  if p_created_at > now() + interval '5 minutes' then
    raise exception 'Mutation timestamp is too far in the future.';
  end if;

  if jsonb_typeof(coalesce(p_field_versions, '{}'::jsonb)) <> 'object' then
    raise exception 'Field versions must be an object.';
  end if;

  if p_operation = 'upsert' and (
    p_ciphertext is null or
    jsonb_typeof(p_ciphertext) <> 'object' or
    p_field_versions = '{}'::jsonb or
    (
      select count(*) from jsonb_object_keys(p_ciphertext)
    ) <> (
      select count(*) from jsonb_object_keys(p_field_versions)
    ) or
    exists (
      select 1
      from jsonb_object_keys(p_field_versions) as incoming_field(field_name)
      where not p_ciphertext ? incoming_field.field_name
    )
  ) then
    raise exception 'Encrypted field patches must match their field versions.';
  end if;

  if p_operation = 'delete' and p_ciphertext is not null then
    raise exception 'Delete mutations cannot include ciphertext.';
  end if;

  if exists (
    select 1
    from jsonb_each_text(coalesce(p_field_versions, '{}'::jsonb))
    where value::timestamptz > now() + interval '5 minutes'
  ) then
    raise exception 'Field timestamp is too far in the future.';
  end if;

  if not exists (
    select 1
    from public.devices
    where devices.user_id = auth.uid()
      and devices.id = p_device_id
      and devices.revoked_at is null
      and devices.trusted_at is not null
  ) then
    raise exception 'The device is not trusted.';
  end if;

  insert into public.sync_mutations (
    id,
    user_id,
    device_id,
    record_type,
    record_id,
    operation,
    ciphertext,
    field_versions,
    base_version,
    created_at
  )
  values (
    p_mutation_id,
    auth.uid(),
    p_device_id,
    p_record_type,
    p_record_id,
    p_operation,
    p_ciphertext,
    coalesce(p_field_versions, '{}'::jsonb),
    p_base_version,
    p_created_at
  )
  on conflict (id) do nothing;

  select applied_version
    into next_version
    from public.sync_mutations
    where id = p_mutation_id and user_id = auth.uid();

  if next_version is not null then
    return next_version;
  end if;

  select ciphertext, deleted, field_versions, updated_at, version
    into current_ciphertext,
         current_deleted,
         current_field_versions,
         current_updated_at,
         current_version
    from public.encrypted_records
    where user_id = auth.uid()
      and record_type = p_record_type
      and record_id = p_record_id
    for update;

  if not found then
    insert into public.encrypted_records (
      user_id,
      record_type,
      record_id,
      ciphertext,
      field_versions,
      version,
      deleted,
      updated_by,
      updated_at
    )
    values (
      auth.uid(),
      p_record_type,
      p_record_id,
      p_ciphertext,
      coalesce(p_field_versions, '{}'::jsonb),
      1,
      p_operation = 'delete',
      p_device_id,
      clock_timestamp()
    )
    returning version into next_version;
  else
    insert into public.encrypted_record_history (
      user_id,
      record_type,
      record_id,
      version,
      ciphertext,
      field_versions,
      deleted
    )
    values (
      auth.uid(),
      p_record_type,
      p_record_id,
      current_version,
      current_ciphertext,
      current_field_versions,
      current_deleted
    )
    on conflict do nothing;

    if p_operation = 'delete' then
      stored_field_version := nullif(
        current_field_versions ->> 'deleted',
        ''
      )::timestamptz;
      if stored_field_version is null or p_created_at >= stored_field_version then
        current_deleted := true;
        current_field_versions := current_field_versions ||
          jsonb_build_object('deleted', p_created_at::text);
      end if;
    else
      for field_name in
        select jsonb_object_keys(coalesce(p_field_versions, '{}'::jsonb))
      loop
        incoming_field_version :=
          (p_field_versions ->> field_name)::timestamptz;
        stored_field_version := nullif(
          current_field_versions ->> field_name,
          ''
        )::timestamptz;
        if stored_field_version is null or
           incoming_field_version >= stored_field_version then
          current_ciphertext := coalesce(current_ciphertext, '{}'::jsonb) ||
            jsonb_build_object(field_name, p_ciphertext -> field_name);
          current_field_versions := current_field_versions ||
            jsonb_build_object(field_name, p_field_versions -> field_name);
        end if;
      end loop;

      stored_field_version := nullif(
        current_field_versions ->> 'deleted',
        ''
      )::timestamptz;
      if stored_field_version is null or p_created_at >= stored_field_version then
        current_deleted := false;
      end if;
    end if;

    next_version := current_version + 1;
    update public.encrypted_records
    set ciphertext = current_ciphertext,
        field_versions = current_field_versions,
        version = next_version,
        deleted = current_deleted,
        updated_by = p_device_id,
        updated_at = clock_timestamp()
    where user_id = auth.uid()
      and record_type = p_record_type
      and record_id = p_record_id;
  end if;

  update public.sync_mutations
  set applied_at = now(), applied_version = next_version
  where id = p_mutation_id and user_id = auth.uid();

  delete from public.encrypted_record_history
  where user_id = auth.uid()
    and recorded_at < now() - interval '7 days';

  return next_version;
end;
$$;

revoke execute on function public.apply_encrypted_mutation(
  uuid, uuid, text, text, text, jsonb, jsonb, bigint, timestamptz
) from public, anon;
grant execute on function public.apply_encrypted_mutation(
  uuid, uuid, text, text, text, jsonb, jsonb, bigint, timestamptz
) to authenticated;

create or replace function public.request_account_deletion()
returns public.account_deletion_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  deletion_request public.account_deletion_requests;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  insert into public.account_deletion_requests (
    user_id,
    requested_at,
    execute_after,
    cancelled_at,
    completed_at
  )
  values (
    auth.uid(),
    now(),
    now() + interval '1 hour',
    null,
    null
  )
  on conflict (user_id)
  do update set
    requested_at = excluded.requested_at,
    execute_after = excluded.execute_after,
    cancelled_at = null,
    completed_at = null
  returning * into deletion_request;

  return deletion_request;
end;
$$;

create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  update public.account_deletion_requests
  set cancelled_at = now()
  where user_id = auth.uid()
    and cancelled_at is null
    and completed_at is null
    and execute_after > now();

  if not found then
    raise exception 'The deletion request can no longer be cancelled.';
  end if;
end;
$$;

revoke execute on function public.request_account_deletion()
  from public, anon;
revoke execute on function public.cancel_account_deletion()
  from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion() to authenticated;

create or replace function public.register_trusted_device(
  p_device_id uuid,
  p_name text,
  p_platform text
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

  if p_platform not in ('ios', 'android', 'web', 'macos', 'windows', 'linux') then
    raise exception 'Unsupported device platform.';
  end if;

  if length(trim(p_name)) = 0 or length(trim(p_name)) > 80 then
    raise exception 'Invalid device name.';
  end if;

  if exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and id = p_device_id
      and revoked_at is not null
  ) then
    raise exception 'This device was revoked and must be enrolled again.';
  end if;

  select not exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and primary_reminder
      and revoked_at is null
  ) into is_first_reminder_device;

  insert into public.devices (
    id,
    user_id,
    name,
    platform,
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
    now(),
    is_first_reminder_device,
    is_first_reminder_device,
    now()
  )
  on conflict (id)
  do update set
    last_seen_at = now(),
    name = excluded.name,
    platform = excluded.platform
  where public.devices.user_id = auth.uid();
end;
$$;

create or replace function public.configure_reminder_device(
  p_device_id uuid,
  p_make_primary boolean,
  p_notifications_enabled boolean
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

  if not exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and id = p_device_id
      and trusted_at is not null
      and revoked_at is null
  ) then
    raise exception 'The device is not trusted.';
  end if;

  if p_make_primary then
    update public.devices
    set primary_reminder = false
    where user_id = auth.uid()
      and primary_reminder;

    update public.devices
    set primary_reminder = true,
        notifications_enabled = true
    where user_id = auth.uid()
      and id = p_device_id;
  else
    update public.devices
    set notifications_enabled = case
      when primary_reminder then true
      else p_notifications_enabled
    end
    where user_id = auth.uid()
      and id = p_device_id;
  end if;
end;
$$;

create or replace function public.revoke_trusted_device(
  p_current_device_id uuid,
  p_target_device_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_was_primary boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if p_current_device_id = p_target_device_id then
    raise exception 'The current device cannot revoke itself.';
  end if;

  if not exists (
    select 1 from public.devices
    where user_id = auth.uid()
      and id = p_current_device_id
      and trusted_at is not null
      and revoked_at is null
  ) then
    raise exception 'The current device is not trusted.';
  end if;

  select primary_reminder
    into target_was_primary
    from public.devices
    where user_id = auth.uid()
      and id = p_target_device_id
      and revoked_at is null;

  if target_was_primary is null then
    raise exception 'The target device is not active.';
  end if;

  update public.devices
  set revoked_at = now(),
      primary_reminder = false,
      notifications_enabled = false
  where user_id = auth.uid()
    and id = p_target_device_id;

  if target_was_primary then
    update public.devices
    set primary_reminder = true,
        notifications_enabled = true
    where user_id = auth.uid()
      and id = p_current_device_id;
  end if;
end;
$$;

revoke execute on function public.register_trusted_device(uuid, text, text)
  from public, anon;
revoke execute on function public.configure_reminder_device(uuid, boolean, boolean)
  from public, anon;
revoke execute on function public.revoke_trusted_device(uuid, uuid)
  from public, anon;
grant execute on function public.register_trusted_device(uuid, text, text)
  to authenticated;
grant execute on function public.configure_reminder_device(uuid, boolean, boolean)
  to authenticated;
grant execute on function public.revoke_trusted_device(uuid, uuid)
  to authenticated;

create policy organa_user_receives_own_broadcasts
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.messages.extension = 'broadcast' and
    (select realtime.topic()) in (
      'organa:' || (select auth.uid())::text || ':encrypted-records',
      'organa:' || (select auth.uid())::text || ':devices'
    )
  );

create or replace function public.broadcast_encrypted_record_change()
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
      'recordId', coalesce(new.record_id, old.record_id),
      'recordType', coalesce(new.record_type, old.record_type)
    ),
    'changed',
    'organa:' || owner_id::text || ':encrypted-records',
    true
  );
  return null;
end;
$$;

create trigger encrypted_records_broadcast_change
  after insert or update or delete on public.encrypted_records
  for each row execute function public.broadcast_encrypted_record_change();

revoke execute on function public.broadcast_encrypted_record_change()
  from public, anon, authenticated;

create or replace function public.broadcast_device_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := coalesce(new.user_id, old.user_id);
begin
  perform realtime.send(
    jsonb_build_object('deviceId', coalesce(new.id, old.id)),
    'changed',
    'organa:' || owner_id::text || ':devices',
    true
  );
  return null;
end;
$$;

create trigger devices_broadcast_change
  after insert or update or delete on public.devices
  for each row execute function public.broadcast_device_change();

revoke execute on function public.broadcast_device_change()
  from public, anon, authenticated;
