export interface SellingPoint {
  emoji: string;
  title: string;
  text: string;
}

/** トップページと使い方ページで共通して見せるセールスポイント。 */
export const SELLING_POINTS: SellingPoint[] = [
  {
    emoji: "🔗",
    title: "ぜんぶ、ひとつのURLに。",
    text: "SNSやリンクを1ページに。\nあなたのページはQRコードで簡単に共有できます。",
  },
  {
    emoji: "🔑",
    title: "Face ID・生体認証で3秒ログイン",
    text: "パスワードは要りません。\n生体認証（パスキー）で今すぐはじめましょう。",
  },
  {
    emoji: "🗓",
    title: "カレンダーも載せられる。更新も伝わる。",
    text: "イベントや予定を共有しましょう。\n更新すると、あなたのフォロワーに通知が届きます。",
  },
  {
    emoji: "🕊",
    title: "渡した人だけに届く。",
    text: "あなたを見つけられるのは、IDかURLを知っているひとだけ。\n届けたいひとに、届けましょう。",
  },
];
