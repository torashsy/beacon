"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/beacon/types";
import {
  grad,
  HEADING_TYPE,
  TYPES,
  typeMeta,
} from "@/lib/beacon/constants";
import { detectType } from "@/lib/beacon/detect";
import { dkey } from "@/lib/beacon/format";
import { safeUrl } from "@/lib/beacon/safe";
import { generateShareCard } from "@/lib/beacon/shareCard";
import { cryptoId, type Me, type ToastFn } from "./appTypes";
import { LinkThumb, VerifiedBadge } from "./icons";

/**
 * プロフィール表示 + 編集タブ（リンク / カレンダー）。beacon.html の prof-view を移植し、
 * リンクの編集・セクション見出し・シェア(URLコピー/共有/QR) を追加拡張。
 * 書き込みは onSaveChannels / onSaveCal を通じてサーバーRPC（毎回パスコード）で行う。
 */

export function ProfileView({
  me,
  handle,
  onEdit,
  onPreview,
  onShowRc,
  onSaveChannels,
  onSaveCal,
  onLoadCal,
  onUploadThumb,
  toast,
}: {
  me: Me;
  handle: string;
  onEdit: () => void;
  onPreview: () => void;
  onShowRc: () => void;
  onSaveChannels: (next: Channel[]) => Promise<boolean>;
  onSaveCal: (date: string, memo: string, pub: boolean) => Promise<boolean>;
  onLoadCal: () => void;
  onUploadThumb: (file: File) => Promise<string>;
  toast: ToastFn;
}) {
  const [tab, setTab] = useState<"links" | "cal">("links");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tab === "cal" && !me.calLoaded) onLoadCal();
  }, [tab, me.calLoaded, onLoadCal]);

  const pageUrl = () => `${window.location.origin}/@${handle}`;

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(pageUrl());
      toast("URLをコピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: `@${handle} · Beacon`, url: pageUrl() });
    } catch {
      /* キャンセルは無視 */
    }
  }

  async function openQr() {
    try {
      const { toDataURL } = await import("qrcode");
      setQrDataUrl(
        await toDataURL(pageUrl(), {
          width: 512,
          margin: 2,
          color: { dark: "#17242b", light: "#ffffff" },
        }),
      );
    } catch {
      toast("QRコードを作成できませんでした");
    }
  }

  async function shareCard() {
    try {
      const blob = await generateShareCard({
        name: me.profile.name,
        handle,
        emoji: me.profile.emoji,
        theme: me.profile.theme,
        avUrl: me.profile.av_url,
        url: pageUrl(),
        channels: me.channels,
      });
      const file = new File([blob], `beacon-${handle}.png`, { type: "image/png" });
      // 対応端末はOS共有シートで画像を、非対応はダウンロード
      const navAny = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean;
      };
      if (navAny.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: `@${handle} · Beacon` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("画像を保存しました");
      }
    } catch {
      toast("画像を作成できませんでした");
    }
  }

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div>
      <div className="xcard">
        <div
          className="banner"
          style={
            me.profile.bn_url
              ? { background: "none" }
              : { background: grad(me.profile.theme) }
          }
        >
          {me.profile.bn_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.profile.bn_url} alt="" />
          )}
        </div>
        <div className="xhead">
          <div className="xactions">
            <button className="pill line" onClick={onEdit}>
              プロフィールを編集
            </button>
          </div>
          <div className="xav">
            {me.profile.av_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={me.profile.av_url} alt="" />
            ) : (
              me.profile.emoji || handle[0]?.toUpperCase()
            )}
          </div>
          <div className="xname">
            <span>{me.profile.name || `@${handle}`}</span>
            <VerifiedBadge />
          </div>
          <div className="xid">@{handle}</div>
          {me.profile.bio && <div className="xbio">{me.profile.bio}</div>}
          <div className="xmeta">
            <span className="live" />
            <span>Beacon で公開中</span>
          </div>
          <button
            className="pill solid"
            style={{ marginTop: 12, width: "100%" }}
            onClick={onPreview}
          >
            プレビュー
          </button>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="pill line" style={{ flex: 1 }} onClick={copyUrl}>
              URLをコピー
            </button>
            {canShare && (
              <button className="pill line" style={{ flex: 1 }} onClick={share}>
                共有
              </button>
            )}
            <button className="pill line" style={{ flex: 1 }} onClick={openQr}>
              QRコード
            </button>
          </div>
          <button
            className="pill line"
            style={{ width: "100%", marginTop: 8 }}
            onClick={shareCard}
          >
            🖼 画像で共有（SNSに貼る）
          </button>
          <div className="xtabs">
            <button
              className={`xtab ${tab === "links" ? "on" : ""}`}
              onClick={() => setTab("links")}
            >
              リンク
            </button>
            <button
              className={`xtab ${tab === "cal" ? "on" : ""}`}
              onClick={() => setTab("cal")}
            >
              カレンダー
            </button>
          </div>
        </div>

        {tab === "links" ? (
          <LinksPane
            me={me}
            onSaveChannels={onSaveChannels}
            onUploadThumb={onUploadThumb}
            toast={toast}
          />
        ) : (
          <CalendarPane me={me} onSaveCal={onSaveCal} toast={toast} />
        )}
      </div>

      <div className="note">
        「支援」には、ほしいものリストやFantiaなど外部の支援ページのURLを貼れます。
        Beaconはお金のやり取りを仲介しません。
      </div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={onShowRc}>
        復旧コードを確認する
      </button>

      {qrDataUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(23,36,43,.55)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => setQrDataUrl(null)}
        >
          <div
            className="card"
            style={{ textAlign: "center", width: "100%", maxWidth: 320 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrDataUrl}
              alt={`@${handle} のQRコード`}
              style={{ width: "100%", borderRadius: 12 }}
            />
            <div className="xid" style={{ marginTop: 8 }}>
              @{handle}
            </div>
            <button className="btn ghost" onClick={() => setQrDataUrl(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- リンクタブ ----------

function LinksPane({
  me,
  onSaveChannels,
  onUploadThumb,
  toast,
}: {
  me: Me;
  onSaveChannels: (next: Channel[]) => Promise<boolean>;
  onUploadThumb: (file: File) => Promise<string>;
  toast: ToastFn;
}) {
  const chans = me.channels;
  // 空なら最初からフォームを開いておく（初回オンボーディング）
  const [formOpen, setFormOpen] = useState(chans.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState("x");
  const [typeManual, setTypeManual] = useState(false); // 種類を手動で選んだか
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");
  const [img, setImg] = useState(""); // 個別サムネイルURL
  const [imgBusy, setImgBusy] = useState(false);
  const [preview, setPreview] = useState(false); // 編集/プレビュー トグル
  const thumbInput = useRef<HTMLInputElement>(null);

  const isHeading = type === HEADING_TYPE;

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setType("x");
    setTypeManual(false);
    setUrl("");
    setLabel("");
    setDesc("");
    setImg("");
  }

  function startEdit(c: Channel) {
    setEditingId(c.id!);
    setType(c.type);
    setTypeManual(true); // 既存編集では自動判定で上書きしない
    setUrl(c.url);
    setLabel(c.label);
    setDesc(c.descr);
    setImg(c.img_url ?? "");
    setFormOpen(true);
  }

  async function pickThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImgBusy(true);
    try {
      setImg(await onUploadThumb(file));
    } catch {
      toast("画像をアップロードできませんでした");
    } finally {
      setImgBusy(false);
    }
  }

  // URL 入力で種類を自動判定（手動選択・見出し時は上書きしない）
  function onUrlChange(v: string) {
    setUrl(v);
    if (!typeManual && !isHeading && v.trim()) {
      setType(detectType(v));
    }
  }

  function move(id: string, d: -1 | 1) {
    const i = chans.findIndex((c) => c.id === id);
    const j = i + d;
    if (j < 0 || j >= chans.length) return;
    const next = [...chans];
    [next[i], next[j]] = [next[j], next[i]];
    void onSaveChannels(next);
  }

  async function toggle(id: string) {
    const next = chans.map((c) =>
      c.id === id
        ? { ...c, status: c.status === "live" ? "dead" : "live" }
        : c,
    ) as Channel[];
    if (await onSaveChannels(next)) {
      const c = next.find((x) => x.id === id);
      toast(c?.status === "dead" ? "停止にしました" : "有効にしました");
    }
  }

  function del(id: string) {
    if (editingId === id) resetForm();
    void onSaveChannels(chans.filter((c) => c.id !== id));
  }

  async function submit() {
    const lb = label.trim();
    const u = url.trim();
    if (isHeading && !lb) {
      toast("見出しの文字を入れてください");
      return;
    }
    if (!isHeading && !u) {
      toast("URLを入れてください");
      return;
    }
    const fields = {
      type,
      url: isHeading ? "" : u,
      label: lb,
      descr: isHeading ? "" : desc.trim(),
      img_url: isHeading ? "" : img,
    };
    const next: Channel[] = editingId
      ? chans.map((c) => (c.id === editingId ? { ...c, ...fields } : c))
      : [...chans, { id: cryptoId(), ...fields, status: "live" }];
    if (await onSaveChannels(next)) {
      toast(editingId ? "保存しました" : "追加しました");
      resetForm();
    }
  }

  // プレビュー（訪問者の見え方）
  if (preview) {
    const shown = chans.filter(
      (c) => c.type === HEADING_TYPE || c.status === "live",
    );
    return (
      <div className="xpane">
        <PreviewToggle preview={preview} setPreview={setPreview} />
        {shown.length ? (
          shown.map((c, i) =>
            c.type === HEADING_TYPE ? (
              <h2 key={c.id ?? i} style={{ margin: "14px 4px 8px" }}>
                {c.label}
              </h2>
            ) : (
              <a
                key={c.id ?? i}
                className="plink"
                href={safeUrl(c.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <LinkThumb type={c.type} img={c.img_url} />
                <div className="pmeta">
                  <div className="lb2">{c.label || typeMeta(c.type).lb}</div>
                  {c.descr && <div className="ds">{c.descr}</div>}
                </div>
                <span className="go">→</span>
              </a>
            ),
          )
        ) : (
          <div className="empty">有効なリンクがありません。</div>
        )}
      </div>
    );
  }

  return (
    <div className="xpane">
      <PreviewToggle preview={preview} setPreview={setPreview} />
      <div>
        {chans.length ? (
          chans.map((c, i) => {
            const clicks = c.type !== HEADING_TYPE ? me.clicks[c.url] : undefined;
            return (
              <div
                key={c.id}
                className={`chan ${c.status === "dead" ? "dead" : ""}`}
                style={
                  editingId === c.id ? { borderColor: "var(--em)" } : undefined
                }
              >
                <div className="mv">
                  <button
                    disabled={i === 0}
                    onClick={() => move(c.id!, -1)}
                    aria-label="上へ"
                  >
                    ▲
                  </button>
                  <button
                    disabled={i === chans.length - 1}
                    onClick={() => move(c.id!, 1)}
                    aria-label="下へ"
                  >
                    ▼
                  </button>
                </div>
                {c.type === HEADING_TYPE ? (
                  <span
                    className="ic-badge"
                    style={{
                      background: "var(--eml)",
                      color: "var(--emd)",
                      fontWeight: 800,
                      fontSize: 15,
                    }}
                  >
                    ¶
                  </span>
                ) : (
                  <LinkThumb type={c.type} img={c.img_url} />
                )}
                <div
                  className="meta"
                  style={{ cursor: "pointer" }}
                  onClick={() => startEdit(c)}
                  title="タップして編集"
                >
                  {c.type === HEADING_TYPE ? (
                    <>
                      <div className="lb">{c.label}</div>
                      <div className="u" style={{ color: "var(--faint)" }}>
                        見出し
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="lb">
                        {c.label || typeMeta(c.type).lb}
                        {clicks ? (
                          <span
                            style={{
                              color: "var(--muted)",
                              fontWeight: 600,
                              marginLeft: 8,
                              fontSize: 11,
                            }}
                          >
                            👆 {clicks}
                          </span>
                        ) : null}
                      </div>
                      <div className={`u ${c.status === "dead" ? "strike" : ""}`}>
                        {c.url}
                      </div>
                      {c.descr && (
                        <div className="u" style={{ color: "var(--emd)" }}>
                          {c.descr}
                        </div>
                      )}
                    </>
                  )}
                </div>
                {c.type !== HEADING_TYPE && (
                  <button
                    className={`tog ${c.status}`}
                    onClick={() => toggle(c.id!)}
                  >
                    {c.status === "live" ? "有効" : "停止"}
                  </button>
                )}
                <button
                  className="del"
                  onClick={() => del(c.id!)}
                  aria-label="削除"
                >
                  ×
                </button>
              </div>
            );
          })
        ) : (
          <div className="empty">
            <span className="big">🔗</span>
            最初のリンクを追加しましょう。
            <br />
            X や YouTube のURLを貼るだけで種類は自動で判定されます。
          </div>
        )}
      </div>

      {!formOpen && (
        <button
          className="btn ghost"
          style={{ marginTop: 4 }}
          onClick={() => setFormOpen(true)}
        >
          ＋ リンクを追加
        </button>
      )}

      {formOpen && (
        <div style={{ marginTop: 10 }}>
          <label className="f">
            {editingId ? "編集" : "追加"}
            {isHeading ? "（見出し）" : ""}
          </label>
          <div className="addrow">
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setTypeManual(true);
              }}
            >
              {Object.entries(TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.lb}
                </option>
              ))}
              <option value={HEADING_TYPE}>— 見出し —</option>
            </select>
            {!isHeading && (
              <input
                className="plain"
                value={url}
                onChange={(e) => onUrlChange(e.target.value)}
                placeholder="URLを貼り付け（種類は自動判定）"
                inputMode="url"
              />
            )}
            {isHeading && (
              <input
                className="plain"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: SNS / ショップ / 支援"
                maxLength={20}
              />
            )}
          </div>
          {!isHeading && (
            <>
              <label className="f">表示名（任意）</label>
              <input
                className="plain"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例: メイン垢 / サブ垢"
                maxLength={20}
              />
              <label className="f">説明（任意）</label>
              <input
                className="plain"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="例: DMはこちらが早いです"
                maxLength={40}
              />
              <label className="f">サムネイル画像（任意）</label>
              <input
                ref={thumbInput}
                type="file"
                accept="image/*"
                hidden
                onChange={pickThumb}
              />
              <div
                style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}
              >
                <LinkThumb type={type} img={img} />
                <button
                  type="button"
                  className="pill line"
                  disabled={imgBusy}
                  onClick={() => thumbInput.current?.click()}
                >
                  {imgBusy ? "アップロード中…" : img ? "画像を変更" : "画像を選ぶ"}
                </button>
                {img && (
                  <button
                    type="button"
                    className="pill line"
                    onClick={() => setImg("")}
                  >
                    削除
                  </button>
                )}
              </div>
            </>
          )}
          <button className="btn sig" onClick={submit}>
            {editingId ? "保存する" : "追加する"}
          </button>
          <button className="btn ghost" onClick={resetForm}>
            キャンセル
          </button>
        </div>
      )}
    </div>
  );
}

