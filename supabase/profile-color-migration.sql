-- Profile icon/header: shared 12-color palette with independently saved choices.

alter table profiles
  add column if not exists av_theme int not null default 0;

alter table profiles drop constraint if exists profiles_av_theme_check;
alter table profiles
  add constraint profiles_av_theme_check check (av_theme between 0 and 11);

drop function if exists update_profile(text,text,text,text,text,int,text,text,text);

create or replace function update_profile(
  p_handle text,
  p_pass text,
  p_name text,
  p_bio text,
  p_emoji text,
  p_theme int,
  p_av text,
  p_bn text,
  p_status text default null,
  p_av_theme int default 0
)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_name,''))   > 100  then raise exception 'name too long'; end if;
  if length(coalesce(p_bio,''))    > 1000 then raise exception 'bio too long'; end if;
  if length(coalesce(p_status,'')) > 200  then raise exception 'status too long'; end if;
  if p_theme not between 0 and 11 or p_av_theme not between 0 and 11 then
    raise exception 'invalid theme';
  end if;
  if length(coalesce(p_av,'')) > 2000 or length(coalesce(p_bn,'')) > 2000 then
    raise exception 'image url too long';
  end if;
  update profiles set
    name=p_name,
    bio=p_bio,
    emoji=p_emoji,
    theme=p_theme,
    av_theme=p_av_theme,
    av_url=p_av,
    bn_url=p_bn,
    status=coalesce(p_status,status),
    status_at=case when p_status is not null and p_status <> coalesce(status,'')
      then now() else status_at end
    where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

revoke all on function update_profile(text,text,text,text,text,int,text,text,text,int)
  from public, authenticated;
grant execute on function update_profile(text,text,text,text,text,int,text,text,text,int)
  to anon;
