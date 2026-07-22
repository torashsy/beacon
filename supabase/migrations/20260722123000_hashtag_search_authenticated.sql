-- ハッシュタグ検索はフォロー状態に関係なく公開情報を返す。
-- Route Handlerはanonで呼ぶが、今後の認証済みクライアントでも同じ動作にする。
grant execute on function search_profiles_by_tag(text,int) to authenticated;