/** 編集 / プレビュー（見え方）を切り替えるセグメント。 */
function PreviewToggle({
  preview,
  setPreview,
}: {
  preview: boolean;
  setPreview: (v: boolean) => void;
}) {
  return (
    <div className="xtabs" style={{ borderTop: "none", marginTop: 0 }}>
      <button
        className={`xtab ${!preview ? "on" : ""}`}
        onClick={() => setPreview(false)}
      >
        編集
      </button>
      <button
        className={`xtab ${preview ? "on" : ""}`}
        onClick={() => setPreview(true)}
      >
        見え方
      </button>
    </div>
  );
}

// ---------- カレンダータブ ----------

const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function CalendarPane({
  me,
  onSaveCal,
  toast,
}: {
  me: Me;
  onSaveCal: (date: string, memo: string, pub: boolean) => Promise<boolean>;
  toast: ToastFn;
}) {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [sel, setSel] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [pub, setPub] = useState(false);
  const [busy, setBusy] = useState(false);

  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  function selectDay(k: string) {
    setSel(k);
    const e = me.cal[k];
    setMemo(e?.memo ?? "");
    setPub(e?.pub ?? false);
  }
  function nav(d: -1 | 1) {
    let nm = m + d;
    let ny = y;
    if (nm < 0) {
      nm = 11;
      ny--;
    } else if (nm > 11) {
      nm = 0;
      ny++;
    }
    setM(nm);
    setY(ny);
    setSel(null);
    setMemo("");
    setPub(false);
  }
  async function save() {
    if (!sel) {
      toast("日付を選んでください");
      return;
    }
    setBusy(true);
    try {
      if (await onSaveCal(sel, memo.trim(), pub)) toast("保存しました");
    } finally {
      setBusy(false);
    }
  }

  const selLabel = sel
    ? `${y}年${m + 1}月${+sel.split("-")[2]}日のメモ`
    : "日付を選んでください";

  return (
    <div className="xpane">
      {!me.calLoaded && (
        <div className="sub">カレンダーを読み込んでいます…</div>
      )}
      <div className="calhead">
        <button className="calnav" onClick={() => nav(-1)}>
          ‹
        </button>
        <div className="calmon">
          {y}年{m + 1}月
        </div>
        <button className="calnav" onClick={() => nav(1)}>
          ›
        </button>
      </div>
      <div className="calgrid">
        {DOW.map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
      </div>
      <div className="calgrid">
        {Array.from({ length: first }).map((_, i) => (
          <div key={`b${i}`} className="day blank" />
        ))}
        {Array.from({ length: days }).map((_, i) => {
          const d = i + 1;
          const k = dkey(y, m, d);
          const isToday =
            d === now.getDate() &&
            m === now.getMonth() &&
            y === now.getFullYear();
          const entry = me.cal[k];
          return (
            <div
              key={k}
              className={`day ${isToday ? "today" : ""} ${sel === k ? "sel" : ""}`}
              onClick={() => selectDay(k)}
            >
              {d}
              {entry?.memo && (
                <span className={`dot ${entry.pub ? "" : "priv"}`} />
              )}
            </div>
          );
        })}
      </div>

      <label className="f" style={{ marginTop: 14 }}>
        {selLabel}
      </label>
      <textarea
        className="plain"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="例: ライブ出演 19:00〜 / 20時以降 空きあり"
      />
      <label className="chk">
        <input
          type="checkbox"
          checked={pub}
          onChange={(e) => setPub(e.target.checked)}
        />
        <span>このメモを公開ページに表示する</span>
      </label>
      <button className="btn sig" disabled={busy} onClick={save}>
        {busy ? "保存中…" : "保存する"}
      </button>
      <div className="note" style={{ marginTop: 12 }}>
        公開にすると、相手（フォロワー）にもこの日のメモが見えます。空き日の告知などに
        使えます。予定などプライベートな内容は公開にしないでください。
      </div>
    </div>
  );
}
