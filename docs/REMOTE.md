# 원격 접속

데스크탑에서 돌고 있는 AI 세션을 **외부 브라우저**에서 보고 조작하는 기능. 별도 설치 없이 URL 접속 → GitHub 로그인 → 승인된 계정만 사용. 백엔드는 `app/src-tauri/src/remote.rs`, 웹 클라이언트는 `remote_page.html`(메인) / `remote_login.html`(로그인).

## 전체 흐름

```
[외부 브라우저] ──HTTPS──> Cloudflare Tunnel ──> [내 PC] axum 서버(0.0.0.0:port)
                              GitHub 로그인 + 승인 검증           │
                                                          PTY 스트림 / 입력 (WebSocket)
```

## 로컬 서버

- **axum** 서버, `0.0.0.0:<port>` 바인드 (LAN 노출)
- 포트: `RemoteConfig.server_port` (0이면 랜덤). named tunnel을 쓸 땐 대시보드의 service URL 포트와 일치시켜야 함
- 상태는 `RemoteHub`에 보관 (PTY broadcast 채널, 세션, 승인 목록, 설정)

### 엔드포인트

| 경로 | 설명 |
|---|---|
| `GET /` | 인증되면 `remote_page.html`, 아니면 `remote_login.html` |
| `GET /api/agents` | 활성 세션 목록 JSON |
| `GET /api/view` | 프로젝트 + 세션 뷰 상태 JSON |
| `GET /ws?id=<agentId>` | 세션 PTY 출력 스트림(바이너리) + 입력/리사이즈(JSON) |
| `POST /auth/start` | GitHub Device Flow 시작 (device/user code 발급) |
| `POST /auth/poll` | Device Flow 폴링 (토큰 수령 → 사용자 확인) |
| `GET /auth/mode` | 로그인 방식 반환 `{ web: bool }` (web flow 설정 여부) |
| `GET /auth/login` | OAuth 웹 flow: GitHub authorize로 리다이렉트 (CSRF state) |
| `GET /auth/callback` | OAuth 콜백: code 교환 → 세션 발급 → `/`로 |
| `GET /auth/me` | 현재 세션 사용자/승인 상태 |
| `POST /auth/logout` | 세션 쿠키 무효화 |

WebSocket 메시지:
- 서버→웹: 바이너리(PTY 출력), `{"type":"resize","cols","rows"}`(크기), `{"type":"error","message"}`
- 웹→서버: `{"type":"input","data"}` (입력만; **크기는 보내지 않음** — 데스크탑이 PTY 크기의 주인)

## Cloudflare Tunnel

`cloudflared.exe`를 최초 1회 자동 다운로드(`<app_local_data_dir>/cloudflared.exe`, GitHub latest)해서 실행. Windows에서 `CREATE_NO_WINDOW`로 숨겨 띄움.

| 모드 | 조건 | 명령 | URL |
|---|---|---|---|
| **Quick tunnel** | `tunnel_token` 비어있음 | `cloudflared tunnel --url http://127.0.0.1:<port> --no-autoupdate` | `https://<랜덤>.trycloudflare.com` (켤 때마다 바뀜) |
| **Named tunnel** | `tunnel_token` 설정됨 | `cloudflared tunnel run --token <token>` | `https://<public_hostname>` (고정) |

- quick: stdout/stderr에서 `*.trycloudflare.com` URL 파싱 (최대 45초 대기)
- named: `Registered tunnel connection` 로그를 기다린 뒤 `public_hostname`으로 URL 구성. Cloudflare Zero Trust → Networks → Tunnels에서 만든 토큰 + Public hostname(service: `http://localhost:<server_port>`) 필요
- 유동 IP여도 OK: cloudflared가 바깥으로 연결을 거는 구조라 포트포워딩·DDNS 불필요

## 인증 (GitHub)

`client_secret` + `public_hostname`이 **둘 다** 설정되면 **웹 flow**(리다이렉트 1번), 아니면 **Device Flow**(코드 입력). quick tunnel처럼 주소가 바뀌는 환경은 Device Flow가 적합.

- **Device Flow**: `/auth/start` → `github.com/login/device/code`(scope `read:user`) → 사용자가 코드 입력 → `/auth/poll`이 토큰 수령 → `api.github.com/user`로 username 확인
- **웹 flow**: `/auth/login` → GitHub authorize(redirect `https://<public_hostname>/auth/callback`, CSRF state 10분) → `/auth/callback`에서 `client_secret`으로 code 교환
- **세션 쿠키**: `ma_session=<uuid>`, HttpOnly·SameSite=Lax, **7일**. `RemoteHub.sessions`에 보관
- `client_secret`은 로컬에만 저장되고 브라우저로 절대 안 나감

## 계정 승인제

로그인은 누구나 되지만 **터미널 사용은 승인된 계정만**.

| 레벨 | 의미 |
|---|---|
| Owner | `RemoteConfig.owner`와 일치(대소문자 무시) — 승인 없이 항상 허용 |
| Approved | `AccessStore.approved`에 있음 |
| Pending | 로그인했지만 승인 대기 (터미널 접근 불가) |
| Unknown | 첫 로그인 → 자동으로 pending 등록 |

- 새 요청 시 데스크탑에 `remote:access-request` 이벤트 → 토스트 + 알림음
- 설정 → Remote에서 **승인/거절/해제**. 해제 시 그 사용자의 **살아있는 세션도 즉시 종료**
- 저장: `<app_local_data_dir>/remote-access.json` (앱 재시작에도 유지)

## 웹 클라이언트 (독립 뷰어)

- 좌측 사이드바: 프로젝트별 세션 목록 + 상태점(running 초록 / working 노랑 펄스 / exited 회색)
- 세션 클릭 → **브라우저 로컬 탭**으로 열림 (데스크탑 화면은 안 바뀜). 여러 세션 탭으로 전환
- 같은 세션이면 입력·출력이 데스크탑과 공유됨 (PTY가 하나라 본질적). 단 "어느 세션을 보는지"는 데스크탑과 독립
- 터미널 크기: 웹은 resize를 보내지 않고 데스크탑이 정한 cols/rows를 그대로 따라감 → 줄바꿈이 데스크탑과 동일하고 서로 화면을 깨뜨리지 않음
- xterm.js, 폰트·색상은 데스크탑 앱과 동일

## 설정/명령

데스크탑 설정 → **Remote** 탭에서 서버 Start/Stop, 터널 Start/Stop, URL 복사, GitHub OAuth(client_id/secret), Owner, named tunnel(token/hostname/port), 승인 관리.

주요 Tauri 커맨드: `start_remote_server` / `stop_remote_server` / `remote_server_status` / `start_tunnel` / `stop_tunnel` / `tunnel_status` / `remote_config_get` / `remote_config_set` / `remote_access_list` / `remote_access_approve` / `remote_access_revoke` / `sync_remote_agents` / `sync_remote_view`.

설정 저장: `<app_local_data_dir>/remote-config.json`.

## 보안 메모

- 통신은 Cloudflare가 TLS 종단(HTTPS). 내부 localhost 구간은 평문 HTTP지만 외부 노출 안 됨
- 외부 공개 URL이라도 GitHub 로그인 + 승인을 통과해야 함. URL만으로는 접근 불가
- LAN 직접 접속(`http://<lan-ip>:<port>?token=...`)도 가능 — 레거시 토큰 경로
