create or replace function public.lock_compactable_brain_dump_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
  target_record_id text;
  target_record_type text;
  matched text[];
begin
  if tg_op = 'DELETE' then
    owner_id := old.user_id;
    target_record_id := old.record_id;
    target_record_type := old.record_type;
  else
    owner_id := new.user_id;
    target_record_id := new.record_id;
    target_record_type := new.record_type;
  end if;

  if target_record_type = 'brain_dump_update' then
    matched := regexp_match(
      target_record_id,
      '^brain-update:(thought-[a-z0-9]+-[a-z0-9]+):'
    );
    if matched is not null then
      perform pg_advisory_xact_lock(
        hashtextextended(owner_id::text || ':' || matched[1], 0)
      );
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.lock_compactable_brain_dump_update()
  from public, anon, authenticated;

create trigger encrypted_records_lock_brain_dump_update
before insert or update or delete on public.encrypted_records
for each row execute function public.lock_compactable_brain_dump_update();

create or replace function public.compact_brain_dump_updates(
  p_mutation_id uuid,
  p_device_id uuid,
  p_device_proof text,
  p_bullet_id text,
  p_ciphertext jsonb,
  p_field_versions jsonb,
  p_created_at timestamptz,
  p_update_ids text[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_update_ids text[];
  normalized_update_ids text[];
  next_version bigint;
  update_prefix text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not public.device_proof_is_valid(p_device_id, p_device_proof) then
    raise exception 'The device proof is invalid.';
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

  if p_bullet_id !~ '^thought-[a-z0-9]+-[a-z0-9]+$' then
    raise exception 'Only app-generated Brain Dump bullets can be compacted.';
  end if;

  if coalesce(array_length(p_update_ids, 1), 0) < 1 or
     coalesce(array_length(p_update_ids, 1), 0) > 4096 or
     array_position(p_update_ids, null) is not null then
    raise exception 'Invalid Brain Dump compaction set.';
  end if;

  update_prefix := 'brain-update:' || p_bullet_id || ':';
  if exists (
    select 1
    from unnest(p_update_ids) as supplied(update_id)
    where left(supplied.update_id, length(update_prefix)) <> update_prefix
       or length(supplied.update_id) > 256
  ) then
    raise exception 'Brain Dump update identifiers do not match the bullet.';
  end if;

  select array_agg(distinct supplied.update_id order by supplied.update_id)
    into normalized_update_ids
    from unnest(p_update_ids) as supplied(update_id);

  perform pg_advisory_xact_lock(
    hashtextextended(auth.uid()::text || ':' || p_bullet_id, 0)
  );

  perform 1
  from public.encrypted_records
  where user_id = auth.uid()
    and record_type = 'brain_dump_bullet'
    and record_id = p_bullet_id
    and not deleted
  for update;
  if not found then
    raise exception 'The Brain Dump bullet is unavailable.';
  end if;

  select coalesce(
    array_agg(records.record_id order by records.record_id),
    array[]::text[]
  )
    into current_update_ids
    from public.encrypted_records as records
    where records.user_id = auth.uid()
      and records.record_type = 'brain_dump_update'
      and not records.deleted
      and left(records.record_id, length(update_prefix)) = update_prefix;

  if current_update_ids <> normalized_update_ids then
    raise exception 'Brain Dump changed before compaction.';
  end if;

  next_version := public.apply_encrypted_mutation(
    p_mutation_id,
    p_device_id,
    p_device_proof,
    'brain_dump_bullet',
    p_bullet_id,
    'upsert',
    p_ciphertext,
    p_field_versions,
    0,
    p_created_at
  );

  delete from public.encrypted_record_history
  where user_id = auth.uid()
    and record_type = 'brain_dump_update'
    and record_id = any(normalized_update_ids);

  delete from public.encrypted_records
  where user_id = auth.uid()
    and record_type = 'brain_dump_update'
    and record_id = any(normalized_update_ids);

  update public.sync_mutations
  set ciphertext = null
  where user_id = auth.uid()
    and record_type = 'brain_dump_update'
    and record_id = any(normalized_update_ids)
    and applied_at is not null;

  return next_version;
end;
$$;

revoke execute on function public.compact_brain_dump_updates(
  uuid, uuid, text, text, jsonb, jsonb, timestamptz, text[]
) from public, anon;
grant execute on function public.compact_brain_dump_updates(
  uuid, uuid, text, text, jsonb, jsonb, timestamptz, text[]
) to authenticated;
