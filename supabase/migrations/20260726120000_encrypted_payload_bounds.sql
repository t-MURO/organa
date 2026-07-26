create or replace function public.enforce_encrypted_payload_bounds()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  field_count integer;
begin
  if new.ciphertext is not null and (
    jsonb_typeof(new.ciphertext) <> 'object' or
    pg_column_size(new.ciphertext) > 4194304
  ) then
    raise exception 'Encrypted record payload exceeds the allowed size.';
  end if;

  if jsonb_typeof(new.field_versions) <> 'object' or
     pg_column_size(new.field_versions) > 65536 then
    raise exception 'Encrypted record field metadata exceeds the allowed size.';
  end if;

  select count(*)
    into field_count
    from jsonb_object_keys(new.field_versions);

  if field_count > 128 or exists (
    select 1
    from jsonb_object_keys(new.field_versions) as field(field_name)
    where length(field.field_name) > 80
       or field.field_name !~ '^[A-Za-z][A-Za-z0-9_]*$'
  ) then
    raise exception 'Encrypted record field metadata is invalid.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_encrypted_payload_bounds()
  from public, anon, authenticated;

create trigger encrypted_records_enforce_payload_bounds
before insert or update of ciphertext, field_versions
on public.encrypted_records
for each row execute function public.enforce_encrypted_payload_bounds();

create trigger sync_mutations_enforce_payload_bounds
before insert
on public.sync_mutations
for each row execute function public.enforce_encrypted_payload_bounds();
