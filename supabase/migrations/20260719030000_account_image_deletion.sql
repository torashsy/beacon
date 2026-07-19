-- Account deletion is handled by the delete-account Edge Function.
-- It removes avatars/{handle} before calling delete_account so a Storage
-- failure never leaves an unrecoverable orphan.

grant execute on function delete_account(text, text) to service_role;

-- The previous scheduled cleanup depended on the removed synchronous pg_net
-- response API. Immediate deletion makes that broken fallback unnecessary.
do $$
declare
  cleanup_job_id bigint;
begin
  for cleanup_job_id in
    select jobid from cron.job where jobname = 'cleanup-orphaned-avatars'
  loop
    perform cron.unschedule(cleanup_job_id);
  end loop;
exception
  when undefined_table or invalid_schema_name then null;
end
$$;

drop function if exists cleanup_orphaned_avatars();
