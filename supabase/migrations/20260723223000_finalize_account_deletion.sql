grant select (
  user_id,
  execute_after,
  cancelled_at,
  completed_at
) on public.account_deletion_requests to service_role;
