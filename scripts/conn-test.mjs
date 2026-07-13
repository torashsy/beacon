// Supabase 疎通スモークテスト（ローカル実行用）。
//
//   node scripts/conn-test.mjs
//
// .env.local の URL / publishable key（旧 anon key も可）を使い、
// 全RPC（create_account〜delete_account）・RLS 公開読み取り・Storage(avatars)を
// ランダムなハンドルで通しで検証し、最後に退会して後片付けする。
// SETUP.md 手順2（schema.sql 適用）・手順3（avatars バケット+anonポリシー）が
// 済んでいれば「全項目 OK」になる。
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// .env.local を読む
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(url, key);

const log = (ok, label, extra = "") =>
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);

const handle = "conntest_" + Math.random().toString(36).slice(2, 8);
const pass = "correct-horse-1";
const today = new Date().toISOString().slice(0, 10);
const d2 = "2026-08-15";
let rc = "";
let failures = 0;
const fail = (label, e) => {
  failures++;
  log(false, label, String(e?.message ?? e));
};

async function rpc(name, args) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error(error.message);
  return data;
}

try {
  // 1. create_account
  try {
    rc = await rpc("create_account", { p_handle: handle, p_pass: pass });
    log(!!rc, `create_account (@${handle})`, `rc=${rc}`);
    if (!rc) failures++;
  } catch (e) {
    fail("create_account", e);
    throw new Error("SCHEMA_MISSING");
  }

  // 2. verify_login 正
  try {
    const ok = await rpc("verify_login", { p_handle: handle, p_pass: pass });
    log(ok === true, "verify_login (正しいパス)", `→ ${ok}`);
    if (ok !== true) failures++;
  } catch (e) {
    fail("verify_login", e);
  }

  // 3. verify_login 誤
  try {
    const ng = await rpc("verify_login", { p_handle: handle, p_pass: "wrongpass" });
    log(ng === false, "verify_login (誤ったパス)", `→ ${ng}`);
    if (ng !== false) failures++;
  } catch (e) {
    fail("verify_login(誤)", e);
  }

  // 4. update_profile
  try {
    await rpc("update_profile", {
      p_handle: handle, p_pass: pass,
      p_name: "接続テスト", p_bio: "bio テスト", p_emoji: "🌊",
      p_theme: 2, p_av_theme: 7, p_av: "", p_bn: "", p_status: "テスト中",
    });
    log(true, "update_profile");
  } catch (e) { fail("update_profile", e); }

  // 5. 公開ページ取得（get_public_page RPC）
  try {
    const page = await rpc("get_public_page", { p_handle: handle });
    const ok = page?.profile?.name === "接続テスト" && page?.profile?.emoji === "🌊"
      && page?.profile?.av_theme === 7;
    log(ok, "get_public_page（プロフィール）", `name=${page?.profile?.name}, av_theme=${page?.profile?.av_theme}`);
    if (!ok) failures++;
  } catch (e) { fail("get_public_page", e); }

  // 5b. 【セキュリティ】profiles への直接 select は拒否されること（列挙防止）
  try {
    const { data, error } = await db.from("profiles").select("*").limit(5);
    const blocked = !!error || !data || data.length === 0;
    log(blocked, "列挙防止: profiles 直接 select 不可", error ? error.message : `返った行=${data?.length ?? 0}`);
    if (!blocked) failures++;
  } catch { log(true, "列挙防止: profiles 直接 select 不可"); }

  // フォローID一覧は本人だけ、公開側には合計人数だけを返す
  try {
    await rpc("save_my_follows", {
      p_handle: handle,
      p_pass: pass,
      p_targets: [handle],
    });
    const mine = await rpc("get_my_follows", { p_handle: handle, p_pass: pass });
    const count = await rpc("get_follower_count", { p_handle: handle });
    const ok = mine?.[0]?.target === handle && Number(count) === 1;
    log(ok, "follows private / follower count public", `count=${count}`);
    if (!ok) failures++;
  } catch (e) { fail("follower count", e); }

  // 6. save_channels
  try {
    await rpc("save_channels", {
      p_handle: handle, p_pass: pass,
      p_channels: [
        { type: "x", url: "https://x.com/test", label: "メイン垢", desc: "DMこちら", status: "live" },
        { type: "line", url: "https://line.me/ti/p/xxx", label: "", desc: "", status: "dead" },
      ],
    });
    log(true, "save_channels");
  } catch (e) { fail("save_channels", e); }

  // 7. channels を get_public_page 経由で確認（position順・desc→descr吸収）
  try {
    const page = await rpc("get_public_page", { p_handle: handle });
    const ch = page?.channels ?? [];
    const ok = ch.length === 2 && ch[0].type === "x" && ch[0].descr === "DMこちら" && ch[1].status === "dead";
    log(ok, "get_public_page（リンク）", `${ch.length}件 / descr='${ch?.[0]?.descr}'`);
    if (!ok) failures++;
  } catch (e) { fail("get_public_page channels", e); }

  // 8-9. save_cal 公開/非公開
  try {
    await rpc("save_cal", { p_handle: handle, p_pass: pass, p_date: today, p_memo: "20時以降 空きあり", p_pub: true });
    await rpc("save_cal", { p_handle: handle, p_pass: pass, p_date: d2, p_memo: "非公開メモ", p_pub: false });
    log(true, "save_cal (公開+非公開)");
  } catch (e) { fail("save_cal", e); }

  // 10. 公開カレンダーを get_public_page 経由で確認
  try {
    const page = await rpc("get_public_page", { p_handle: handle });
    const c = page?.cal ?? [];
    const ok = c.length === 1 && c[0].memo === "20時以降 空きあり";
    log(ok, "get_public_page（公開カレンダー）", `${c.length}件`);
    if (!ok) failures++;
  } catch (e) { fail("get_public_page cal", e); }

  // 11. cal_private は匿名で直接読めないこと（RLSでSELECTポリシー無し）
  try {
    const { data } = await db.from("cal_private").select("*").eq("handle", handle);
    const ok = !data || data.length === 0;
    log(ok, "cal_private は匿名で読めない（RLS）", `見えた行=${data?.length ?? 0}`);
    if (!ok) failures++;
  } catch { log(true, "cal_private は匿名で読めない（RLS）"); }

  // 12. get_private_cal（要パス）
  try {
    const data = await rpc("get_private_cal", { p_handle: handle, p_pass: pass });
    const ok = data?.length === 1 && data[0].memo === "非公開メモ";
    log(ok, "get_private_cal (要パス)", `${data?.length}件`);
    if (!ok) failures++;
  } catch (e) { fail("get_private_cal", e); }

  // 13. reset_pass（復旧コードで再設定）
  try {
    await rpc("reset_pass", { p_handle: handle, p_rc: rc, p_new: "new-correct-horse-2" });
    const ok = await rpc("verify_login", { p_handle: handle, p_pass: "new-correct-horse-2" });
    log(ok === true, "reset_pass → 新パスでログイン", `→ ${ok}`);
    if (ok !== true) failures++;
  } catch (e) { fail("reset_pass", e); }

  // 14. Storage: 匿名INSERTは拒否され、認証済みEdge Function経由だけ成功する
  try {
    const buf = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z",
      "base64",
    );
    const anonymousPath = `${handle}/anonymous-${Date.now()}.jpg`;
    const anonymous = await db.storage
      .from("avatars")
      .upload(anonymousPath, buf, { contentType: "image/jpeg" });
    const blocked = !!anonymous.error;
    log(blocked, "Storage anonymous INSERT blocked", anonymous.error?.message ?? "unexpected success");
    if (!blocked) failures++;

    const sessionToken = await rpc("create_session", {
      p_handle: handle,
      p_pass: "new-correct-horse-2",
    });
    const response = await fetch(`${url}/functions/v1/create-avatar-upload`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ handle, secret: sessionToken, kind: "av" }),
    });
    const grant = await response.json();
    if (!response.ok) throw new Error(grant.error ?? `function ${response.status}`);
    const signed = await db.storage
      .from("avatars")
      .uploadToSignedUrl(grant.path, grant.token, buf, { contentType: "image/jpeg" });
    if (signed.error) throw signed.error;
    const { data: pub } = db.storage.from("avatars").getPublicUrl(grant.path);
    log(!!pub.publicUrl, "Storage signed upload (authenticated)", pub.publicUrl);
  } catch (e) {
    log(false, "Storage authenticated upload", String(e?.message ?? e) + "  ← SETUP手順3を確認");
    failures++;
  }

  // 15. delete_account（後片付け）
  try {
    await rpc("delete_account", { p_handle: handle, p_pass: "new-correct-horse-2" });
    const { data } = await db.from("profiles").select("handle").eq("handle", handle).maybeSingle();
    const ok = !data;
    log(ok, "delete_account（退会・後片付け）", ok ? "プロフィール消滅を確認" : "まだ残っている");
    if (!ok) failures++;
  } catch (e) { fail("delete_account", e); }
} catch (e) {
  if (String(e.message).includes("SCHEMA_MISSING")) {
    console.log("\n⚠️  create_account が無い＝スキーマ未適用の可能性。SETUP.md 手順2で supabase/schema.sql を Run してください。");
  }
}

console.log(`\n===== 結果: ${failures === 0 ? "全項目 OK ✅" : failures + " 件 失敗 ❌"} =====`);
process.exit(failures === 0 ? 0 : 1);
