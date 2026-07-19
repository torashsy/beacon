-- Optional AI-assisted reply drafts. Email addresses and IPs are never returned
-- by the draft queue and drafts are never sent automatically.
alter table contact_submissions
  add column if not exists ai_consent boolean not null default false,
  add column if not exists ai_draft text not null default '',
  add column if not exists ai_drafted_at timestamptz;

drop function if exists submit_contact(text, text, text, text, text);
create or replace function submit_contact(
  p_category text,
  p_email text,
  p_message text,
  p_page_url text default '',
  p_website text default '',
  p_ai_consent boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  client_ip text := 'unknown';
  attempts integer;
  submission_id uuid;
begin
  if length(trim(coalesce(p_website, ''))) > 0 then return gen_random_uuid(); end if;
  if p_category not in ('inquiry', 'report', 'privacy', 'other') then raise exception 'invalid category'; end if;
  if length(trim(coalesce(p_message, ''))) < 20 then raise exception 'message too short'; end if;
  if length(p_message) > 4000 then raise exception 'message too long'; end if;
  if length(coalesce(p_email, '')) > 254 then raise exception 'email too long'; end if;
  if length(trim(coalesce(p_email, ''))) > 0
     and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'invalid email';
  end if;
  if p_category = 'privacy' and length(trim(coalesce(p_email, ''))) = 0
    then raise exception 'email required';
  end if;
  if length(coalesce(p_page_url, '')) > 2000 then raise exception 'url too long'; end if;
  if p_category = 'report' and length(trim(coalesce(p_page_url, ''))) = 0
    then raise exception 'url required';
  end if;

  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then
    client_ip := 'unknown';
  end;

  insert into contact_rate_limits(ip, n) values (client_ip, 1)
    on conflict (ip, day) do update set n = contact_rate_limits.n + 1
    returning n into attempts;
  if attempts > 5 then raise exception 'contact rate limit'; end if;

  insert into contact_submissions(
    category, email, message, page_url, client_ip, ai_consent
  ) values (
    p_category,
    trim(coalesce(p_email, '')),
    trim(p_message),
    trim(coalesce(p_page_url, '')),
    client_ip,
    coalesce(p_ai_consent, false)
  )
  returning id into submission_id;
  return submission_id;
end;
$$;
revoke all on function submit_contact(text, text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function submit_contact(text, text, text, text, text, boolean) to anon;

create or replace function get_contact_draft_queue(p_limit integer default 20)
returns table(id uuid, category text, message text)
language sql
security definer
stable
set search_path = public
as $$
  select c.id, c.category, c.message
  from contact_submissions c
  where c.status in ('new', 'reviewing')
    and c.ai_consent
    and c.ai_draft = ''
  order by c.created_at
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;
revoke all on function get_contact_draft_queue(integer)
  from public, anon, authenticated;
grant execute on function get_contact_draft_queue(integer) to service_role;

create or replace function save_contact_ai_draft(p_id uuid, p_draft text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_draft, ''))) < 1 or length(p_draft) > 2000 then
    raise exception 'invalid draft';
  end if;
  update contact_submissions
  set ai_draft = trim(p_draft), ai_drafted_at = now()
  where id = p_id
    and ai_consent
    and status in ('new', 'reviewing');
  if not found then raise exception 'submission not available'; end if;
end;
$$;
revoke all on function save_contact_ai_draft(uuid, text)
  from public, anon, authenticated;
grant execute on function save_contact_ai_draft(uuid, text) to service_role;

create or replace function get_contact_queue_summary()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  select jsonb_build_object(
    'pending_count', count(*) filter (where status in ('new', 'reviewing')),
    'new_count', count(*) filter (where status = 'new'),
    'reviewing_count', count(*) filter (where status = 'reviewing'),
    'ai_waiting_count', count(*) filter (
      where status in ('new', 'reviewing') and ai_consent and ai_draft = ''
    ),
    'ai_drafted_count', count(*) filter (
      where status in ('new', 'reviewing') and ai_draft <> ''
    ),
    'oldest_pending_at', min(created_at) filter (where status in ('new', 'reviewing'))
  )
  from contact_submissions;
$$;
revoke all on function get_contact_queue_summary()
  from public, anon, authenticated;
grant execute on function get_contact_queue_summary() to service_role;
