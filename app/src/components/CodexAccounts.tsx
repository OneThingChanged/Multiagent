import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";

type Account = { id: string; label: string; state: string };
const stateLabels: Record<string, string> = {
  default: "현재 Codex 환경 사용", empty: "로그인 필요", pending: "브라우저에서 로그인 중…",
  saved: "로그인 저장됨", failed: "로그인 실패 · 다시 시도하세요", cancelled: "로그인 취소됨",
};

export function CodexAccountSelect({ value, onChange, disabled = false }: {
  value?: string; onChange: (id: string) => void; disabled?: boolean;
}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    invoke<Account[]>("codex_accounts_list").then((list) => { if (live) setAccounts(list); })
      .catch((e) => { if (live) setError(String(e)); });
    return () => { live = false; };
  }, []);
  return <label className="field">
    <span className="field-label">Codex 계정</span>
    <select value={value || "default"} disabled={disabled || !!error} onChange={(e) => onChange(e.target.value)}>
      <option value="default">기존 로그인</option>
      {value && value !== "default" && !accounts.some((a) => a.id === value) && <option value={value}>선택된 계정 (확인 필요)</option>}
      {accounts.filter((a) => a.id !== "default").map((a) =>
        <option key={a.id} value={a.id} disabled={a.state !== "saved"}>{a.label} · {stateLabels[a.state]}</option>)}
    </select>
    <span className="check-hint">계정 추가·로그인: 설정 → 에이전트 → Codex 계정</span>
    {error && <span role="alert">{error}</span>}
  </label>;
}

export function CodexAccountsPanel() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => setAccounts(await invoke<Account[]>("codex_accounts_list"));
  useEffect(() => {
    let live = true;
    const poll = () => invoke<Account[]>("codex_accounts_list")
      .then((list) => { if (live) setAccounts(list); })
      .catch((e) => { if (live) setError(String(e)); });
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => { live = false; window.clearInterval(timer); };
  }, []);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await action(); await refresh(); } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };
  const pending = accounts.some((a) => a.state === "pending");
  return <section className="app-settings-section">
    <h3>Codex 계정</h3>
    <p className="check-hint">계정별로 한 번 로그인한 후 세션의 실행 옵션에서 선택하세요. 브라우저에서 원하는 계정으로 로그인했는지 확인하세요. 계정별 Codex 설정·기록은 별도로 저장됩니다. 로컬 세션에서 지원합니다.</p>
    {accounts.map((a) => <div className="folder-row" key={a.id} style={{ marginBottom: 8 }}>
      <span style={{ flex: 1 }}>{a.label} · {stateLabels[a.state] || a.state}</span>
      {a.id !== "default" && (a.state === "pending"
        ? <button className="btn-secondary" disabled={busy} onClick={() => void run(() => invoke("codex_accounts_cancel_login"))}>취소</button>
        : <button className="btn-secondary" disabled={busy || pending} onClick={() => void run(() => invoke("codex_accounts_login", { accountId: a.id }))}>브라우저 로그인</button>)}
    </div>)}
    <div className="folder-row">
      <input aria-label="Codex 계정 이름" placeholder="계정 이름 (예: 개인, 업무)" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
      <button className="btn-secondary" disabled={busy || !label.trim()} onClick={() => void run(async () => {
        await invoke("codex_accounts_create", { label: label.trim() }); setLabel("");
      })}>계정 추가</button>
    </div>
    {pending && <p role="status">브라우저에서 로그인을 완료하세요. 로그인 대기는 최대 5분입니다.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
