import { BeaconApp } from "@/components/beacon/BeaconApp";

/**
 * トップ。未ログインなら認証、ログイン後はプロフィール編集（リンク/カレンダー）・
 * フォロー中・使い方。認証はパスキーで行い、書込は失効可能なセッションを
 * サーバーRPCで検証する（lib/beacon/rpc.ts）。
 * 公開ページの見た目は /@{handle} で確認できる。
 */
export default function HomePage() {
  return <BeaconApp />;
}
