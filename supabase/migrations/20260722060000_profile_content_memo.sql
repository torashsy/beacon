-- プロフィールに「メモ」(content.memo) を追加。写真の下に表示する自由記述。
-- update_profile_content に memo（文字列・最大800字）の受け入れと保存を追加する。
-- 既存の photos の扱いは変更しない。memo が無いペイロードでも壊れないよう任意扱い。

create or replace function update_profile_content(
  p_handle text, p_pass text, p_content jsonb
)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  photo jsonb;
  v_memo text := coalesce(p_content->>'memo', '');
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if coalesce(jsonb_typeof(p_content), 'null') <> 'object'
     or coalesce(jsonb_typeof(p_content->'photos'), 'null') <> 'array' then
    raise exception 'invalid content';
  end if;
  if jsonb_array_length(p_content->'photos') > 5 then raise exception 'too many photos'; end if;
  if p_content ? 'memo' and coalesce(jsonb_typeof(p_content->'memo'), 'null') <> 'string' then
    raise exception 'invalid memo';
  end if;
  if char_length(v_memo) > 800 then raise exception 'memo too long'; end if;
  for photo in select value from jsonb_array_elements(p_content->'photos') loop
    if coalesce(jsonb_typeof(photo), 'null') <> 'object'
       or length(coalesce(photo->>'id','')) not between 1 and 100
       or length(coalesce(photo->>'url','')) not between 1 and 2000
       or coalesce(photo->>'url','') !~ '^https?://' then
      raise exception 'invalid photo';
    end if;
  end loop;
  update profiles set content=jsonb_build_object(
    'photos', p_content->'photos',
    'memo', v_memo
  ) where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

revoke all on function update_profile_content(text,text,jsonb) from public;
grant execute on function update_profile_content(text,text,jsonb) to anon;
