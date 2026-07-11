-- ============================================================
-- Beacon: サーバー側の入力検証の欠落を修正。SQL Editor で Run（冪等）。
-- クライアント側のUIは正しく制限しているが、RPCを直接叩けば無制限だった:
--   - create_account: ハンドルの文字種・長さが未検証（任意の文字列で作成可能）
--   - update_profile: 名前・自己紹介・ステータス・画像URLの長さが未検証
--   - save_channels : リンク件数・各フィールド長が未検証
-- いずれもDB/表示の肥大化・不正利用の温床になるため、寛容だが有限な上限を設ける。
-- ============================================================

create or replace function create_account(p_handle text, p_pass text)
returns text language plpgsql security definer as $$
declare
  rc text;
  client_ip text := 'unknown';
  attempts int;
begin
  begin
    client_ip := trim(split_part(
      coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''),
      ',', 1));
    if client_ip = '' then client_ip := 'unknown'; end if;
  exception when others then
    client_ip := 'unknown';
  end;

  insert into signup_attempts(ip, n) values (client_ip, 1)
    on conflict (ip, day) do update set n = signup_attempts.n + 1
    returning n into attempts;
  if attempts > 20 then
    raise exception 'too many accounts created from this network today';
  end if;

  if length(p_pass) < 6 then raise exception 'pass too short'; end if;
  if lower(p_handle) !~ '^[a-z0-9_]{3,20}$' then raise exception 'invalid handle'; end if;
  if lower(p_handle) = any(array[
    'admin','administrator','official','beacon','support','help','staff',
    'moderator','mod','root','api','system','null','undefined','terms',
    'privacy','robots','test','www','mail'
  ]) then
    raise exception 'taken';
  end if;
  if exists(select 1 from accounts where handle=lower(p_handle)) then
    raise exception 'taken';
  end if;
  rc := upper(encode(gen_random_bytes(6),'hex'));
  insert into accounts(handle,pass_hash,rc_hash)
    values (lower(p_handle), crypt(p_pass, gen_salt('bf')), crypt(rc, gen_salt('bf')));
  insert into profiles(handle) values (lower(p_handle));
  return rc;
end $$;

create or replace function update_profile(p_handle text, p_pass text,
  p_name text, p_bio text, p_emoji text, p_theme int, p_av text, p_bn text,
  p_status text default null)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if length(coalesce(p_name,''))   > 100  then raise exception 'name too long'; end if;
  if length(coalesce(p_bio,''))    > 1000 then raise exception 'bio too long'; end if;
  if length(coalesce(p_status,'')) > 200  then raise exception 'status too long'; end if;
  if length(coalesce(p_av,'')) > 2000 or length(coalesce(p_bn,'')) > 2000 then
    raise exception 'image url too long';
  end if;
  update profiles set name=p_name, bio=p_bio, emoji=p_emoji, theme=p_theme,
    av_url=p_av, bn_url=p_bn,
    status = coalesce(p_status, status),
    status_at = case when p_status is not null and p_status <> coalesce(status,'')
                     then now() else status_at end
    where handle=lower(p_handle);
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;

create or replace function save_channels(p_handle text, p_pass text, p_channels jsonb)
returns void language plpgsql security definer as $$
begin
  if not _check_pass(p_handle,p_pass) then raise exception 'auth'; end if;
  if jsonb_typeof(p_channels) <> 'array' then raise exception 'invalid channels'; end if;
  if jsonb_array_length(p_channels) > 50 then raise exception 'too many channels'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_channels) c
    where length(coalesce(c->>'url',''))   > 2000
       or length(coalesce(c->>'label','')) > 100
       or length(coalesce(c->>'desc',''))  > 300
       or length(coalesce(c->>'img',''))   > 2000
  ) then
    raise exception 'field too long';
  end if;
  delete from channels where handle=lower(p_handle);
  insert into channels(handle,type,url,label,descr,status,position,img_url)
  select lower(p_handle), c->>'type', c->>'url',
         coalesce(c->>'label',''), coalesce(c->>'desc',''),
         coalesce(c->>'status','live'), (row_number() over ())::int,
         coalesce(c->>'img','')
  from jsonb_array_elements(p_channels) c;
  update accounts set updated_at=now() where handle=lower(p_handle);
end $$;
