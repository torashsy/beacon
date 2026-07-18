-- 初回マイグレーション適用済み環境でも、不足キーを確実に拒否する。
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
  note jsonb;
begin
  if not _check_pass(p_handle, p_pass) then raise exception 'auth'; end if;
  if coalesce(jsonb_typeof(p_content), 'null') <> 'object'
     or coalesce(jsonb_typeof(p_content->'photos'), 'null') <> 'array'
     or coalesce(jsonb_typeof(p_content->'notes'), 'null') <> 'array' then
    raise exception 'invalid content';
  end if;
  if jsonb_array_length(p_content->'photos') > 5 then raise exception 'too many photos'; end if;
  if jsonb_array_length(p_content->'notes') > 10 then raise exception 'too many notes'; end if;
  for photo in select value from jsonb_array_elements(p_content->'photos') loop
    if coalesce(jsonb_typeof(photo), 'null') <> 'object'
       or length(coalesce(photo->>'id','')) not between 1 and 100
       or length(coalesce(photo->>'url','')) not between 1 and 2000
       or coalesce(photo->>'url','') !~ '^https?://' then
      raise exception 'invalid photo';
    end if;
  end loop;
  for note in select value from jsonb_array_elements(p_content->'notes') loop
    if coalesce(jsonb_typeof(note), 'null') <> 'object'
       or length(coalesce(note->>'id','')) not between 1 and 100
       or length(coalesce(note->>'text','')) not between 1 and 1000
       or coalesce(note->>'align','') not in ('left','center','right')
       or coalesce(jsonb_typeof(note->'bold'), 'null') <> 'boolean'
       or coalesce(jsonb_typeof(note->'underline'), 'null') <> 'boolean' then
      raise exception 'invalid note';
    end if;
  end loop;
  update profiles
    set content = jsonb_build_object(
      'photos', p_content->'photos',
      'notes', p_content->'notes'
    )
    where handle = lower(p_handle);
  update accounts set updated_at = now() where handle = lower(p_handle);
end
$$;

revoke all on function public.update_profile_content(text,text,jsonb) from public;
grant execute on function public.update_profile_content(text,text,jsonb) to anon, authenticated;
