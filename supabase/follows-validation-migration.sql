-- ============================================================
-- Beacon: save_my_follows の入力検証欠落を修正。SQL Editor で Run（冪等）。
-- 修正前は認証さえ通れば p_targets に任意の jsonb を渡せたため:
--   1) 巨大な配列を1回のRPCで渡して follows_server の行数を無制限に増やせた
--   2) 各要素も任意長の文字列を格納できた（target 列に上限が無い）
-- target は本来「フォロー先のハンドル」なので、ハンドルと同じ形式
-- （^[a-z0-9_]{3,20}$）に一致する要素のみ受け付け、件数にも上限を設ける。
-- 形式に合わない要素は raise せず黙って捨てる（既存クライアントの
-- fire-and-forget な同期呼び出しを壊さないため）。
-- ============================================================

create or replace function save_my_follows(p_handle text, p_pass text, p_targets jsonb)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if jsonb_typeof(p_targets) <> 'array' then raise exception 'invalid targets'; end if;
  if jsonb_array_length(p_targets) > 500 then raise exception 'too many follows'; end if;
  delete from follows_server where handle=lower(p_handle);
  insert into follows_server(handle, target)
    select lower(p_handle), lower(value) from jsonb_array_elements_text(p_targets)
    where lower(value) ~ '^[a-z0-9_]{3,20}$'
    on conflict do nothing;
end $$;
