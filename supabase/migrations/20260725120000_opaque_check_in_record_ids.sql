create or replace function public.enforce_opaque_check_in_record_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.record_type = 'check_in' and
     not new.deleted and
     new.record_id !~ '^rid1_[0-9a-f]{64}$' then
    raise exception 'Check-In record IDs must be opaque.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_opaque_check_in_record_id()
  from public, anon, authenticated;

create trigger encrypted_records_enforce_opaque_check_in_id
before insert or update of record_type, record_id, deleted
on public.encrypted_records
for each row execute function public.enforce_opaque_check_in_record_id();

create or replace function public.purge_deleted_legacy_check_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.record_type <> 'check_in' or
     not new.deleted or
     new.record_id !~ '^check-in-[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    return null;
  end if;

  delete from public.encrypted_record_history
  where user_id = new.user_id
    and record_type = new.record_type
    and record_id = new.record_id;

  delete from public.sync_mutations
  where user_id = new.user_id
    and record_type = new.record_type
    and record_id = new.record_id;

  delete from public.encrypted_records
  where user_id = new.user_id
    and record_type = new.record_type
    and record_id = new.record_id;

  return null;
end;
$$;

revoke execute on function public.purge_deleted_legacy_check_in()
  from public, anon, authenticated;

create trigger encrypted_records_purge_deleted_legacy_check_in
after insert or update of deleted on public.encrypted_records
for each row execute function public.purge_deleted_legacy_check_in();
