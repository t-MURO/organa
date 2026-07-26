-- Keep platform RLS automation internal to DDL event triggers.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute
      'revoke execute on function public.rls_auto_enable() ' ||
      'from public, anon, authenticated';
  end if;
end;
$$;

alter policy account_keys_owner
  on public.account_keys
  using ((select auth.uid()) = user_id);

alter policy devices_owner
  on public.devices
  using ((select auth.uid()) = user_id);

alter policy device_approvals_owner
  on public.device_approvals
  using ((select auth.uid()) = user_id);

alter policy encrypted_records_owner
  on public.encrypted_records
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and
    exists (
      select 1
      from public.devices
      where devices.user_id = (select auth.uid())
        and devices.id = encrypted_records.updated_by
        and devices.revoked_at is null
        and devices.trusted_at is not null
    )
  );

alter policy sync_mutations_owner
  on public.sync_mutations
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id and
    exists (
      select 1
      from public.devices
      where devices.user_id = (select auth.uid())
        and devices.id = sync_mutations.device_id
        and devices.revoked_at is null
        and devices.trusted_at is not null
    )
  );

alter policy encrypted_record_history_owner
  on public.encrypted_record_history
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy account_deletion_owner
  on public.account_deletion_requests
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists encrypted_records_user_updated_by_idx
  on public.encrypted_records (user_id, updated_by);

create index if not exists sync_mutations_user_device_idx
  on public.sync_mutations (user_id, device_id);

create policy web_push_reminders_no_direct_access
  on public.web_push_reminders
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy web_push_subscriptions_no_direct_access
  on public.web_push_subscriptions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);
