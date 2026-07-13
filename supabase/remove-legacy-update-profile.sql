-- 旧8引数版 update_profile が残っている環境向け。
-- 新9引数版との曖昧なRPC解決と、旧版経由の入力検証回避を防ぐ。
drop function if exists public.update_profile(
  text, text, text, text, text, integer, text, text
);
