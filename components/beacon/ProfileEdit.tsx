"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/beacon/types";
import { EMOJIS, grad } from "@/lib/beacon/constants";
import { CameraIcon } from "./icons";

/**
 * X風のプロフィール編集。beacon.html の prof-edit を移植。
 * 画像は base64 ではなく File を受け取り、保存時に storage.ts 経由で
 * 'avatars' バケットへアップロードする（実処理は onSave 側）。
 */

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
  const [av, setAv] = useState<ImageEdit>({ mode: "keep" });
  const [bn, setBn] = useState<ImageEdit>({ mode: "keep" });
  const [busy, setBusy] = useState(false);

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
    const previewUrl = URL.createObjectURL(file);
    if (kind === "av") {
      setAv((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        return { mode: "new", file, previewUrl };
      });
    } else {
      setBn((p) => {
        if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
        return { mode: "new", file, previewUrl };
      });
    }
  }

  const avUrl = currentUrl(av, profile.av_url);
  const bnUrl = currentUrl(bn, profile.bn_url);

  async function save() {
    setBusy(true);
    try {
      await onSave({ name: name.trim(), bio: bio.trim(), emoji, av, bn });
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
          style={bnUrl ? { background: "none" } : { background: grad(profile.theme) }}
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
            <button
              className="rmimg"
              onClick={() => setAv({ mode: "remove" })}
            >
              アイコン画像を削除
            </button>
          )}
          {bnUrl && bn.mode !== "remove" && (
            <button
              className="rmimg"
              onClick={() => setBn({ mode: "remove" })}
            >
              ヘッダー画像を削除
            </button>
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
        </div>
      </div>
    </div>
  );
}
