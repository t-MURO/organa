create or replace function public.configure_reminder_device(
  p_current_device_id uuid,
  p_current_device_proof text,
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

  if not public.device_proof_is_valid(
    p_current_device_id,
    p_current_device_proof
  ) then
    raise exception 'The current device proof is invalid.';
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
    set primary_reminder = false,
        notifications_enabled = false
    where user_id = auth.uid()
      and id <> p_device_id
      and revoked_at is null
      and (primary_reminder or notifications_enabled);

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
