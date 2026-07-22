// Custom window top bar (Electron): replaces the native title/menu bar.
// The OS still draws min/max/close as a titleBarOverlay on the right — the
// bar's own width is constrained to env(titlebar-area-width) so our controls
// never sit under the native buttons. Everything interactive is app-region:
// no-drag; the rest of the bar drags the window (double-click maximizes).
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
  return (
    <header className="app-topbar">
      <div className="topbar-inner">
        <span className="topbar-logo" aria-hidden="true">
          <img className="topbar-logo-img" src="/app-icon.png" alt="" />
          MultiAgent
        </span>
        <button
          type="button"
          className={`topbar-btn ${sidebarOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleSidebar}
          title={sidebarOpen ? "사이드바 접기" : "사이드바 펼치기"}
          aria-label="왼쪽 사이드바 토글"
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
            aria-label={`Attention Center, 읽지 않음 ${attentionUnreadCount}개`}
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
          title={alwaysOnTop ? "상시 최상단 해제" : "상시 최상단 활성화"}
          aria-pressed={alwaysOnTop}
        >
          <span className="always-on-top-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={onOpenNewWindow}
          title="새 창 열기"
        >
          <span className="new-window-icon" aria-hidden="true" />
        </button>
        {desktopPetAvailable && (
          <button
            type="button"
            className={`topbar-btn ${desktopPetEnabled ? "topbar-btn-active" : ""}`}
            onClick={onToggleDesktopPet}
            title={desktopPetEnabled ? "Desktop Pet 숨기기" : "Desktop Pet 표시"}
          >
            🤖
          </button>
        )}
        <button
          type="button"
          className={`topbar-btn ${settingsOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleSettings}
          title="설정"
        >
          ⚙
        </button>
        <span className="topbar-sep" aria-hidden="true" />
        <button
          type="button"
          className={`topbar-btn ${filesOpen ? "topbar-btn-active" : ""}`}
          onClick={onToggleFiles}
          title={filesOpen ? "파일 트리 접기" : "파일 트리 펼치기"}
          aria-label="오른쪽 파일 사이드바 토글"
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
