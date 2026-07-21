"use client";

import { useEffect, useRef, useState } from "react";
import type { Channel } from "@/lib/beacon/types";
import {
  COLORS,
  HEADING_TYPE,
  TYPES,
  typeMeta,
} from "@/lib/beacon/constants";
import { dkey } from "@/lib/beacon/format";
import {
  normalizeLinkInput,
  supportsUserId,
  userIdExample,
} from "@/lib/beacon/link-input";
import { createBrandQrSvg, qrSvgDataUrl } from "@/lib/beacon/brand-qr";
import { cryptoId, type Me, type ToastFn } from "./appTypes";
import { LinkThumb } from "./icons";
import { PublicProfileCard } from "./PublicProfileCard";
import { QrShareModal, type QrCard } from "./QrShareModal";
import {
  normalizeProfileContent,
  type ProfileContent,
  type ProfilePhoto,
} from "@/lib/beacon/profile-content";

type EditSection = "profile" | "links" | "cal" | "photos";
type ContentTab = Exclude<EditSection, "profile">;

/**
 * プロフィール表示 + 編集タブ（リンク / カレンダー / 写真）。beacon.html の prof-view を移植し、
 * リンクの編集・セクション見出し・シェア(共有/QR) を追加拡張。
 * 共有はOS共有シート、非対応環境ではURLコピーにフォールバックする。
 * 書き込みは onSaveChannels / onSaveCal を通じて失効可能なセッションで認証する。
 */

