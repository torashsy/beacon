import type { ReactNode } from "react";
import type { CalMemo, Channel, Profile } from "@/lib/beacon/types";
import { grad, HEADING_TYPE, typeMeta } from "@/lib/beacon/constants";
import { fmtMd } from "@/lib/beacon/format";
import { safeUrl } from "@/lib/beacon/safe";
import { LinkThumb, VerifiedBadge } from "./icons";
import { TrackedLink } from "./TrackedLink";

/**
 * 公開プロフィールの見た目（X風カード）。beacon.html の renderPublicFor を移植。
 * サーバー(/@handle)とクライアント(アプリ内プレビュー)の双方から使う純表示コンポーネント
 * （hooks を持たないので "use client" 不要）。
 */

export interface PublicCardData {
  handle: string;
  followerCount?: number;
  profile: Pick<
    Profile,
    "name" | "bio" | "emoji" | "theme" | "av_url" | "bn_url" | "status"
  >;
  channels: Channel[]; // live/dead 両方。ここで振り分ける
  pubcal: CalMemo[]; // 公開メモのみ
}

function Avatar({ url, emoji, handle }: { url: string; emoji: string; handle: string }) {
  return (
    <div className="xav">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        emoji || (handle[0] ?? "?").toUpperCase()
      )}
    </div>
  );
}

export function PublicProfileCard({
  data,
  actions,
  actionsClassName,
  headerActions,
  trackHandle,
}: {
  data: PublicCardData;
  /** フォローボタン等、カード右上のアクション。 */
  actions?: ReactNode;
  actionsClassName?: string;
  /** カバー画像上に置く共有等のアクション。 */
  headerActions?: ReactNode;
  /** 指定時はリンククリックを集計する（公開ページのみ。プレビューでは渡さない）。 */
  trackHandle?: string;
}) {
  const { handle, profile, channels, pubcal } = data;
  const hasLinks = channels.some((c) => c.type !== HEADING_TYPE);

  return (
    <div className="xcard">
      <div
        className="banner"
        style={profile.bn_url ? { background: "none" } : { background: grad(profile.theme) }}
      >
        {profile.bn_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.bn_url} alt="" />
        )}
        {profile.status && (
          <div className="statusBubble"><span>{profile.status}</span></div>
        )}
        {headerActions && <div className="bannerActions">{headerActions}</div>}
      </div>
      <div className="xhead">
        {actions && <div className={`xactions ${actionsClassName ?? ""}`}>{actions}</div>}
        <Avatar url={profile.av_url} emoji={profile.emoji} handle={handle} />
        <div className="xname">
          <span>{profile.name || `@${handle}`}</span>
          <VerifiedBadge />
        </div>
        <div className="xid">@{handle}</div>
        {typeof data.followerCount === "number" && (
          <div className="followerCount">
            <strong>{data.followerCount.toLocaleString("ja-JP")}</strong> フォロワー
          </div>
        )}
        {profile.bio && <div className="xbio">{profile.bio}</div>}
      </div>

      <div className="xpane" style={{ paddingTop: 4, paddingBottom: 0 }}>
        {hasLinks ? (
          // 並び順のまま描画する（見出しで区切れるように。停止リンクもその場に表示）
          channels.map((c, i) => {
            const key = c.id ?? `${c.type}-${i}`;
            if (c.type === HEADING_TYPE) {
              return (
                <h2 key={key} style={{ margin: "14px 4px 8px" }}>
                  {c.label}
                </h2>
              );
            }
            if (c.status === "dead") {
              return (
                <div key={key} className="pdead">
                  <span className="s">{c.label || typeMeta(c.type).lb}</span>
                  は現在使えません
                </div>
              );
            }
            return (
              <TrackedLink
                key={key}
                className="plink"
                href={safeUrl(c.url)}
                rawUrl={c.url}
                trackHandle={trackHandle}
              >
                <LinkThumb type={c.type} img={c.img_url} />
                <div className="pmeta">
                  <div className="lb2">{c.label || typeMeta(c.type).lb}</div>
                  {c.descr && <div className="ds">{c.descr}</div>}
                </div>
                <span className="go">→</span>
              </TrackedLink>
            );
          })
        ) : (
          <div className="empty">有効なリンクがありません。</div>
        )}
      </div>

      {pubcal.length > 0 && (
        <div className="calpub" style={{ padding: "0 16px 18px" }}>
          <h2 style={{ margin: "8px 4px 10px" }}>カレンダー</h2>
          {pubcal.map((e) => (
            <div key={e.d} className="pi">
              <span className="d">{fmtMd(e.d)}</span>
              <span className="m">{e.memo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

