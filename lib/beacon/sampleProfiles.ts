import type { CalMemo, Channel, Profile } from "./types";

/** ランディングの「見本」で切り替えて見せる利用例。実データではない静的プレビュー用。 */
export interface SampleProfile {
  id: string;
  label: string;
  data: {
    handle: string;
    profile: Pick<Profile, "name" | "bio" | "emoji" | "theme" | "av_theme" | "av_url" | "bn_url" | "status">;
    channels: Channel[];
    pubcal: CalMemo[];
  };
}

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    id: "personal",
    label: "趣味",
    data: {
      handle: "mihon_oshi",
      profile: {
        name: "みほ",
        bio: "04 東京 ♡\n→ あみ (@ami_mihonz) ちゃんだけ\nフォローお気軽にどうぞ！",
        emoji: "🩷",
        theme: 10,
        av_theme: 4,
        av_url: "",
        bn_url: "",
        status: "参戦しました…尊すぎて無理…🩷",
      },
      channels: [
        { type: "x", url: "#", label: "めいんアカウント", descr: "参戦記録とレポ中心", status: "live" },
        { type: "instagram", url: "#", label: "", descr: "グッズと現地の写真をまとめてます", status: "live" },
        { type: "line", url: "#", label: "オープンチャット", descr: "同担さんと交流してます", status: "live" },
      ],
      pubcal: [
        { d: "2026-08-08", memo: "みほんずワンマン参戦🩷" },
        { d: "2026-08-23", memo: "特典会、当選しますように🙏" },
        { d: "2026-09-01", memo: "新曲MV公開、朝から待機" },
      ],
    },
  },
  {
    id: "talent",
    label: "アイドル",
    data: {
      handle: "mihon_idol",
      profile: {
        name: "みほん",
        bio: "3人組アイドルユニット「みほんず」ピンク担当🌸 歌とダンスと、たまにゲーム実況も。応援してくれる方はぜひ繋がってください！",
        emoji: "🌸",
        theme: 6,
        av_theme: 5,
        av_url: "",
        bn_url: "",
        status: "8/8ワンマンのチケット発売中🎫 残りわずかです！",
      },
      channels: [
        { type: "x", url: "#", label: "メイン垢", descr: "日常とお知らせを毎日更新", status: "live" },
        { type: "instagram", url: "#", label: "", descr: "オフショット多め、たまに私服も", status: "live" },
        { type: "tiktok", url: "#", label: "ダンス動画", descr: "新曲の振り付けを中心に投稿", status: "live" },
        { type: "line", url: "#", label: "公式LINE", descr: "ライブの先行案内・特典情報はこちら", status: "live" },
      ],
      pubcal: [
        { d: "2026-08-08", memo: "ワンマンライブ 19:00〜 @渋谷" },
        { d: "2026-08-23", memo: "特典会 14:00〜 @秋葉原" },
        { d: "2026-09-01", memo: "新曲MV公開予定🎥" },
      ],
    },
  },
  {
    id: "creator",
    label: "クリエイター",
    data: {
      handle: "mihon_creator",
      profile: {
        name: "みほん🎨",
        bio: "フリーでイラストを描いています🎨\n女の子と動物のイラストが得意です。お仕事のご依頼はXのDMまで、お気軽にどうぞ！",
        emoji: "🎨",
        theme: 2,
        av_theme: 6,
        av_url: "",
        bn_url: "",
        status: "新作グッズをBOOTHに追加しました🎨",
      },
      channels: [
        { type: "x", url: "#", label: "告知用", descr: "新作とお仕事のお知らせ", status: "live" },
        { type: "pixiv", url: "#", label: "", descr: "作品はこちらにまとめています", status: "live" },
        { type: "booth", url: "#", label: "グッズ販売", descr: "アクキー・ステッカーなど", status: "live" },
        { type: "mail", url: "#", label: "お仕事のご依頼", descr: "商用利用のご相談はこちらへ", status: "live" },
      ],
      pubcal: [
        { d: "2026-08-05", memo: "夏コミ新刊の入稿締切📮" },
        { d: "2026-08-30", memo: "デザインフェスタ出展 @ビッグサイト" },
      ],
    },
  },
  {
    id: "restaurant",
    label: "お店",
    data: {
      handle: "cafe_mihon",
      profile: {
        name: "喫茶みほん",
        bio: "駅から徒歩3分の小さな喫茶店☕ 手作りケーキと自家焙煎コーヒーのお店です。11:00-19:00(水曜定休)。一人でものんびり過ごせる空間です。",
        emoji: "☕",
        theme: 7,
        av_theme: 8,
        av_url: "",
        bn_url: "",
        status: "本日のケーキはガトーショコラ🍰",
      },
      channels: [
        { type: "line", url: "#", label: "ご予約・お問い合わせ", descr: "空席状況もお気軽にどうぞ", status: "live" },
        { type: "instagram", url: "#", label: "", descr: "本日のケーキを毎朝投稿しています", status: "live" },
        { type: "tiktok", url: "#", label: "", descr: "厨房の様子や焙煎風景を公開", status: "live" },
        { type: "other", url: "#", label: "地図・アクセス", descr: "Googleマップで開く", status: "live" },
      ],
      pubcal: [
        { d: "2026-08-01", memo: "夏限定・かき氷はじめました🍧" },
        { d: "2026-08-15", memo: "臨時休業をいただきます" },
        { d: "2026-08-28", memo: "秋の新作ケーキ、試作中です🍂" },
      ],
    },
  },
  {
    id: "company",
    label: "会社",
    data: {
      handle: "mihon_official",
      profile: {
        name: "みほん株式会社",
        bio: "文房具の企画・製造をしている小さなメーカーです。「毎日使いたくなる文房具」をコンセプトに商品開発しています。採用情報とお知らせをまとめています。",
        emoji: "🏢",
        theme: 3,
        av_theme: 9,
        av_url: "",
        bn_url: "",
        status: "秋の新商品を発表しました✏️",
      },
      channels: [
        { type: "heading", url: "", label: "採用情報", descr: "", status: "live" },
        { type: "other", url: "#", label: "採用ページ", descr: "募集職種の一覧はこちら", status: "live" },
        { type: "mail", url: "#", label: "採用に関するお問い合わせ", descr: "人事担当まで(平日10:00-17:00)", status: "live" },
        { type: "heading", url: "", label: "お知らせ", descr: "", status: "live" },
        { type: "x", url: "#", label: "", descr: "新商品情報を発信中", status: "live" },
        { type: "instagram", url: "#", label: "", descr: "商品の使い方や制作風景を紹介", status: "live" },
        { type: "mail", url: "#", label: "お問い合わせ", descr: "広報窓口(平日10:00-17:00)", status: "live" },
      ],
      pubcal: [
        { d: "2026-08-05", memo: "オンライン会社説明会 14:00〜" },
        { d: "2026-09-10", memo: "新商品「するするノート」発売" },
      ],
    },
  },
];