# Remote PWA

데스크톱에서 실행 중인 MultiAgent 세션을 휴대폰·태블릿 브라우저에서 확인하고 짧게 조작하는 Standard 전용 모바일 리모컨이다. 0.5.31 이상 Electron 앱에서는 `app/electron/services/web-services.mjs`가 서버를 제공하고 `app/electron/remote-pwa/`가 설치 가능한 PWA 화면을 제공한다.

Company 빌드는 설정에서 Remote 탭을 숨기고 main IPC에서 Remote·Tunnel 명령을 거절하며, 패키징 시 `electron/remote-pwa/**`도 제외한다.

## 전체 흐름

```text
[휴대폰 PWA] ──HTTPS──> Cloudflare Tunnel ──> [내 PC] 127.0.0.1:<port>
     │                                                   │
     ├─ GitHub 로그인 + 계정 승인                        ├─ 세션/Hook/최근 출력 조회
     ├─ 상태·질문·완료 알림                              └─ 선택한 PTY에 짧은 입력 전달
     └─ 홈 화면 설치
```

Remote 서버는 외부 NIC에 직접 노출하지 않고 loopback에만 바인드한다. 휴대폰 접속은 HTTPS 터널 URL을 사용한다. 로컬 URL은 데스크톱 PC에서 미리보기·진단할 때 사용한다.

## Remote 화면 구성

- **Monitor**: 작업 중·답변 필요·완료·대기·비활성 세션을 lane으로 분리하고 상태 수를 한눈에 표시
- **Screens**: 데스크톱의 분할 Screen과 패널/탭 구성을 읽기 전용으로 동기화해 여러 터미널을 동시에 표시
- **Sessions**: 프로젝트별 세션 목록, 상태 필터, 검색을 제공하고 선택한 터미널을 크게 표시
- 모바일 Screen은 작은 분할 대신 패널 탭으로 전환하고, 탐색 목록은 슬라이드 메뉴로 표시
- 최근 사용자 요청, interactive question, 최근 터미널 출력
- Screen 패널 또는 Session 상세에서 활성 세션에 지시·질문 답변 전송
- `Ctrl/⌘ + Enter` 전송, 최근 출력 복사
- 브라우저의 **앱 설치 / 홈 화면에 추가** 지원
- PWA가 실행 중일 때 완료·새 질문을 service worker 알림으로 표시
- 오프라인에서는 앱 셸만 열고 세션 API·입력은 네트워크 전용

Screen 선택은 Remote 브라우저 안에서만 바뀌며 데스크톱 MultiAgent의 현재 Screen이나 활성 세션을 변경하지 않는다. 전체 PTY 에뮬레이션, 파일 편집, 화면 공유, 백그라운드 Push 서버는 MVP에 포함하지 않는다.

## HTTP 엔드포인트

| 경로 | 설명 |
|---|---|
| `GET /` | 승인된 사용자의 PWA 메인 화면 |
| `GET /login` | GitHub 웹/Device Flow 로그인 화면 |
| `GET /manifest.webmanifest` | PWA 설치 manifest |
| `GET /sw.js` | 오프라인 셸·알림 service worker |
| `GET /api/state` | 프로젝트, 세션, Hook, 최근 출력 상태 |
| `POST /api/input` | 활성 PTY에 입력 전달. JSON·동일 출처·8KB 제한 |
| `GET /auth/mode` | OAuth 설정에 따라 web/device 방식 반환 |
| `POST /auth/start` | GitHub Device Flow 시작 |
| `POST /auth/poll` | Device Flow 토큰·사용자 확인 |
| `GET /auth/github` | 고정 도메인용 GitHub OAuth redirect 시작 |
| `GET /auth/github/callback` | OAuth callback과 세션 쿠키 발급 |
| `POST /auth/logout` | 세션 쿠키 만료 |

상태는 1.6초 간격으로 동기화하며, 숨겨진 PWA는 5초 간격으로 낮춘다. Remote payload의 터미널 출력은 세션당 최근 24,000자로 제한한다.

## GitHub 인증과 승인

### Quick tunnel

