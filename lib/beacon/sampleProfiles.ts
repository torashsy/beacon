import type { CalMemo, Channel, Profile } from "./types";

/** ランディングの「見本」で切り替えて見せる利用例。実データではない静的プレビュー用。 */
export interface SampleProfile {
  id: string;
  label: string;
  data: {
    handle: string;
    profile: Pick<Profile, "name" | "bio" | "emoji" | "theme" | "av_theme" | "av_url" | "bn_url">;
    channels: Channel[];
    pubcal: CalMemo[];
  };
}

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    id: "talent",
    label: "芸能人・インフルエンサー",
    data: {
      handle: "via_mi_sample",
      profile: {
        name: "みほん",
        bio: "連絡先はここにまとめています🌸",
        emoji: "🌸",
        theme: 0,
        av_theme: 5,
        av_url: "",
        bn_url: "",
      },
      channels: [
        { type: "x", url: "#", label: "メイン垢", descr: "DMはこちらへ", status: "live" },
        { type: "instagram", url: "#", label: "", descr: "", status: "live" },
        { type: "line", url: "#", label: "公式LINE", descr: "お知らせを配信中", status: "live" },
      ],
      pubcal: [{ d: "2026-07-12", memo: "ライブ出演 19:00〜 @渋谷" }],
    },
  },
  {
    id: "restaurant",
    label: "飲食店",
    data: {
      handle: "cafe_sample",
      profile: {
        name: "喫茶みほん",
        bio: "毎日11:00-19:00営業。本日のおすすめは日替わりランチです☕",
        emoji: "☕",
        theme: 7,
        av_theme: 8,
        av_url: "",
        bn_url: "",
      },
      channels: [
        { type: "line", url: "#", label: "ご予約はこちら", descr: "空席状況もお答えします", status: "live" },
        { type: "instagram", url: "#", label: "", descr: "日替わりメニューを毎朝更新", status: "live" },
        { type: "other", url: "#", label: "地図・アクセス", descr: "", status: "live" },
      ],
      pubcal: [{ d: "2026-08-15", memo: "臨時休業のお知らせ" }],
    },
  },
  {
    id: "company",
    label: "企業",
    data: {
      handle: "company_sample",
      profile: {
        name: "みほん株式会社",
        bio: "採用情報とお知らせをまとめています。",
        emoji: "🏢",
        theme: 3,
        av_theme: 9,
        av_url: "",
        bn_url: "",
      },
      channels: [
        { type: "heading", url: "", label: "採用情報", descr: "", status: "live" },
        { type: "other", url: "#", label: "採用ページ", descr: "募集職種一覧はこちら", status: "live" },
        { type: "heading", url: "", label: "お知らせ", descr: "", status: "live" },
        { type: "x", url: "#", label: "", descr: "最新情報を発信中", status: "live" },
        { type: "mail", url: "#", label: "お問い合わせ", descr: "", status: "live" },
      ],
      pubcal: [{ d: "2026-08-01", memo: "会社説明会 14:00〜" }],
    },
  },
  {
    id: "personal",
    label: "個人",
    data: {
      handle: "personal_sample",
      profile: {
        name: "みほん",
        bio: "趣味の記録用アカウントです。フォローお気軽にどうぞ🎮",
        emoji: "🎮",
        theme: 10,
        av_theme: 11,
        av_url: "",
        bn_url: "",
      },
      channels: [
        { type: "x", url: "#", label: "", descr: "", status: "live" },
        { type: "youtube", url: "#", label: "", descr: "ゲーム実況をたまに配信", status: "live" },
        { type: "discord", url: "#", label: "", descr: "", status: "live" },
      ],
      pubcal: [{ d: "2026-07-20", memo: "配信 21:00〜" }],
    },
  },
];
