"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ContactPage() {
  const [category, setCategory] = useState("inquiry");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (message.trim().length < 20) {
      setError("内容を20文字以上で入力してください");
      return;
    }
    setState("sending");
    setError("");
    const { error: rpcError } = await createClient().rpc("submit_contact", {
      p_category: category,
      p_email: email,
      p_message: message,
      p_page_url: pageUrl,
      p_website: website,
    });
    if (rpcError) {
      setState("error");
      setError(
        rpcError.message.includes("rate limit")
          ? "本日の送信上限に達しました。時間をおいてお試しください"
          : "送信できませんでした。入力内容を確認して再度お試しください",
      );
      return;
    }
    setState("sent");
    setMessage("");
    setPageUrl("");
  }

  return (
    <main className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <div className="top">
        <Link className="logo" href="/" aria-label="via-mi ホーム">via-mi</Link>
      </div>
      <h1>お問い合わせ・通報</h1>
      <div className="lead">返信が必要な場合のみメールアドレスを入力してください。</div>
      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label className="f">種別</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="inquiry">一般のお問い合わせ</option>
          <option value="report">不適切なページの通報</option>
          <option value="privacy">個人情報・削除のご請求</option>
          <option value="other">その他</option>
        </select>
        <label className="f">返信先メールアドレス（任意）</label>
        <input type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
        <label className="f">対象ページURL（任意）</label>
        <input type="url" value={pageUrl} maxLength={2000} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://…/@handle" />
        <label className="f">内容（20〜4000文字）</label>
        <textarea value={message} minLength={20} maxLength={4000} required rows={9} onChange={(e) => setMessage(e.target.value)} />
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px" }}>
          <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
        </div>
        {error && <div className="hint no">{error}</div>}
        {state === "sent" && <div className="hint ok">送信しました。ありがとうございます。</div>}
        <button className="btn sig" disabled={state === "sending"} type="submit">
          {state === "sending" ? "送信中…" : "送信する"}
        </button>
      </form>
      <div className="lead" style={{ marginTop: 18 }}>
        お問い合わせ・通報はこのフォームで受け付けています。
      </div>
    </main>
  );
}
