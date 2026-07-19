"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function ContactPageContent() {
  const searchParams = useSearchParams();
  const requestedCategory = ["report", "privacy"].includes(searchParams.get("category") ?? "")
    ? searchParams.get("category")!
    : "inquiry";
  const [category, setCategory] = useState(requestedCategory);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pageUrl, setPageUrl] = useState(() =>
    (searchParams.get("page") ?? "").slice(0, 2000),
  );
  const [website, setWebsite] = useState("");
  const [aiConsent, setAiConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    setCategory(requestedCategory);
  }, [requestedCategory]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (category === "privacy" && !email.trim()) {
      setError("個人情報に関するご請求には、返信先メールアドレスが必要です。");
      return;
    }
    if (category === "report" && !pageUrl.trim()) {
      setError("通報するページのURLを入力してください");
      return;
    }
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
      p_ai_consent: aiConsent,
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
    setAiConsent(false);
  }

  return (
    <main className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <div className="top">
        <Link className="logo" href="/" aria-label="via-mi ホーム">via-mi</Link>
      </div>
      <h1>お問い合わせ・通報</h1>
      <div className="lead">返信が必要な場合のみメールアドレスを入力してください。</div>
      <form className="card" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        <label className="f" htmlFor="contact-category">種別</label>
        <select id="contact-category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="inquiry">一般のお問い合わせ</option>
          <option value="report">不適切なページの通報</option>
          <option value="privacy">個人情報・削除のご請求</option>
          <option value="other">その他</option>
        </select>
        <label className="f" htmlFor="contact-email">
          返信先メールアドレス{category === "privacy" ? "（必須）" : "（任意）"}
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          maxLength={254}
          required={category === "privacy"}
          onChange={(e) => setEmail(e.target.value)}
        />
        {category === "privacy" && (
          <div className="hint">
            運営者情報の確認、または開示・訂正・利用停止・削除など希望する対応を本文に入力してください。
            登録情報に関する請求では対象IDも入力してください。
          </div>
        )}
        <label className="f" htmlFor="contact-page">対象ページURL{category === "report" ? "" : "（任意）"}</label>
        <input
          id="contact-page"
          type="url"
          value={pageUrl}
          maxLength={2000}
          required={category === "report"}
          onChange={(e) => setPageUrl(e.target.value)}
          placeholder="https://via-mi.com/@handle"
        />
        <label className="f" htmlFor="contact-message">内容（20〜4000文字）</label>
        <textarea id="contact-message" value={message} minLength={20} maxLength={4000} required rows={9} onChange={(e) => setMessage(e.target.value)} />
        <label className="checkRow">
          <input
            type="checkbox"
            checked={aiConsent}
            onChange={(event) => setAiConsent(event.target.checked)}
          />
          <span>内容をAIに送り、返信案を作成することに同意します（任意）</span>
        </label>
        <div className="hint">
          AIが作るのは運営者向けの返信案だけです。メールアドレスとIPアドレスはAIへ送りません。
        </div>
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

export default function ContactPage() {
  return (
    <Suspense fallback={<main className="wrap" style={{ paddingTop: 24 }}>読み込み中…</main>}>
      <ContactPageContent />
    </Suspense>
  );
}
