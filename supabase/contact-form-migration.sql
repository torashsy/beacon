-- 問い合わせ・通報フォーム。内容は非公開で、Supabase Dashboardから運営者だけが確認する。
create table if not exists contact_submissions (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('inquiry','report','privacy','other')),
  email text default '',
  message text not null,
  page_url text default '',
  client_ip text default 'unknown',
  status text not null default 'new' check (status in ('new','reviewing','closed')),
  created_at timestamptz not null default now()
);
alter table contact_submissions enable row level security;
revoke all on contact_submissions from anon, authenticated;

create table if not exists contact_rate_limits (
  ip text not null,
  day date not null default current_date,
  n integer not null default 0,
  primary key (ip, day)
);
alter table contact_rate_limits enable row level security;
revoke all on contact_rate_limits from anon, authenticated;

create or replace function submit_contact(
  p_category text,
  p_email text,
  p_message text,
  p_page_url text default '',
  p_website text default ''
)
returns uuid language plpgsql security definer as $$
declare
  client_ip text := 'unknown';
  attempts integer;
  submission_id uuid;
begin
  -- Botが自動入力しやすい非表示フィールド。成功に見せて保存しない。
  if length(trim(coalesce(p_website,''))) > 0 then return gen_random_uuid(); end if;
  if p_category not in ('inquiry','report','privacy','other') then raise exception 'invalid category'; end if;
  if length(trim(coalesce(p_message,''))) < 20 then raise exception 'message too short'; end if;
  if length(p_message) > 4000 then raise exception 'message too long'; end if;
  if length(coalesce(p_email,'')) > 254 then raise exception 'email too long'; end if;
  if length(trim(coalesce(p_email,''))) > 0
     and trim(p_email) !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    then raise exception 'invalid email';
  end if;
  if length(coalesce(p_page_url,'')) > 2000 then raise exception 'url too long'; end if;

  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then client_ip := 'unknown';
  end;

  insert into contact_rate_limits(ip,n) values (client_ip,1)
    on conflict (ip,day) do update set n=contact_rate_limits.n+1
    returning n into attempts;
  if attempts > 5 then raise exception 'contact rate limit'; end if;

  insert into contact_submissions(category,email,message,page_url,client_ip)
    values (p_category,trim(coalesce(p_email,'')),trim(p_message),trim(coalesce(p_page_url,'')),client_ip)
    returning id into submission_id;
  return submission_id;
end $$;

revoke all on function submit_contact(text,text,text,text,text) from public, anon, authenticated;
grant execute on function submit_contact(text,text,text,text,text) to anon;
