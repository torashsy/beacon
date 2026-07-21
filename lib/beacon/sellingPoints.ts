import type { FeatureIconName } from "@/components/beacon/icons";

export interface SellingPoint {
  icon: FeatureIconName;
  title: string;
  text: string;
}

/** トップページと使い方ページで共通して見せるセールスポイント。 */
export const SELLING_POINTS: SellingPoint[] = [
  {
    icon: "link",
    title: "ぜんぶ、ひとつのURLに。",
    text: "SNSやリンクを1ページに。\nあなたのページはQRコードで簡単に共有できます。",
  },
  {
    icon: "key",
    title: "Face ID・生体認証ですぐログイン。",
    text: "パスワードは要りません。\n生体認証（パスキー）で今すぐはじめましょう。",
  },
  {
    icon: "calendar",
    title: "カレンダーも載せられる。更新も伝わる。",
    text: "イベントや予定を共有しましょう。\n更新すると、あなたのフォロワーに通知が届きます。",
  },
];
