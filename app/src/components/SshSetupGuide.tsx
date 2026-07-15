import { useEffect, useState } from "react";
import { invoke } from "../platform/runtime";

type KeyState = "loading" | "ready" | "none" | "generating";

const PLACEHOLDER_KEY = "<여기에 위에서 복사한 공개키>";

export function SshSetupGuide({ onClose }: { onClose: () => void }) {
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [keyState, setKeyState] = useState<KeyState>("loading");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("get_ssh_public_key")
      .then((k) => {
        setPubKey(k ?? null);
        setKeyState(k ? "ready" : "none");
      })
      .catch(() => setKeyState("none"));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const generate = async () => {
    setKeyState("generating");
    try {
      const k = await invoke<string>("generate_ssh_key");
      setPubKey(k);
      setKeyState("ready");
    } catch {
      setKeyState("none");
    }
  };

  const copy = (text: string, id: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(id);
        setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
      })
      .catch(() => {});
  };

  const key = pubKey ?? PLACEHOLDER_KEY;

  const winAuthorizedKeys = `$key = "${key}"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)
if ($isAdmin) {
  $f = "$env:ProgramData\\ssh\\administrators_authorized_keys"
  Add-Content -Path $f -Value $key -Encoding ascii
  icacls $f /inheritance:r | Out-Null
  icacls $f /grant "Administrators:F" "SYSTEM:F" | Out-Null
} else {
  $d = "$env:USERPROFILE\\.ssh"
  New-Item -ItemType Directory -Force -Path $d | Out-Null
  Add-Content -Path "$d\\authorized_keys" -Value $key -Encoding ascii
}
Write-Host "done"`;

  const linuxAuthorizedKeys = `mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "${key}" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys`;

  const Code = ({ id, text }: { id: string; text: string }) => (
    <div className="ssh-guide-code">
      <pre>{text}</pre>
      <button
        className="btn-secondary ssh-guide-copy"
        onClick={() => copy(text, id)}
      >
        {copied === id ? "복사됨" : "복사"}
      </button>
    </div>
  );

  return (
    <div className="modal-backdrop ssh-guide-backdrop" onMouseDown={onClose}>
      <div
        className="modal ssh-guide-modal"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="app-settings-header">
          <h2 className="modal-title">SSH 원격 연결 — 사용 방법</h2>
          <button className="app-icon-btn" onClick={onClose} title="Close">
            ×
          </button>
        </div>

        <div className="ssh-guide-body">
          <p className="ssh-guide-intro">
            다른 컴퓨터에 SSH로 접속해 그 머신에서 터미널/Claude·Codex를 실행합니다.
            <b> 이 PC = 접속하는 쪽(클라이언트)</b>,{" "}
            <b>대상 = 접속당하는 쪽(서버)</b>. 아래 순서대로 한 번만 준비하면 됩니다.
          </p>

          <div className="ssh-guide-step">
            <div className="ssh-guide-step-title">1. 대상 컴퓨터에 SSH 서버 켜기</div>
            <div className="ssh-guide-note">대상이 Windows면 (관리자 PowerShell):</div>
            <Code
              id="win-server"
              text={`Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22`}
            />
            <div className="ssh-guide-note">대상이 Linux면:</div>
            <Code
              id="linux-server"
              text={`sudo apt install -y openssh-server
sudo systemctl enable --now ssh`}
            />
          </div>

          <div className="ssh-guide-step">
            <div className="ssh-guide-step-title">
              2. 이 PC의 공개키를 대상에 등록 (비밀번호 없이 접속)
            </div>
            <div className="ssh-guide-note">이 PC의 SSH 공개키:</div>
            {keyState === "loading" && (
              <div className="ssh-guide-keybox">불러오는 중…</div>
            )}
            {keyState === "none" && (
              <div className="ssh-guide-keybox">
                <span>아직 키가 없습니다.</span>
                <button className="btn-primary" onClick={generate}>
                  키 생성
                </button>
              </div>
            )}
            {keyState === "generating" && (
              <div className="ssh-guide-keybox">키 생성 중…</div>
            )}
            {keyState === "ready" && pubKey && (
              <div className="ssh-guide-code">
                <pre className="ssh-guide-key">{pubKey}</pre>
                <button
                  className="btn-secondary ssh-guide-copy"
                  onClick={() => copy(pubKey, "pubkey")}
                >
                  {copied === "pubkey" ? "복사됨" : "복사"}
                </button>
              </div>
            )}
            <div className="ssh-guide-note">
              대상이 Windows면 그 컴퓨터(관리자 PowerShell)에서:
            </div>
            <Code id="win-key" text={winAuthorizedKeys} />
            <div className="ssh-guide-note">대상이 Linux면 그 컴퓨터에서:</div>
            <Code id="linux-key" text={linuxAuthorizedKeys} />
          </div>

          <div className="ssh-guide-step">
            <div className="ssh-guide-step-title">3. 접속 정보 확인</div>
            <div className="ssh-guide-note">
              대상 컴퓨터에서 아래를 실행해 User / IP / OS를 확인 (아래 폼에 입력):
            </div>
            <div className="ssh-guide-note">Windows:</div>
            <Code
              id="win-info"
              text={`"User : $env:USERNAME"
"IP   : " + ((Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127\\.|169\\.254\\.)' }).IPAddress -join ', ')`}
            />
            <div className="ssh-guide-note">Linux/macOS:</div>
            <Code
              id="linux-info"
              text={`echo "User : $(whoami)"; echo "IP : $(hostname -I 2>/dev/null || ipconfig getifaddr en0)"`}
            />
          </div>

          <div className="ssh-guide-step">
            <div className="ssh-guide-step-title">4. 이 화면(SSH Hosts)에 호스트 추가</div>
            <ul className="ssh-guide-list">
              <li>
                <b>Label</b>: 알아볼 별칭 (예: 작업서버)
              </li>
              <li>
                <b>Remote OS</b>: 대상이 Windows면 Windows, 아니면 Linux / macOS
              </li>
              <li>
                Windows 대상은 <b>Use .cmd shims for npm CLIs</b>를 켜둡니다. PowerShell
                실행 정책이 <span className="ssh-guide-mono">codex.ps1</span>/
                <span className="ssh-guide-mono">claude.ps1</span>을 막아도{" "}
                <span className="ssh-guide-mono">codex.cmd</span>/
                <span className="ssh-guide-mono">claude.cmd</span>로 실행됩니다.
              </li>
              <li>
                <b>User</b> / <b>Host</b>: 3번에서 확인한 값 / <b>Port</b>: 보통 22
              </li>
              <li>
                <b>Identity file</b>·<b>Extra ssh options</b>: 비워두기
              </li>
              <li>
                <b>Test connection</b> → "연결 성공" 뜨면 <b>Add</b>
              </li>
            </ul>
          </div>

          <div className="ssh-guide-step">
            <div className="ssh-guide-step-title">5. 원격 프로젝트 만들기</div>
            <ul className="ssh-guide-list">
              <li>
                사이드바 <b>PROJECTS +</b> → "<b>Run on remote host (SSH)</b>" 체크
              </li>
              <li>
                방금 만든 <b>SSH host</b> 선택 + <b>Remote folder</b> 입력 (예:
                Windows <span className="ssh-guide-mono">C:\\Users\\이름</span>, Linux{" "}
                <span className="ssh-guide-mono">/home/이름</span>)
              </li>
              <li>
                그 프로젝트에서 새 세션(Claude Code 등) 생성 → 원격에서 실행됩니다
              </li>
            </ul>
          </div>

          <p className="ssh-guide-foot">
            참고: Windows 키 인증 원격 세션은 working/done 상태표시와 세션 resume을
            지원합니다. 비밀번호 인증과 POSIX 원격은 터미널 실행 중심으로 동작합니다.
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
