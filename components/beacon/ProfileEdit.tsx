"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/beacon/types";
import { COLORS, grad } from "@/lib/beacon/constants";
import { CameraIcon } from "./icons";
import { ImageCropper } from "./ImageCropper";

/**
 * X風のプロフィール編集。beacon.html の prof-edit を移植。
 * 画像は base64 ではなく File を受け取り、保存時に storage.ts 経由で
 * 'avatars' バケットへアップロードする（実処理は onSave 側）。
 *
 * 画像選択（新規/既存の位置調整）は必ず ImageCropper を経由し、
 * ユーザーが指定した切り抜き位置・拡大率で確定した Blob を File 化して使う。
 */

/** ヘッダー画像の切り抜き枠の 幅/高さ 比。 */
const BANNER_ASPECT = 3;

/** 画像1枚の編集状態。 */
export interface ImageEdit {
  mode: "keep" | "new" | "remove";
  file?: File;
  previewUrl?: string; // mode==='new' のときの objectURL
}

export interface EditResult {
  name: string;
  bio: string;
  emoji: string;
  theme: number;
  avTheme: number;
  status: string;
  av: ImageEdit;
  bn: ImageEdit;
}

const currentUrl = (edit: ImageEdit, keepUrl: string): string =>
  edit.mode === "new" ? (edit.previewUrl ?? "") : edit.mode === "keep" ? keepUrl : "";

function firstCharacter(value: string): string {
  if (!value) return "";
  const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
  return Array.from(segmenter.segment(value))[0]?.segment ?? "";
}

