create or replace function public.lock_compactable_brain_dump_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  owner_id uuid;
  target_deleted boolean;
  target_record_id text;
  target_record_type text;
  matched text[];
begin
  if tg_op = 'DELETE' then
    owner_id := old.user_id;
    target_deleted := old.deleted;
    target_record_id := old.record_id;
    target_record_type := old.record_type;
  else
    owner_id := new.user_id;
    target_deleted := new.deleted;
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

      if tg_op <> 'DELETE' and not target_deleted and not exists (
        select 1
        from public.encrypted_records as parent_record
        where parent_record.user_id = owner_id
          and parent_record.record_type = 'brain_dump_bullet'
          and parent_record.record_id = matched[1]
          and not parent_record.deleted
      ) then
        raise exception 'The Brain Dump bullet is unavailable.';
      end if;
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

create or replace function public.purge_deleted_brain_dump_updates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  update_prefix text;
begin
  if new.record_type <> 'brain_dump_bullet' or
     not new.deleted or
     new.record_id !~ '^thought-[a-z0-9]+-[a-z0-9]+$' then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.user_id::text || ':' || new.record_id, 0)
  );
  update_prefix := 'brain-update:' || new.record_id || ':';

  delete from public.encrypted_record_history
  where user_id = new.user_id
    and record_type = 'brain_dump_update'
    and left(record_id, length(update_prefix)) = update_prefix;

  delete from public.encrypted_records
  where user_id = new.user_id
    and record_type = 'brain_dump_update'
    and left(record_id, length(update_prefix)) = update_prefix;

  update public.sync_mutations
  set ciphertext = null
  where user_id = new.user_id
    and record_type = 'brain_dump_update'
    and left(record_id, length(update_prefix)) = update_prefix
    and applied_at is not null;

  return null;
end;
$$;

revoke execute on function public.purge_deleted_brain_dump_updates()
  from public, anon, authenticated;

create trigger encrypted_records_purge_deleted_brain_dump_updates
after insert or update of deleted on public.encrypted_records
for each row execute function public.purge_deleted_brain_dump_updates();
