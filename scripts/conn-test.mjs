// Supabase 疎通スモークテスト（ローカル実行用）。
//
//   node scripts/conn-test.mjs
//
// .env.local の NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY を使い、
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
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db = createClient(url, key);

const log = (ok, label, extra = "") =>
  console.log(`${ok ? "✅" : "❌"} ${label}${extra ? " — " + extra : ""}`);

const handle = "conntest_" + Math.random().toString(36).slice(2, 8);
const pass = "abcdef";
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
      p_theme: 2, p_av: "", p_bn: "",
    });
    log(true, "update_profile");
  } catch (e) { fail("update_profile", e); }

  // 5. profiles を公開読み取り（RLS）
  try {
    const { data, error } = await db.from("profiles").select("*").eq("handle", handle).maybeSingle();
    if (error) throw error;
    const ok = data?.name === "接続テスト" && data?.emoji === "🌊" && data?.theme === 2;
    log(ok, "profiles 公開読み取り", `name=${data?.name}`);
    if (!ok) failures++;
  } catch (e) { fail("profiles select", e); }

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

  // 7. channels 公開読み取り（position順・desc→descr吸収確認）
  try {
    const { data, error } = await db.from("channels").select("*").eq("handle", handle).order("position", { ascending: true });
    if (error) throw error;
    const ok = data?.length === 2 && data[0].type === "x" && data[0].descr === "DMこちら" && data[1].status === "dead";
    log(ok, "channels 公開読み取り", `${data?.length}件 / descr='${data?.[0]?.descr}'`);
    if (!ok) failures++;
  } catch (e) { fail("channels select", e); }

  // 8-9. save_cal 公開/非公開
  try {
    await rpc("save_cal", { p_handle: handle, p_pass: pass, p_date: today, p_memo: "20時以降 空きあり", p_pub: true });
    await rpc("save_cal", { p_handle: handle, p_pass: pass, p_date: d2, p_memo: "非公開メモ", p_pub: false });
    log(true, "save_cal (公開+非公開)");
  } catch (e) { fail("save_cal", e); }

  // 10. cal_public 公開読み取り
  try {
    const { data, error } = await db.from("cal_public").select("d, memo").eq("handle", handle);
    if (error) throw error;
    const ok = data?.length === 1 && data[0].memo === "20時以降 空きあり";
    log(ok, "cal_public 公開読み取り", `${data?.length}件`);
    if (!ok) failures++;
  } catch (e) { fail("cal_public select", e); }

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
    await rpc("reset_pass", { p_handle: handle, p_rc: rc, p_new: "newpass1" });
    const ok = await rpc("verify_login", { p_handle: handle, p_pass: "newpass1" });
    log(ok === true, "reset_pass → 新パスでログイン", `→ ${ok}`);
    if (ok !== true) failures++;
  } catch (e) { fail("reset_pass", e); }

  // 14. Storage: avatars バケット + anon insert ポリシー
  try {
    const buf = Buffer.from(
      "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8Qf//Z",
      "base64",
    );
    const path = `${handle}/av.jpg`;
    const up = await db.storage.from("avatars").upload(path, buf, { upsert: true, contentType: "image/jpeg" });
    if (up.error) throw up.error;
    const { data: pub } = db.storage.from("avatars").getPublicUrl(path);
    log(!!pub.publicUrl, "Storage avatars upload (anon)", pub.publicUrl);
    await db.storage.from("avatars").remove([path]);
  } catch (e) {
    // バケット未作成/ポリシー未設定はここで検出
    log(false, "Storage avatars upload (anon)", String(e?.message ?? e) + "  ← SETUP手順3を確認");
    failures++;
  }

  // 15. delete_account（後片付け）
  try {
    await rpc("delete_account", { p_handle: handle, p_pass: "newpass1" });
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
