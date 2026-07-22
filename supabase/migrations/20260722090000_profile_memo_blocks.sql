-- メモを iOSメモ風のブロック（行/段落）配列に拡張する。
-- 各ブロック: { id, text, heading(bool), bold(bool), underline(bool),
--               align('left'|'center'|'right'), color(''|red|orange|green|blue|purple) }
-- HTMLは保存せず、書式はキーで持つ（公開ページでのXSSを避ける）。
-- 旧: memo は文字列だった。クライアントの normalizeProfileContent が文字列→1ブロックへ
-- 移行するため、DB側は空(未指定)なら空配列として保存する。

create or replace function update_profile_content(
  p_handle text, p_pass text, p_content jsonb
)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  photo jsonb;
  block jsonb;
  v_memo jsonb := coalesce(p_content->'memo', '[]'::jsonb);
  v_total int := 0;
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
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

  -- 旧クライアント（メモを文字列で送る版）との互換: 文字列は1ブロックへ移行する。
  -- これによりデプロイ端境期やキャッシュされた旧クライアントの保存が壊れない。
  if jsonb_typeof(v_memo) = 'string' then
    if btrim(p_content->>'memo') = '' then
      v_memo := '[]'::jsonb;
    else
      v_memo := jsonb_build_array(jsonb_build_object(
        'id', 'memo-0', 'text', left(p_content->>'memo', 300),
        'heading', false, 'bold', false, 'underline', false,
        'align', 'left', 'color', ''));
    end if;
  end if;
  if jsonb_typeof(v_memo) <> 'array' then raise exception 'invalid memo'; end if;
  if jsonb_array_length(v_memo) > 20 then raise exception 'too many memo blocks'; end if;
  for block in select value from jsonb_array_elements(v_memo) loop
    if coalesce(jsonb_typeof(block), 'null') <> 'object'
       or coalesce(jsonb_typeof(block->'text'), 'null') <> 'string'
       or char_length(block->>'text') > 300
       or coalesce(jsonb_typeof(block->'heading'), 'null') <> 'boolean'
       or coalesce(jsonb_typeof(block->'bold'), 'null') <> 'boolean'
       or coalesce(jsonb_typeof(block->'underline'), 'null') <> 'boolean'
       or coalesce(block->>'align','') not in ('left','center','right')
       or coalesce(block->>'color','') not in ('','red','orange','green','blue','purple')
       or length(coalesce(block->>'id','')) > 100 then
      raise exception 'invalid memo block';
    end if;
    v_total := v_total + char_length(block->>'text');
  end loop;
  if v_total > 2000 then raise exception 'memo too long'; end if;

  update profiles set content=jsonb_build_object(
    'photos', p_content->'photos',
    'memo', v_memo
  ) where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

revoke all on function update_profile_content(text,text,jsonb) from public;
grant execute on function update_profile_content(text,text,jsonb) to anon;
