// Custom window top bar (Electron): replaces the native title/menu bar.
// The OS still draws min/max/close as a titleBarOverlay on the right — the
// bar's own width is constrained to env(titlebar-area-width) so our controls
// never sit under the native buttons. Everything interactive is app-region:
// no-drag; the rest of the bar drags the window (double-click maximizes).
import { useAppLanguage } from "../lib/appLanguage";

export function TopBar({
  sidebarOpen,
  onToggleSidebar,
  filesOpen,
  onToggleFiles,
  desktopPetEnabled,
  desktopPetAvailable,
  onToggleDesktopPet,
  settingsOpen,
  onToggleSettings,
  alwaysOnTop,
  onToggleAlwaysOnTop,
  onOpenNewWindow,
  onQuickOpen,
  quickOpenShortcut,
  onOpenAttention,
  attentionUnreadCount,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  filesOpen: boolean;
  onToggleFiles: () => void;
  desktopPetEnabled: boolean;
  desktopPetAvailable: boolean;
  onToggleDesktopPet: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  alwaysOnTop: boolean;
  onToggleAlwaysOnTop: () => void;
  onOpenNewWindow: () => void;
  onQuickOpen: () => void;
  quickOpenShortcut?: string;
  onOpenAttention: () => void;
  attentionUnreadCount: number;
}) {
  const { text } = useAppLanguage();
  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        <span className="topbar-logo" aria-hidden="true">
          <img className="topbar-logo-img" src="/app-icon.png" alt="" />
          Acedia
        </span>
        <button
          type="button"
          className={`topbar-btn ${sidebarOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? text("사이드바 접기", "Collapse sidebar") : text("사이드바 펼치기", "Expand sidebar")}
          aria-label={text("왼쪽 사이드바 토글", "Toggle left sidebar")}
        >
          <svg className="topbar-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <rect x="3.9" y="5.4" width="4.8" height="13.2" rx="1.4" fill="currentColor" />
          </svg>
        </button>
        <div className="topbar-drag">
          <button
            type="button"
            className="topbar-quick-open"
            onClick={onQuickOpen}
            title="Quick Open"
          >
            <span aria-hidden="true">⌕</span>
            Quick Open
            {quickOpenShortcut && (
              <span className="topbar-kbd">{quickOpenShortcut}</span>
            )}
          </button>
          <button
            type="button"
            className={`topbar-btn topbar-attention ${
              attentionUnreadCount > 0 ? "topbar-attention-unread" : ""
            }`}
            onClick={onOpenAttention}
            title="Attention Center"
            aria-label={text(
              `Attention Center, 읽지 않음 ${attentionUnreadCount}개`,
              `Attention Center, ${attentionUnreadCount} unread`,
            )}
          >
            !
            {attentionUnreadCount > 0 && (
              <b className="topbar-attention-count">
                {attentionUnreadCount > 99 ? "99+" : attentionUnreadCount}
              </b>
            )}
          </button>
        </div>
        <button
          type="button"
          className={`topbar-btn ${alwaysOnTop ? "topbar-btn-active" : ""}`}
          onClick={onToggleAlwaysOnTop}
          title={alwaysOnTop ? text("상시 최상단 해제", "Disable always on top") : text("상시 최상단 활성화", "Enable always on top")}
          aria-pressed={alwaysOnTop}
        >
          <span className="always-on-top-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={onOpenNewWindow}
          title={text("새 창 열기", "Open new window")}
        >
          <span className="new-window-icon" aria-hidden="true" />
        </button>
        {desktopPetAvailable && (
          <button
            type="button"
            className={`topbar-btn ${desktopPetEnabled ? "topbar-btn-active" : ""}`}
            onClick={onToggleDesktopPet}
            title={desktopPetEnabled ? text("Desktop Pet 숨기기", "Hide Desktop Pet") : text("Desktop Pet 표시", "Show Desktop Pet")}
          >
            🤖
          </button>
        )}
        <button
          type="button"
          className={`topbar-btn ${settingsOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleSettings}
          title={text("설정", "Settings")}
        >
          ⚙
        </button>
        <span className="topbar-sep" aria-hidden="true" />
        <button
          type="button"
          className={`topbar-btn ${filesOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleFiles}
          title={filesOpen ? text("파일 트리 접기", "Collapse file tree") : text("파일 트리 펼치기", "Expand file tree")}
          aria-label={text("오른쪽 파일 사이드바 토글", "Toggle right file sidebar")}
        >
          <svg className="topbar-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <rect x="15.3" y="5.4" width="4.8" height="13.2" rx="1.4" fill="currentColor" />
          </svg>
        </button>
      </div>
    </header>
  );
}
