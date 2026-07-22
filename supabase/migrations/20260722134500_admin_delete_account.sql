create or replace function public.admin_delete_account(p_handle text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_count integer;
begin
  delete from public.accounts where handle = lower(p_handle);
  get diagnostics deleted_count = row_count;
  return deleted_count = 1;
end;
$$;

revoke all on function public.admin_delete_account(text) from public, anon, authenticated;
grant execute on function public.admin_delete_account(text) to service_role;
