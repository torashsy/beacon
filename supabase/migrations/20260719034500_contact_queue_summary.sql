-- Expose only non-sensitive queue statistics to the service role.
-- Contact contents, addresses, URLs and IP addresses never leave Supabase.
create or replace function get_contact_queue_summary()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'pending_count',
      count(*) filter (where status in ('new', 'reviewing')),
    'new_count',
      count(*) filter (where status = 'new'),
    'reviewing_count',
      count(*) filter (where status = 'reviewing'),
    'oldest_pending_at',
      min(created_at) filter (where status in ('new', 'reviewing'))
  )
  from contact_submissions;
$$;

revoke all on function get_contact_queue_summary()
  from public, anon, authenticated;
grant execute on function get_contact_queue_summary() to service_role;
