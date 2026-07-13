// Beacon のドメイン型。supabase/schema.sql のテーブル定義と対応。

export type ChannelStatus = "live" | "dead";

/** channels テーブル 1 行 */
export interface Channel {
  id?: string;
  type: string; // リンク種別（x / youtube / site / support など。beacon.html 参照）
  url: string;
  label: string; // 表示名
  descr: string; // 説明（schema では descr、RPC の JSON キーは "desc"）
  status: ChannelStatus;
  position?: number;
  img_url?: string; // 個別サムネイル（Storage 公開URL。RPC の JSON キーは "img"）
}

/** profiles テーブル 1 行 */
export interface Profile {
  handle: string;
  name: string;
  bio: string;
  emoji: string;
  theme: number;
  av_theme: number;
  av_url: string;
  bn_url: string;
  status?: string; // ひとこと近況（任意）
  status_at?: string | null; // 近況の更新時刻
}

/** カレンダーメモ 1 件 */
export interface CalMemo {
  d: string; // YYYY-MM-DD
  memo: string;
}

/**
 * save_channels RPC に渡す JSON の形。
 * 注意: schema 側は説明カラムを descr、JSON キーは "desc" で受ける
 * （schema.sql の `c->>'desc'` を参照）。この差異は toChannelPayload で吸収する。
 */
export interface ChannelPayload {
  type: string;
  url: string;
  label: string;
  desc: string;
  status: ChannelStatus;
  img: string;
}

export function toChannelPayload(c: Channel): ChannelPayload {
  return {
    type: c.type,
    url: c.url,
    label: c.label,
    desc: c.descr,
    status: c.status,
    img: c.img_url ?? "",
  };
}
