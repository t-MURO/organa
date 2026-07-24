create or replace function public.get_account_deletion_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  deletion_request public.account_deletion_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = auth.uid()
  ) then
    return jsonb_build_object('state', 'deleted');
  end if;

  select *
    into deletion_request
    from public.account_deletion_requests
    where user_id = auth.uid()
      and cancelled_at is null
      and completed_at is null;

  if deletion_request.user_id is null then
    return jsonb_build_object('state', 'none');
  end if;

  return jsonb_build_object(
    'state', 'pending',
    'requestedAt', deletion_request.requested_at,
    'executeAfter', deletion_request.execute_after,
    'due', deletion_request.execute_after <= now()
  );
end;
$$;

revoke execute on function public.get_account_deletion_status()
  from public, anon;
grant execute on function public.get_account_deletion_status()
  to authenticated;
