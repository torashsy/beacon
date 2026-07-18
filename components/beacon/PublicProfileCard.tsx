import type { ReactNode } from "react";
import type { CalMemo, Channel, Profile } from "@/lib/beacon/types";
import { grad, HEADING_TYPE, typeMeta } from "@/lib/beacon/constants";
import { fmtMd } from "@/lib/beacon/format";
import { safeUrl } from "@/lib/beacon/safe";
import { LinkThumb } from "./icons";
import { TrackedLink } from "./TrackedLink";
import { normalizeProfileContent } from "@/lib/beacon/profile-content";
import { ProfilePhotoGallery } from "./ProfilePhotoGallery";

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
    "name" | "bio" | "emoji" | "theme" | "av_theme" | "av_url" | "bn_url" | "status" | "verified" | "content"
  >;
  channels: Channel[]; // 非表示リンクも含む。ここで公開対象だけに絞る
  pubcal: CalMemo[]; // 公開メモのみ
}

function Avatar({ url, emoji, handle, theme }: { url: string; emoji: string; handle: string; theme: number }) {
  return (
    <div className="xav" style={!url ? { background: grad(theme) } : undefined}>
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
  clickCounts,
}: {
  data: PublicCardData;
  /** フォローボタン等、カード右上のアクション。 */
  actions?: ReactNode;
  actionsClassName?: string;
  /** カバー画像上に置く共有等のアクション。 */
  headerActions?: ReactNode;
  /** 公開ページだけで指定し、リンククリックを集計する。 */
  trackHandle?: string;
  /** 本人画面だけで指定するURL別クリック数。 */
  clickCounts?: Record<string, number>;
}) {
  const { handle, profile, channels, pubcal } = data;
  const hasLinks = channels.some((c) => c.type !== HEADING_TYPE && c.status === "live");
  const content = normalizeProfileContent(profile.content);
  const hasAnyContent = hasLinks || content.photos.length > 0 || pubcal.length > 0;

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
        <Avatar url={profile.av_url} emoji={profile.emoji} handle={handle} theme={profile.av_theme ?? 0} />
        <div className="xname">
          <span>{profile.name || `@${handle}`}</span>
          {profile.verified && (
            <span className="verifiedBadge" aria-label="復旧手段を認証済み" title="復旧手段を認証済み">
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.9 14.2-4-4 1.7-1.7 2.3 2.3 6.5-6.5L16.1 6l-8.2 8.2Z" /></svg>
            </span>
          )}
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
          // 並び順のまま描画し、非表示リンクは公開ページへ一切出さない。
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
              return null;
            }
            return (
              <TrackedLink
                key={key}
                className="plink"
                href={safeUrl(c.url)}
                rawUrl={c.url}
                trackHandle={trackHandle}
              >
                <LinkThumb type={c.type} />
                <div className="pmeta">
                  <div className="lb2">{c.label || typeMeta(c.type).lb}</div>
                  {c.descr && <div className="ds">{c.descr}</div>}
                  {clickCounts && (
                    <div className="clickCount">
                      {(clickCounts[c.url] ?? 0).toLocaleString("ja-JP")} クリック
                    </div>
                  )}
                </div>
                <span className="go">→</span>
              </TrackedLink>
            );
          })
        ) : !hasAnyContent ? (
          <div className="empty">表示中のリンクがありません。</div>
        ) : null}
      </div>

      {content.photos.length > 0 && (
        <section className="profileContentSection">
          <ProfilePhotoGallery photos={content.photos} />
        </section>
      )}

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

