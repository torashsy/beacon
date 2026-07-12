"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/beacon/types";
import { COLORS, EMOJIS, grad } from "@/lib/beacon/constants";
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
  status: string;
  av: ImageEdit;
  bn: ImageEdit;
}

const currentUrl = (edit: ImageEdit, keepUrl: string): string =>
  edit.mode === "new" ? (edit.previewUrl ?? "") : edit.mode === "keep" ? keepUrl : "";

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
  const [emoji, setEmoji] = useState(profile.emoji || EMOJIS[0]);
  const [theme, setTheme] = useState(profile.theme ?? 0);
  const [status, setStatus] = useState(profile.status ?? "");
  const [av, setAv] = useState<ImageEdit>({ mode: "keep" });
  const [bn, setBn] = useState<ImageEdit>({ mode: "keep" });
  const [busy, setBusy] = useState(false);
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
        <button className="pill solid" disabled={busy} onClick={save}>
          {busy ? "保存中…" : "保存"}
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
          onClick={() => bnInput.current?.click()}
        >
          {bnUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bnUrl} alt="" />
          )}
          <div className="camov">
            <CameraIcon />
          </div>
        </div>
        <div
          className="eav"
          onClick={(e) => {
            e.stopPropagation();
            avInput.current?.click();
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
          {avUrl && av.mode !== "remove" && (
            <>
              <button className="editimg" onClick={() => adjustExisting("av")}>
                アイコンの位置を調整
              </button>
              <button
                className="rmimg"
                onClick={() => setAv({ mode: "remove" })}
              >
                アイコン画像を削除
              </button>
            </>
          )}
          {bnUrl && bn.mode !== "remove" && (
            <>
              <button className="editimg" onClick={() => adjustExisting("bn")}>
                ヘッダーの位置を調整
              </button>
              <button
                className="rmimg"
                onClick={() => setBn({ mode: "remove" })}
              >
                ヘッダー画像を削除
              </button>
            </>
          )}
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
              maxLength={200}
              placeholder="自己紹介を追加"
            />
            <div className="ecount">{bio.length} / 200</div>
          </div>
          <div className="efield">
            <div className="el">今のひとこと（近況）</div>
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              maxLength={60}
              placeholder="例: 今はInstagramが動いてます / DM開放中"
            />
          </div>
          <label className="f">画像を使わない場合のアイコン</label>
          <div className="emojis">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                className={`em ${em === emoji && !avUrl ? "on" : ""}`}
                onClick={() => {
                  setEmoji(em);
                  setAv({ mode: "remove" }); // 絵文字選択でアイコン画像は外す
                }}
              >
                {em}
              </button>
            ))}
          </div>
          <label className="f">ヘッダーの色（画像を使わない場合）</label>
          <div className="emojis">
            {COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                aria-label={`カラー${i + 1}`}
                className={`em ${theme === i && !bnUrl ? "on" : ""}`}
                style={{ background: `linear-gradient(135deg,${c[0]},${c[1]})` }}
                onClick={() => {
                  setTheme(i);
                  setBn({ mode: "remove" }); // 色選択でヘッダー画像は外す
                }}
              />
            ))}
          </div>
        </div>
      </div>

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