export function ProfileView({
  me,
  handle,
  onEdit,
  editing = false,
  focusSection,
  onSaveChannels,
  onSaveCal,
  onSaveContent,
  onUploadPhoto,
  toast,
}: {
  me: Me;
  handle: string;
  onEdit: (section?: EditSection) => void;
  editing?: boolean;
  focusSection?: ContentTab;
  onSaveChannels: (next: Channel[]) => Promise<boolean>;
  onSaveCal: (date: string, memo: string) => Promise<boolean>;
  onSaveContent: (next: ProfileContent) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<string | null>;
  toast: ToastFn;
}) {
  const [tab, setTab] = useState<ContentTab>(focusSection ?? "links");
  const editorSection = useRef<HTMLDivElement>(null);
  const [qrCard, setQrCard] = useState<QrCard | null>(null);
  const avatarColors = COLORS[me.profile.av_theme ?? 0] ?? COLORS[0];

  // 公開ページ側（get_public_page）も過去日を自動で除外するため、プレビューも合わせる。
  const today = new Date().toISOString().slice(0, 10);
  const publicCal = Object.entries(me.cal)
    .filter(([d, value]) => value.memo && d >= today)
    .map(([d, value]) => ({ d, memo: value.memo }))
    .sort((a, b) => a.d.localeCompare(b.d));

  useEffect(() => {
    if (!editing || !focusSection) return;
    setTab(focusSection);
    const timer = window.setTimeout(() => {
      editorSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [editing, focusSection]);

  const pageUrl = () => `${window.location.origin}/@${handle}`;

  // OS共有シートが使えない環境（デスクトップ等）ではURLコピーにフォールバック
  async function share() {
    // text を渡すことで、Xなどシェア先アプリの投稿本文に定型メッセージが
    // 自動で入る（urlだけだとリンクのみ貼られ、文面が空になるため）。
    const displayName = me.profile.name.trim();
    const shareText = `${displayName ? `${displayName}（@${handle}）` : `@${handle}`}のvia-miページ`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: `@${handle} · via-mi`, text: shareText, url: pageUrl() });
      } catch {
        /* キャンセルは無視 */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(pageUrl());
      toast("URLをコピーしました");
    } catch {
      toast("コピーできませんでした");
    }
  }

  async function openQr() {
    try {
      const { create } = await import("qrcode");
      const style = getComputedStyle(document.documentElement);
      const accent = style.getPropertyValue("--eml").trim() || "#e4f7fd";
      const accent2 = style.getPropertyValue("--em2").trim() || "#60c8f3";
      const qrColor = style.getPropertyValue("--emd").trim() || "#0879ad";
      const onAccent = style.getPropertyValue("--text").trim() || "#17323e";
      const qr = create(pageUrl(), { errorCorrectionLevel: "H" });
      setQrCard({
        dataUrl: qrSvgDataUrl(createBrandQrSvg(qr.modules, qrColor)),
        accent,
        accent2,
        onAccent,
      });
    } catch {
      toast("QRコードを作成できませんでした");
    }
  }

  if (!editing) {
    return (
      <>
        <PublicProfileCard
          data={{
            handle,
            followerCount: me.followerCount,
            profile: me.profile,
            channels: me.channels,
            pubcal: publicCal,
          }}
          clickCounts={me.clicks}
          headerActions={
            <>
              <button className="circleAction headerCircleAction" onClick={share} aria-label="共有">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V3m0 0L7 8m5-5 5 5M5 13v7h14v-7" />
                </svg>
              </button>
              <button className="circleAction headerCircleAction" onClick={openQr} aria-label="QRコード">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm11 0h2v2h-2v-2Zm3 0h2v3h-2v-3Zm-4 4h3v2h-3v-2Zm5 1h1v1h-1v-1Z" />
                </svg>
              </button>
            </>
          }
          actions={
            <button className="pill line compactEdit" onClick={() => onEdit("profile")}>
              プロフィール編集
            </button>
          }
          actionsClassName="profileEditAction"
        />
        <div className="homeQuickActions" aria-label="プロフィールへ追加">
          <button className="homeQuickAction" onClick={() => onEdit("links")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.5 14.5 14.5 9M8 17H6a4 4 0 0 1 0-8h3m6-2h3a4 4 0 0 1 0 8h-3" />
            </svg>
            <span>リンクを追加</span>
          </button>
          <button className="homeQuickAction" onClick={() => onEdit("cal")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 4h14a2 2 0 0 1 2 2v13H3V6a2 2 0 0 1 2-2Zm2-2v4m10-4v4M3 9h18m-9 3v5m-2.5-2.5h5" />
            </svg>
            <span>予定を追加</span>
          </button>
          <button className="homeQuickAction" onClick={() => onEdit("photos")}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 5h16v14H4V5Zm0 10 4.5-4 3.5 3 2.5-2 5.5 5M16.5 8.5h.01" />
            </svg>
            <span>写真を追加</span>
          </button>
        </div>
        {qrCard && (
          <QrShareModal
            qr={qrCard}
            handle={handle}
            name={me.profile.name}
            avatarUrl={me.profile.av_url}
            emoji={me.profile.emoji}
            avatarAccent={avatarColors[0]}
            avatarAccent2={avatarColors[1]}
            onClose={() => setQrCard(null)}
            toast={toast}
          />
        )}
      </>
    );
  }

  return (
    <div ref={editorSection} className="editorSection">
      <div className="xcard">
          <div className="xtabs editTabs">
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
            <button
              className={`xtab ${tab === "photos" ? "on" : ""}`}
              onClick={() => setTab("photos")}
            >
              写真
            </button>
          </div>

        {tab === "links" ? (
          <LinksPane
            me={me}
            startAdding={focusSection === "links"}
            onSaveChannels={onSaveChannels}
            toast={toast}
          />
        ) : tab === "cal" ? (
          <CalendarPane me={me} onSaveCal={onSaveCal} toast={toast} />
        ) : (
          <PhotosPane
            me={me}
            onSaveContent={onSaveContent}
            onUploadPhoto={onUploadPhoto}
            toast={toast}
          />
        )}
      </div>

    </div>
  );
}

// ---------- リンクタブ ----------

function LinksPane({
  me,
  startAdding = false,
  onSaveChannels,
  toast,
}: {
  me: Me;
  startAdding?: boolean;
  onSaveChannels: (next: Channel[]) => Promise<boolean>;
  toast: ToastFn;
}) {
  const chans = me.channels;
  // 空なら最初からフォームを開いておく（初回オンボーディング）
  const [formOpen, setFormOpen] = useState(startAdding || chans.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState("x");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [desc, setDesc] = useState("");

  const isHeading = type === HEADING_TYPE;

  function resetForm() {
    setFormOpen(false);
    setEditingId(null);
    setType("x");
    setUrl("");
    setLabel("");
    setDesc("");
  }

  function startEdit(c: Channel) {
    setEditingId(c.id!);
    setType(c.type);
    setUrl(c.url);
    setLabel(c.label);
    setDesc(c.descr);
    setFormOpen(true);
  }

  // URLを貼った場合は選択中の種類よりURL判定を優先し、アイコンも即時更新する。
  function onLinkInputChange(v: string) {
    setUrl(v);
    if (!isHeading && v.trim()) {
      const normalized = normalizeLinkInput(v, type);
      if (normalized?.source === "url") setType(normalized.type);
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
      toast(c?.status === "dead" ? "非表示にしました" : "表示しました");
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
      toast(supportsUserId(type) ? "ユーザーIDまたはURLを入れてください" : "URLを入れてください");
      return;
    }
    const normalized = isHeading ? null : normalizeLinkInput(u, type);
    if (!isHeading && !normalized) {
      toast(supportsUserId(type) ? `正しい${userIdExample(type)}またはURLを入力してください` : "正しいURLを入力してください");
      return;
    }
    const fields = {
      type: normalized?.type ?? type,
      url: normalized?.url ?? "",
      label: lb,
      descr: isHeading ? "" : desc.trim(),
    };
    const next: Channel[] = editingId
      ? chans.map((c) => (c.id === editingId ? { ...c, ...fields } : c))
      : [...chans, { id: cryptoId(), ...fields, status: "live" }];
    if (await onSaveChannels(next)) {
      toast(editingId ? "保存しました" : "追加しました");
      resetForm();
    }
  }

  return (
    <div className="xpane">
      <div>
        {chans.length ? (
          chans.map((c, i) => {
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
                  <LinkThumb type={c.type} />
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
                      </div>
                      <div className="u">
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
                    {c.status === "live" ? "表示中" : "非表示"}
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
          <div className="empty linksEmpty">
            <svg className="emptyLinkIcon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9.5 14.5 14.5 9M8 17H6a4 4 0 0 1 0-8h3m6-2h3a4 4 0 0 1 0 8h-3" />
            </svg>
            最初のリンクを追加しましょう。
            <br />
            X・InstagramなどはIDだけで追加できます。
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
                onChange={(e) => onLinkInputChange(e.target.value)}
                placeholder={
                  supportsUserId(type)
                    ? "ユーザーID または URL"
                    : "URLを入力"
                }
                aria-label={supportsUserId(type) ? "ユーザーIDまたはURL" : "URL"}
                inputMode={supportsUserId(type) ? "text" : type === "mail" ? "email" : "url"}
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
            <div className="fieldHint linkInputHint">
              {supportsUserId(type)
                ? `IDの例: ${userIdExample(type)}。URLを貼るとサービスを自動判定します。`
                : "URLを貼るとサービスを自動判定します。"}
            </div>
          )}
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

// ---------- 写真タブ ----------

function PhotosPane({
  me,
  onSaveContent,
  onUploadPhoto,
  toast,
}: {
  me: Me;
  onSaveContent: (next: ProfileContent) => Promise<boolean>;
  onUploadPhoto: (file: File) => Promise<string | null>;
  toast: ToastFn;
}) {
  const content = normalizeProfileContent(me.profile.content);
  const [busy, setBusy] = useState(false);
  const [draftPhotos, setDraftPhotos] = useState<ProfilePhoto[]>(content.photos);
  const draftPhotosRef = useRef(draftPhotos);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = normalizeProfileContent(me.profile.content).photos;
    draftPhotosRef.current = next;
    setDraftPhotos(next);
  }, [me.profile.content]);

  function setPhotoDraft(next: ProfilePhoto[]) {
    draftPhotosRef.current = next;
    setDraftPhotos(next);
  }

  async function addPhotos(files?: FileList | null) {
    if (!files?.length || busy) return;
    const available = 5 - draftPhotos.length;
    if (available <= 0) {
      toast("写真は5枚まで追加できます");
      return;
    }
    const selected = Array.from(files).slice(0, available);
    if (files.length > available) toast(`追加できる残り${available}枚を選びました`);
    setBusy(true);
    try {
      const urls = (await Promise.all(selected.map(onUploadPhoto)))
        .filter((url): url is string => Boolean(url));
      if (!urls.length) return;
      const photos = [
        ...draftPhotos,
        ...urls.map((url) => ({ id: cryptoId(), url })),
      ];
      setPhotoDraft(photos);
      const ok = await onSaveContent({
        photos,
      });
      if (ok) toast(`${urls.length}枚の写真を追加しました`);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove(id: string) {
    const photos = draftPhotos.filter((photo) => photo.id !== id);
    setPhotoDraft(photos);
    void onSaveContent({ photos });
  }

  function movePhoto(index: number, direction: -1 | 1) {
    const photos = [...draftPhotosRef.current];
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    [photos[index], photos[target]] = [photos[target], photos[index]];
    setPhotoDraft(photos);
    void onSaveContent({ photos: draftPhotosRef.current });
  }

  return (
    <div className="xpane contentEditorPane">
      <div className="editorPaneHeading">
        <p>最大5枚</p>
        <span>{draftPhotos.length} / 5</span>
      </div>
      {draftPhotos.length > 0 && (
        <div className="photoEditorList">
          {draftPhotos.map((photo, index) => (
            <div
              className="photoEditorItem"
              key={photo.id}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={`写真 ${index + 1}`}
                draggable={false}
              />
              {index > 0 && (
                <button
                  type="button"
                  className="photoMoveButton previous"
                  onClick={() => movePhoto(index, -1)}
                  aria-label={`写真 ${index + 1} を左へ移動`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m14.5 6.5-5 5.5 5 5.5" />
                  </svg>
                </button>
              )}
              {index < draftPhotos.length - 1 && (
                <button
                  type="button"
                  className="photoMoveButton next"
                  onClick={() => movePhoto(index, 1)}
                  aria-label={`写真 ${index + 1} を右へ移動`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m9.5 6.5 5 5.5-5 5.5" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="photoRemoveButton"
                onClick={() => remove(photo.id)}
                aria-label={`写真 ${index + 1} を削除`}
              >
                −
              </button>
            </div>
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        className="visuallyHidden"
        type="file"
        accept="image/*"
        multiple
        onChange={(event) => void addPhotos(event.target.files)}
      />
      <button
        className="btn sig"
        disabled={busy || draftPhotos.length >= 5}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "追加中…" : draftPhotos.length >= 5 ? "5枚追加済み" : "写真を選ぶ"}
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
  onSaveCal: (date: string, memo: string) => Promise<boolean>;
  toast: ToastFn;
}) {
  const now = new Date();
  const [y, setY] = useState(now.getFullYear());
  const [m, setM] = useState(now.getMonth());
  const [sel, setSel] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);

  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  function selectDay(k: string) {
    setSel(k);
    setMemo(me.cal[k]?.memo ?? "");
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
  }
  async function save() {
    if (!sel) {
      toast("日付を選んでください");
      return;
    }
    setBusy(true);
    try {
      if (await onSaveCal(sel, memo.trim())) toast("保存しました");
    } finally {
      setBusy(false);
    }
  }

  const selLabel = sel
    ? `${y}年${m + 1}月${+sel.split("-")[2]}日のメモ`
    : "日付を選んでください";

  return (
    <div className="xpane">
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
              {entry?.memo && <span className="dot" />}
            </div>
          );
        })}
      </div>

      <label className="f" style={{ marginTop: 14 }}>
        {selLabel}
      </label>
      <input
        className="plain"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        placeholder="例: ライブ 19:00〜"
        maxLength={100}
        // 日付未選択のまま入力できると、後で日付をタップした瞬間に selectDay の
        // setMemo で入力内容が上書き消去されてしまう。日付選択を先に促す。
        disabled={!sel}
      />
      <button className="btn sig" disabled={busy || !sel} onClick={save} style={{ marginTop: 14 }}>
        {busy ? "保存中…" : "保存する"}
      </button>
    </div>
  );
}
