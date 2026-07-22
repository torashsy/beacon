-- プロフィールに最大5個のハッシュタグを持たせ、タグの完全一致で探せるようにする。
alter table profiles
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists profiles_tags_gin_idx on profiles using gin(tags);

drop function if exists update_profile(text,text,text,text,text,int,text,text,text,int,text);

create or replace function update_profile(p_handle text, p_pass text,
  p_name text, p_bio text, p_emoji text, p_theme int, p_av text, p_bn text,
  p_status text default null, p_av_theme int default 0,
  p_color_theme text default 'sky', p_tags text[] default '{}'::text[])
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  normalized_tags text[];
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_name,'')) > 100 then raise exception 'name too long'; end if;
  if length(coalesce(p_bio,'')) > 800 then raise exception 'bio too long'; end if;
  if length(coalesce(p_status,'')) > 200 then raise exception 'status too long'; end if;
  if p_theme not between 0 and 11 or p_av_theme not between 0 and 11 then raise exception 'invalid theme'; end if;
  if coalesce(p_color_theme, 'sky') not in ('peach','mint','sky','lilac','citrus','mono') then
    raise exception 'invalid color theme';
  end if;
  if length(coalesce(p_av,'')) > 2000 or length(coalesce(p_bn,'')) > 2000 then
    raise exception 'image url too long';
  end if;
  if cardinality(coalesce(p_tags, '{}'::text[])) > 5 then raise exception 'too many tags'; end if;
  if exists (
    select 1 from unnest(coalesce(p_tags, '{}'::text[])) t
    where length(trim(t)) not between 1 and 20 or t ~ '[[:space:]#,、/]'
  ) then raise exception 'invalid tag'; end if;

  select coalesce(array_agg(tag order by first_pos), '{}'::text[])
    into normalized_tags
  from (
    select lower(trim(t)) as tag, min(ord) as first_pos
    from unnest(coalesce(p_tags, '{}'::text[])) with ordinality as u(t, ord)
    group by lower(trim(t))
  ) normalized;

  update profiles set name=p_name, bio=p_bio, emoji=p_emoji, theme=p_theme, av_theme=p_av_theme,
    av_url=p_av, bn_url=p_bn, color_theme=coalesce(p_color_theme, 'sky'), tags=normalized_tags,
    status=coalesce(p_status,status),
    status_at=case when p_status is not null and p_status <> coalesce(status,'') then now() else status_at end
    where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

revoke all on function update_profile(text,text,text,text,text,int,text,text,text,int,text,text[]) from public, authenticated;
grant execute on function update_profile(text,text,text,text,text,int,text,text,text,int,text,text[]) to anon;

create or replace function search_profiles_by_tag(p_tag text, p_limit int default 20)
returns table(handle text, name text, emoji text, av_url text, av_theme int)
language sql security definer stable set search_path = public as $$
  select p.handle, p.name, p.emoji, p.av_url, p.av_theme
  from profiles p
  join accounts a on a.handle = p.handle
  where lower(trim(p_tag)) = any(p.tags)
    and length(trim(p_tag)) between 1 and 20
    and not exists (
      select 1 from account_moderation m where m.handle = p.handle and m.suspended
    )
  order by a.updated_at desc, p.handle
  limit least(greatest(coalesce(p_limit, 20), 1), 20);
$$;

revoke all on function search_profiles_by_tag(text,int) from public, authenticated;
grant execute on function search_profiles_by_tag(text,int) to anon;
