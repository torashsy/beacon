import { AdminPanel } from "@/components/admin/AdminPanel";

/**
 * 運営用の管理画面。データ操作はすべて admin Edge Function 経由で、
 * 「自分の via-mi セッション＋ADMIN_HANDLES 許可リスト」で認証する。
 * 公開導線からはリンクせず、索引もさせない。
 */
export const metadata = {
  title: "管理 · via-mi",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminPanel />;
}
