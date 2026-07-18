"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 画像アップロード。HANDOFF の指示に従う:
 *   - Base64 で DB に入れない。Supabase Storage 'avatars' バケットへ。
 *   - アップロード前に canvas 縮小（アイコン 256px / ヘッダー 800px）。
 *
 * パス規約: {handle}/{kind}-{timestamp}.jpg（アップロードごとにユニーク）。
 *   当初は {handle}/av.jpg の固定パス上書き（upsert）を想定していたが、Supabase の
 *   upsert は INSERT ... ON CONFLICT DO UPDATE となり anon の UPDATE ポリシーまで
 *   要求する。セットアップを INSERT ポリシー1本で済ませられるよう、毎回ユニークな
 *   ファイル名で純粋な INSERT を行う方式にした（古い画像はバケットに残るが、
 *   プロフィールが参照するのは常に最新 URL のみ）。
 */

const BUCKET = "avatars";

export type ImageKind = "av" | "bn" | "photo";

export const IMAGE_SETTINGS: Record<ImageKind, { maxEdge: number; quality: number }> = {
  av: { maxEdge: 256, quality: 0.86 },
  bn: { maxEdge: 1200, quality: 0.9 },
  photo: { maxEdge: 2560, quality: 0.92 },
};

/** File を受け取り、長辺を上限までリサイズして JPEG Blob を返す。 */
export async function resizeToJpeg(file: File, kind: ImageKind): Promise<Blob> {
  const max = IMAGE_SETTINGS[kind].maxEdge;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      IMAGE_SETTINGS[kind].quality,
    ),
  );
}

/** リサイズしてアップロードし、公開URLを返す。 */
export async function uploadImage(
  db: SupabaseClient,
  handle: string,
  secret: string,
  kind: ImageKind,
  file: File,
): Promise<string> {
  const blob = await resizeToJpeg(file, kind);
  const { data: grant, error: grantError } = await db.functions.invoke(
    "create-avatar-upload",
    { body: { handle, secret, kind } },
  );
  if (grantError || !grant?.path || !grant?.token) {
    throw new Error(grant?.error ?? grantError?.message ?? "upload authorization failed");
  }
  const { error } = await db.storage
    .from(BUCKET)
    .uploadToSignedUrl(grant.path, grant.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);

  const { data } = db.storage.from(BUCKET).getPublicUrl(grant.path);
  return data.publicUrl;
}
