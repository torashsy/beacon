"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadStoredSession } from "@/lib/beacon/session";

type Account = {
  handle: string;
  created_at: string;
  suspended: boolean;
  reason: string;
};
type Report = {
  id: string;
  category: string;
  message: string;
  page_url: string;
  email: string;
  status: string;
  created_at: string;
};
type Gate = "loading" | "unauth" | "forbidden" | "error" | "ready";

const CATEGORY_LABEL: Record<string, string> = {
  report: "通報",
  privacy: "削除請求",
  inquiry: "問い合わせ",
  other: "その他",
};
const STATUS_LABEL: Record<string, string> = {
  new: "未対応",
  reviewing: "確認中",
  resolved: "対応済み",
  rejected: "却下",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function AdminPanel() {
  const db = useMemo(() => createClient(), []);
  const [session, setSession] = useState<{ handle: string; token: string } | null>(null);
  const [gate, setGate] = useState<Gate>("loading");
  const [tab, setTab] = useState<"accounts" | "reports">("accounts");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const call = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      const s = loadStoredSession();
      if (!s) throw new Error("unauth");
      const { data, error } = await db.functions.invoke("admin", {
        body: { handle: s.handle, token: s.token, action, params },
      });
      if (error) {
        const status = (error as { context?: Response }).context?.status;
        if (status === 403) throw new Error("forbidden");
        if (status === 401) throw new Error("unauth");
        throw error;
      }
      return data as Record<string, unknown>;
    },
    [db],
  );

  const loadAccounts = useCallback(
    async (q = "") => {
      const data = await call("list_accounts", { q });
      setAccounts((data.accounts as Account[]) ?? []);
    },
    [call],
  );

  const loadReports = useCallback(async () => {
    const data = await call("list_reports", {});
    setReports((data.reports as Report[]) ?? []);
  }, [call]);

  useEffect(() => {
    const s = loadStoredSession();
    setSession(s);
    if (!s) {
      setGate("unauth");
      return;
    }
    void (async () => {
      try {
        await loadAccounts();
        setGate("ready");
        void loadReports().catch(() => {});
      } catch (error) {
        const m = String((error as Error).message);
        setGate(m === "forbidden" ? "forbidden" : m === "unauth" ? "unauth" : "error");
      }
    })();
  }, [loadAccounts, loadReports]);

  async function toggleSuspend(a: Account) {
    let reason = a.reason;
    if (!a.suspended) {
      const input = window.prompt(`@${a.handle} を凍結します。理由（任意）:`, "");
      if (input === null) return;
      reason = input;
    } else if (!window.confirm(`@${a.handle} の凍結を解除しますか？`)) {
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await call("set_suspension", { target: a.handle, suspended: !a.suspended, reason });
      await loadAccounts(query);
      setMsg(`@${a.handle} を${a.suspended ? "解除" : "凍結"}しました`);
    } catch {
      setMsg("操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function setReportStatus(r: Report, status: string) {
    setBusy(true);
    setMsg("");
    try {
      await call("set_report_status", { id: r.id, status });
      await loadReports();
      setMsg("状態を更新しました");
    } catch {
      setMsg("操作に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    setBusy(true);
    try {
      await loadAccounts(query);
    } finally {
      setBusy(false);
    }
  }

  if (gate === "loading") {
    return <main className="adminView"><p className="adminNote">読み込み中…</p></main>;
  }
  if (gate === "unauth") {
    return (
      <main className="adminView">
        <h1>管理</h1>
        <p className="adminNote">この端末でログインしてから開いてください。</p>
        <Link className="btn sig adminInline" href="/">トップへ</Link>
      </main>
    );
  }
  if (gate === "forbidden") {
    return (
      <main className="adminView">
        <h1>管理</h1>
        <p className="adminNote">
          このID（@{session?.handle}）には管理者権限がありません。
        </p>
      </main>
    );
  }
  if (gate === "error") {
    return (
      <main className="adminView">
        <h1>管理</h1>
        <p className="adminNote">読み込みに失敗しました。時間をおいて再度お試しください。</p>
      </main>
    );
  }

  const pendingReports = reports.filter((r) => r.status === "new" || r.status === "reviewing").length;

  return (
    <main className="adminView">
      <h1>管理</h1>
      <div className="adminTabs" role="group" aria-label="管理タブ">
        <button className={tab === "accounts" ? "on" : ""} onClick={() => setTab("accounts")}>
          アカウント
        </button>
        <button className={tab === "reports" ? "on" : ""} onClick={() => setTab("reports")}>
          通報・問い合わせ{pendingReports > 0 ? `（${pendingReports}）` : ""}
        </button>
      </div>

      {msg && <p className="adminMsg" role="status">{msg}</p>}

      {tab === "accounts" ? (
        <>
          <div className="adminSearch">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())}
              placeholder="IDで検索（前方一致）"
              onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
            />
            <button className="pill line" disabled={busy} onClick={() => void search()}>検索</button>
          </div>
          <div className="adminList">
            {accounts.length === 0 ? (
              <p className="adminNote">該当するアカウントがありません。</p>
            ) : (
              accounts.map((a) => (
                <div className={`adminRow ${a.suspended ? "suspended" : ""}`} key={a.handle}>
                  <div className="adminRowMain">
                    <Link className="adminHandle" href={`/@${a.handle}`} target="_blank">
                      @{a.handle}
                    </Link>
                    <span className="adminMeta">
                      {fmtDate(a.created_at)}
                      {a.suspended && <span className="adminBadge">凍結中</span>}
                    </span>
                    {a.suspended && a.reason && <span className="adminReason">理由: {a.reason}</span>}
                  </div>
                  <button
                    className={`pill ${a.suspended ? "line" : "solid danger"}`}
                    disabled={busy}
                    onClick={() => void toggleSuspend(a)}
                  >
                    {a.suspended ? "解除" : "凍結"}
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      ) : (
        <div className="adminList">
          {reports.length === 0 ? (
            <p className="adminNote">通報・問い合わせはありません。</p>
          ) : (
            reports.map((r) => (
              <div className={`adminReport status-${r.status}`} key={r.id}>
                <div className="adminReportHead">
                  <span className="adminBadge">{CATEGORY_LABEL[r.category] ?? r.category}</span>
                  <span className="adminMeta">{fmtDate(r.created_at)}</span>
                  <span className="adminStatus">{STATUS_LABEL[r.status] ?? r.status}</span>
                </div>
                {r.page_url && (
                  <a className="adminHandle" href={r.page_url} target="_blank" rel="noreferrer">
                    {r.page_url}
                  </a>
                )}
                <p className="adminReportBody">{r.message}</p>
                {r.email && <p className="adminMeta">返信先: {r.email}</p>}
                <div className="adminReportActions">
                  {r.status !== "resolved" && (
                    <button className="pill line" disabled={busy} onClick={() => void setReportStatus(r, "resolved")}>
                      対応済みに
                    </button>
                  )}
                  {r.status === "new" && (
                    <button className="pill line" disabled={busy} onClick={() => void setReportStatus(r, "reviewing")}>
                      確認中に
                    </button>
                  )}
                  {r.status !== "rejected" && r.status !== "resolved" && (
                    <button className="pill line" disabled={busy} onClick={() => void setReportStatus(r, "rejected")}>
                      却下
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </main>
  );
}