GitHub OAuth App의 **Client ID만** 설정하면 Device Flow를 사용한다. 휴대폰에 일회용 코드를 표시하고 `github.com/login/device`에서 인증하므로 터널 URL이 바뀌어도 callback URL을 수정할 필요가 없다.

### Named tunnel

Client ID + Client Secret + Public hostname을 모두 설정하면 일반 웹 redirect 로그인을 사용한다. OAuth App callback URL은 다음과 같이 등록한다.

```text
https://<public-hostname>/auth/github/callback
```

로그인이 끝나도 다음 승인 규칙을 통과해야 한다.

- Owner: 설정의 GitHub username과 일치하면 즉시 허용
- Approved: 데스크톱 설정 → Remote PWA에서 승인한 계정
- Pending: 로그인은 됐지만 데스크톱 승인을 기다리는 계정
- Revoke: 승인 목록에서 제거하면 기존 서명 쿠키가 있어도 다음 요청부터 거절

세션 쿠키는 `HttpOnly`, `SameSite=Lax`, 7일 만료다. HTTPS 터널 요청에는 `Secure`도 적용한다. 서버 재시작 시 서명 키가 바뀌므로 다시 로그인해야 한다.

## Cloudflare Tunnel

- Quick: token을 비우면 `cloudflared tunnel --url <local-url> --no-autoupdate`
- Named: token이 있으면 `cloudflared tunnel run --token <token>`
- Windows에서 실행 파일이 없으면 공식 GitHub Latest의 `cloudflared-windows-amd64.exe`를 로컬 데이터 폴더로 자동 다운로드한다.
- 다운로드는 임시 파일에 스트리밍하고 1MB 미만 응답을 거절한 뒤 원자적으로 이름을 바꾼다.
- 시작은 실제 public URL 또는 named tunnel 연결 로그를 최대 45초 기다린 뒤 성공을 반환한다.

저장 위치는 Standard 로컬 데이터 폴더의 `remote-config.json`, `remote-access.json`, `cloudflared.exe`다. Client Secret과 tunnel token은 브라우저로 전송하지 않는다.

## 보안 경계

- 서버는 `127.0.0.1`만 listen하고 외부 공개는 Cloudflare HTTPS를 사용한다.
- 모든 API는 로그인·승인을 확인한다. loopback 직접 요청만 로컬 진단용으로 승인 없이 허용한다.
- PTY 입력은 same-origin JSON POST만 허용하고 cross-site 요청, 잘못된 Content-Type, 빈 값, 8KB 초과, 종료된 세션을 거절한다.
- PWA 응답은 strict CSP, `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, 제한된 Permissions Policy를 사용한다.
- service worker는 정적 셸만 캐시하고 `/api/**`, `/auth/**`, 모든 POST는 캐시하지 않는다.
- Company renderer가 조작되더라도 main의 disabled command set에서 Remote·Tunnel 호출을 다시 차단한다.

## 설정 순서

1. Standard 앱 설정 → **Remote PWA**에서 GitHub Client ID와 Owner를 입력하고 저장한다.
2. **Start**로 로컬 Remote 서버를 켠다.
3. **Start tunnel**로 HTTPS 주소를 발급한다. 첫 실행은 cloudflared 다운로드 때문에 시간이 걸릴 수 있다.
4. 휴대폰에서 HTTPS 주소를 열고 GitHub 로그인한다.
5. Owner가 아니면 데스크톱의 승인 요청을 허용한다.
6. 브라우저 메뉴의 **앱 설치 / 홈 화면에 추가**를 선택하고 알림 권한을 켠다.

접속 후 첫 화면은 Monitor다. 상단 상태 카드를 누르면 해당 상태만 필터링하고, 왼쪽 **SCREENS**는 분할 화면을, **SESSIONS**는 개별 세션을 연다. 모바일에서는 하단의 모니터·스크린·세션·질문 버튼으로 같은 탐색 메뉴를 연다.

## 남은 확장

- 브라우저가 완전히 종료된 상태에서도 동작하는 Web Push/VAPID
- 서버→PWA delta stream 또는 WebSocket으로 polling 제거
- 세션 중단·재개 같은 명시적 제어 API
- 네트워크·배터리 상태에 따른 동기화 주기 조절
