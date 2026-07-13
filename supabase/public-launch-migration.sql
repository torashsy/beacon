-- Public launch: contact triage and account suspension controls.

alter table contact_submissions
  add column if not exists status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'rejected')),
  add column if not exists admin_note text not null default '',
  add column if not exists handled_at timestamptz;

create table if not exists account_moderation (
  handle text primary key references accounts(handle) on delete cascade,
  suspended boolean not null default false,
  reason text not null default '',
  updated_at timestamptz not null default now()
);
alter table account_moderation enable row level security;
revoke all on account_moderation from anon, authenticated;

create table if not exists moderation_log (
  id bigserial primary key,
  handle text not null,
  action text not null check (action in ('suspend', 'restore')),
  reason text not null default '',
  created_at timestamptz not null default now()
);
alter table moderation_log enable row level security;
revoke all on moderation_log from anon, authenticated;

create or replace function set_account_suspension(
  p_handle text,
  p_suspended boolean,
  p_reason text default ''
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from accounts where handle=lower(p_handle)) then
    raise exception 'not found';
  end if;
  if length(coalesce(p_reason,'')) > 500 then raise exception 'reason too long'; end if;

  insert into account_moderation(handle,suspended,reason,updated_at)
    values(lower(p_handle),p_suspended,trim(coalesce(p_reason,'')),now())
    on conflict(handle) do update set
      suspended=excluded.suspended,
      reason=excluded.reason,
      updated_at=now();
  insert into moderation_log(handle,action,reason)
    values(lower(p_handle),case when p_suspended then 'suspend' else 'restore' end,
           trim(coalesce(p_reason,'')));
  if p_suspended then delete from sessions where handle=lower(p_handle); end if;
end $$;

revoke all on function set_account_suspension(text,boolean,text)
  from public, anon, authenticated;
grant execute on function set_account_suspension(text,boolean,text) to service_role;

create or replace function set_contact_status(
  p_id bigint,
  p_status text,
  p_note text default ''
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('new','reviewing','resolved','rejected') then
    raise exception 'invalid status';
  end if;
  if length(coalesce(p_note,'')) > 2000 then raise exception 'note too long'; end if;
  update contact_submissions set
    status=p_status,
    admin_note=trim(coalesce(p_note,'')),
    handled_at=case when p_status in ('resolved','rejected') then now() else null end
    where id=p_id;
end $$;

revoke all on function set_contact_status(bigint,text,text)
  from public, anon, authenticated;
grant execute on function set_contact_status(bigint,text,text) to service_role;

create or replace function get_public_page(p_handle text)
returns jsonb language sql security definer stable set search_path = public as $$
  select case
    when not exists (select 1 from profiles where handle = lower(p_handle))
      or exists (
        select 1 from account_moderation
        where handle=lower(p_handle) and suspended
      )
      then null
    else jsonb_build_object(
      'profile',
        (select to_jsonb(p) from profiles p where p.handle = lower(p_handle)),
      'channels',
        coalesce(
          (select jsonb_agg(to_jsonb(c) order by c.position, c.id)
             from channels c where c.handle = lower(p_handle)),
          '[]'::jsonb),
      'cal',
        coalesce(
          (select jsonb_agg(jsonb_build_object('d', cp.d, 'memo', cp.memo)
                             order by cp.d)
             from cal_public cp where cp.handle = lower(p_handle)),
          '[]'::jsonb)
    )
  end;
$$;

create or replace function get_follower_count(p_handle text)
returns bigint language sql security definer stable set search_path = public as $$
  select case
    when lower(p_handle) !~ '^[a-z0-9_]{3,20}$'
      or exists (
        select 1 from account_moderation
        where handle=lower(p_handle) and suspended
      )
      then 0
    else (select count(*) from follows_server where target = lower(p_handle))
  end;
$$;

revoke all on function get_public_page(text) from public, authenticated;
grant execute on function get_public_page(text) to anon;
revoke all on function get_follower_count(text) from public, authenticated;
grant execute on function get_follower_count(text) to anon;