/** 国旗（地域指示記号2つ）・キーキャップ（数字/#/*+combining）・その他の絵文字を判定する。 */
function isEmojiGrapheme(segment: string): boolean {
  if (/^\p{Regional_Indicator}\p{Regional_Indicator}$/u.test(segment)) return true;
  if (/^[0-9#*]️?⃣$/u.test(segment)) return true;
  return /\p{Extended_Pictographic}/u.test(segment);
}

export function ProfileEdit({
  profile,
  onCancel,
  onSave,
}: {
  profile: Profile;
  onCancel: () => void;
  onSave: (r: EditResult) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [emoji, setEmoji] = useState(profile.emoji || "🙂");
  const [theme, setTheme] = useState(profile.theme ?? 0);
  const [avTheme, setAvTheme] = useState(profile.av_theme ?? 0);
  const [status, setStatus] = useState(profile.status ?? "");
  const [av, setAv] = useState<ImageEdit>({ mode: "keep" });
  const [bn, setBn] = useState<ImageEdit>({ mode: "keep" });
  const [busy, setBusy] = useState(false);
  const [iconMenuOpen, setIconMenuOpen] = useState(false);
  const [bannerMenuOpen, setBannerMenuOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<{
    kind: "av" | "bn";
    file: File;
  } | null>(null);

  const avInput = useRef<HTMLInputElement>(null);
  const bnInput = useRef<HTMLInputElement>(null);

  // objectURL の後始末
  useEffect(() => {
    return () => {
      if (av.previewUrl) URL.revokeObjectURL(av.previewUrl);
      if (bn.previewUrl) URL.revokeObjectURL(bn.previewUrl);
    };
  }, [av.previewUrl, bn.previewUrl]);

  function pick(
    kind: "av" | "bn",
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 同じファイルを再選択できるように
    if (!file) return;
    setCropTarget({ kind, file }); // 必ずクロッパーを経由させる
  }

  const avUrl = currentUrl(av, profile.av_url);
  const bnUrl = currentUrl(bn, profile.bn_url);

  /** 既存（保存済み or 選択済み）の画像を、そのまま切り抜き位置だけ調整し直す。 */
  async function adjustExisting(kind: "av" | "bn") {
    const url = kind === "av" ? avUrl : bnUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const file = new File([blob], `${kind}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      setCropTarget({ kind, file });
    } catch {
      /* 取得できない場合は諦める（新規アップロードで代替可能） */
    }
  }

  function applyCrop(blob: Blob) {
    if (!cropTarget) return;
    const { kind } = cropTarget;
    const file = new File([blob], `${kind}.jpg`, { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(blob);
    const setter = kind === "av" ? setAv : setBn;
    setter((p) => {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return { mode: "new", file, previewUrl };
    });
    setCropTarget(null);
  }

  async function save() {
    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        bio: bio.trim(),
        emoji,
        theme,
        avTheme,
        status: status.trim(),
        av,
        bn,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="editbar">
        <button className="x" onClick={onCancel} aria-label="キャンセル">
          ✕
        </button>
        <div className="t">プロフィールを編集</div>
        <button className="pill solid editSaveButton" disabled={busy} onClick={save}>
          {busy ? "保存中…" : "変更を保存"}
        </button>
      </div>

      <input
        ref={avInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick("av", e)}
      />
      <input
        ref={bnInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick("bn", e)}
      />

      <div className="xcard">
        <div
          className="ebanner"
          style={bnUrl ? { background: "none" } : { background: grad(theme) }}
          onClick={() => setBannerMenuOpen(true)}
        >
          {bnUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bnUrl} alt="" />
          )}
          <div className="camov">
            <CameraIcon />
          </div>
          <div className="editStatusBubble" onClick={(e) => e.stopPropagation()}>
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              maxLength={60}
              placeholder="今のひとこと"
              aria-label="今のひとこと"
            />
          </div>
        </div>
        <div
          className="eav"
          style={!avUrl ? { background: grad(avTheme) } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setIconMenuOpen(true);
          }}
        >
          {avUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avUrl} alt="" />
          ) : (
            <span>{emoji}</span>
          )}
          <div className="camov">
            <CameraIcon />
          </div>
        </div>
        <div className="efields">
          <div className="efield">
            <div className="el">名前</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="名前を追加"
            />
          </div>
          <div className="efield">
            <div className="el">自己紹介</div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={800}
              placeholder="自己紹介を追加"
            />
            <div className="ecount">{bio.length} / 800</div>
          </div>
        </div>
      </div>

      {iconMenuOpen && (
        <div className="modalScrim" onClick={() => setIconMenuOpen(false)}>
          <div
            className="card iconChoiceModal"
            role="dialog"
            aria-modal="true"
            aria-label="アイコンを変更"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>アイコンを変更</h2>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                setIconMenuOpen(false);
                avInput.current?.click();
              }}
            >
              画像を選ぶ
            </button>
            {avUrl && av.mode !== "remove" && (
              <>
                <button className="btn ghost" onClick={() => {
                  setIconMenuOpen(false);
                  void adjustExisting("av");
                }}>
                  画像の位置を調整
                </button>
                <button className="textDangerButton iconRemoveButton" onClick={() => {
                  setAv({ mode: "remove" });
                  setIconMenuOpen(false);
                }}>
                  画像を削除
                </button>
              </>
            )}
            <div className="iconChoiceDivider">または</div>
            <label className="f" htmlFor="profile-emoji">絵文字を使う</label>
            <div className="emojiInputRow">
              <input
                id="profile-emoji"
                className="emojiFreeInput"
                type="text"
                value={emoji}
                onChange={(e) => {
                  const candidate = firstCharacter(e.target.value);
                  if (candidate && !isEmojiGrapheme(candidate)) {
                    e.target.value = emoji; // 絵文字以外の入力は表示を元に戻す
                    return;
                  }
                  setEmoji(candidate);
                  setAv({ mode: "remove" });
                }}
                placeholder="絵文字を入力"
                autoComplete="off"
              />
              <span className="emojiPreview" style={{ background: grad(avTheme) }}>
                {emoji || "🙂"}
              </span>
            </div>
            <div className="fieldHint">絵文字を1つだけ入力できます。</div>
            <label className="f">アイコンの背景色</label>
            <div className="emojis colorPalette" aria-label="アイコンの背景色">
              {COLORS.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`アイコンカラー${i + 1}`}
                  className={`em colorSwatch ${avTheme === i ? "on" : ""}`}
                  style={{ background: `linear-gradient(135deg,${c[0]},${c[1]})` }}
                  onClick={() => setAvTheme(i)}
                />
              ))}
            </div>
            <button type="button" className="btn sig" onClick={() => setIconMenuOpen(false)}>
              決定
            </button>
          </div>
        </div>
      )}

      {bannerMenuOpen && (
        <div className="modalScrim" onClick={() => setBannerMenuOpen(false)}>
          <div
            className="card iconChoiceModal"
            role="dialog"
            aria-modal="true"
            aria-label="ヘッダーを変更"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>ヘッダーを変更</h2>
            <button type="button" className="btn ghost" onClick={() => {
              setBannerMenuOpen(false);
              bnInput.current?.click();
            }}>
              画像を選ぶ
            </button>
            {bnUrl && bn.mode !== "remove" && (
              <>
                <button className="btn ghost" onClick={() => {
                  setBannerMenuOpen(false);
                  void adjustExisting("bn");
                }}>
                  画像の位置を調整
                </button>
                <button className="textDangerButton iconRemoveButton" onClick={() => {
                  setBn({ mode: "remove" });
                  setBannerMenuOpen(false);
                }}>
                  画像を削除
                </button>
              </>
            )}
            <div className="iconChoiceDivider">または背景色を選ぶ</div>
            <div className="emojis colorPalette headerColors" aria-label="ヘッダーの背景色">
              {COLORS.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`カラー${i + 1}`}
                  className={`em colorSwatch ${theme === i && !bnUrl ? "on" : ""}`}
                  style={{ background: `linear-gradient(135deg,${c[0]},${c[1]})` }}
                  onClick={() => {
                    setTheme(i);
                    setBn({ mode: "remove" });
                  }}
                />
              ))}
            </div>
            <button type="button" className="btn sig" onClick={() => setBannerMenuOpen(false)}>
              決定
            </button>
          </div>
        </div>
      )}

      {cropTarget && (
        <ImageCropper
          file={cropTarget.file}
          shape={cropTarget.kind === "av" ? "circle" : "rect"}
          aspect={BANNER_ASPECT}
          title={cropTarget.kind === "av" ? "アイコンの位置を調整" : "ヘッダーの位置を調整"}
          onCancel={() => setCropTarget(null)}
          onConfirm={applyCrop}
        />
      )}
    </div>
  );
}
