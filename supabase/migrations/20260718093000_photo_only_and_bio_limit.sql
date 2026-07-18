-- メモを公開機能から外し、写真だけを保存する。自己紹介はUIと同じ800字にする。
alter table public.profiles
  alter column content set default '{"photos":[]}'::jsonb;

update public.profiles
set content = jsonb_build_object(
  'photos',
  case
    when jsonb_typeof(content->'photos') = 'array' then content->'photos'
    else '[]'::jsonb
  end
);

create or replace function public.update_profile_content(
  p_handle text,
  p_pass text,
  p_content jsonb
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  photo jsonb;
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;
  if coalesce(jsonb_typeof(p_content), 'null') <> 'object'
     or coalesce(jsonb_typeof(p_content->'photos'), 'null') <> 'array' then
    raise exception 'invalid content';
  end if;
  if jsonb_array_length(p_content->'photos') > 5 then raise exception 'too many photos'; end if;
  for photo in select value from jsonb_array_elements(p_content->'photos') loop
    if coalesce(jsonb_typeof(photo), 'null') <> 'object'
       or length(coalesce(photo->>'id','')) not between 1 and 100
       or length(coalesce(photo->>'url','')) not between 1 and 2000
       or coalesce(photo->>'url','') !~ '^https?://' then
      raise exception 'invalid photo';
    end if;
  end loop;
  update profiles
    set content = jsonb_build_object('photos', p_content->'photos')
    where handle = lower(p_handle);
  update accounts set updated_at = now() where handle = lower(p_handle);
end
$$;

revoke all on function public.update_profile_content(text,text,jsonb) from public;
grant execute on function public.update_profile_content(text,text,jsonb) to anon, authenticated;

create or replace function public.update_profile(
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
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_name,''))   > 100 then raise exception 'name too long'; end if;
  if length(coalesce(p_bio,''))    > 800 then raise exception 'bio too long'; end if;
  if length(coalesce(p_status,'')) > 200 then raise exception 'status too long'; end if;
  if p_theme not between 0 and 11 or p_av_theme not between 0 and 11 then
    raise exception 'invalid theme';
  end if;
  if length(coalesce(p_av,'')) > 2000 or length(coalesce(p_bn,'')) > 2000 then
    raise exception 'image url too long';
  end if;
  update profiles
  set name=p_name,
      bio=p_bio,
      emoji=p_emoji,
      theme=p_theme,
      av_theme=p_av_theme,
      av_url=p_av,
      bn_url=p_bn,
      status=coalesce(p_status,status),
      status_at=case
        when p_status is not null and p_status <> coalesce(status,'') then now()
        else status_at
      end
  where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end
$$;

revoke all on function public.update_profile(text,text,text,text,text,int,text,text,text,int) from public;
grant execute on function public.update_profile(text,text,text,text,text,int,text,text,text,int) to anon, authenticated;
