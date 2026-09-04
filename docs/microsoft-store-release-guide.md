---
type: Playbook
title: Microsoft Store 배포 운영 가이드
description: "MultiAgent의 Microsoft Store용 MSIX 빌드, 검증, Partner Center 제출, 인증, 공개 및 업데이트 절차."
tags:
  - release
  - windows
  - msix
  - microsoft-store
status: draft
last_updated: 2026-09-04
stale_after: 2026-10-04
sources:
  - id: desktop-manifest
    resource: ../app/package.json
    title: "배포 버전과 Store 빌드 명령"
  - id: store-builder
    resource: ../app/scripts/build-electron-store.mjs
    title: "Store MSIX 빌더"
  - id: store-verifier
    resource: ../app/scripts/verify-electron-store-msix.mjs
    title: "Store MSIX 무결성 검증기"
  - id: wack-runner
    resource: ../app/scripts/test-electron-store-wack.ps1
    title: "Windows App Certification Kit 실행기"
  - id: store-manifest
    resource: ../app/store/Package.appxmanifest.template.xml
    title: "Store 패키지 매니페스트"
  - id: runtime-variant
    resource: ../app/electron/runtime-variant.cjs
    title: "Standard, Company, Store 런타임 분리"
  - id: release-playbook
    resource: release-playbook.md
    title: "전체 릴리스 플레이북"
  - id: create-submission
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission
    title: "Microsoft Store MSIX 제출 만들기"
  - id: capability-declarations
    resource: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations
    title: "앱 capability 선언"
  - id: submission-options
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/manage-submission-options
    title: "Store submission options"
  - id: visibility-options
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/visibility-options
    title: "Store 공개 범위와 검색 노출"
  - id: support-info
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info
    title: "MSIX 개인정보처리방침과 지원 정보"
  - id: store-updates
    resource: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/package-updates-from-store
    title: "Microsoft Store 패키지 업데이트"
  - id: msstore-cli
    resource: https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/overview
    title: "Microsoft Store Developer CLI"
---

# Microsoft Store 배포 운영 가이드

이 문서는 MultiAgent의 **Microsoft Store 채널만** 다루는 실무 런북이다.
Standard 개발자 NSIS와 Company GitHub 배포는 [전체 릴리스 플레이북](release-playbook.md)을
따른다. `deploy live` 또는 GitHub Release 요청만으로 Store 제출까지 진행하지
않으며, Store 빌드·업로드·인증 제출은 별도 요청으로 취급한다.[^release-playbook]

## 현재 상태 — 2026-09-04

| 항목 | 값 |
| --- | --- |
| 제품 | MultiAgent |
| Partner Center 제품 ID | `9NVBSGNRTPLR` |
| 패키지 Identity Name | `jintaenate.MultiAgent` |
| 현재 Store 설치 확인 버전 | `1.6.26.0` |
| 공개 업데이트 제출 버전 | `1.7.0.0` |
| 제출 번호 / 제출 ID | Submission 3 / `1152921505701807824` |
| 제출 상태 | `Update in draft` (인증 취소 완료) |
| 공개 설정 | Public audience, Store에서 검색 가능 |
| 시장 / 가격 | 전 세계 시장, 무료 |
| 게시 방식 | 인증 통과 즉시 자동 게시 |
| 현재 소스 / 다음 Store 후보 | `1.7.2.0` / 언어 설정 포함 |
| Submission 3 처리 결정 | 인증 취소 완료, `1.7.2.0` 교체 제출 대기 |
| `1.7.2.0` 로컬 검증 | verifier 및 Store packaged/lifecycle smoke 통과 |
| `1.7.2.0` WACK | 현재 셸이 비관리자라 미실행, 제출 전 관리자 PowerShell에서 필요 |

`1.7.0.0` 공개 업데이트 인증은 취소되었고 Submission 3은 같은 제출 ID로
`Update in draft` 상태다. Store의 기존 설치 가능 버전 `1.6.26.0`은 유지된다.
현재 소스는 `1.7.2.0`이며 한국어·영어·시스템 기본 언어 설정을 포함한다.
`1.7.2.0` 교체 패키지는 아직 Partner Center에 업로드하거나 제출하지 않았다.

공개 연결 주소는 다음으로 통일한다.

| 용도 | 주소 |
| --- | --- |
| 제품 사이트 | `https://onethingchanged.github.io/MultiagentSite/` |
| Q&A 목록 / 지원 | `https://github.com/OneThingChanged/MultiagentSite/issues` |
| 질문·버그 작성 | `https://github.com/OneThingChanged/MultiagentSite/issues/new/choose` |
| 개인정보처리방침 | `https://github.com/OneThingChanged/MultiagentSite/blob/main/PRIVACY.md` |

메인 `Multiagent` 저장소는 비공개이고 GitHub 배포는 소유자용 내부 채널이다.
일반 사용자의 공식 설치와 업데이트는 Microsoft Store만 사용한다. 현재 초안인
Submission 3에서 웹사이트·지원·개인정보처리방침 값을 위 주소로 교체한 뒤 새
패키지와 함께 제출해야 한다.
Microsoft는 개인정보를 처리하는 앱에 유효한 개인정보처리방침을 요구하므로,
현재 제출 값이 비공개 저장소를 가리킨다면 인증을 취소하고 공개 URL로 수정해
재제출하는 편이 안전하다.[^support-info]

제출한 파일의 기록은 다음과 같다.

| 항목 | 값 |
| --- | --- |
| 파일 | `app/electron-dist/store/MultiAgent-Store-Release-1.7.0.0-x64.msix` |
| 크기 | 157,614,003 bytes |
| SHA-256 | `4cae7a352ceee8bf864bf13bd089fc6fb8c447e53d4ed0586a3e7e04ed18b3dc` |
| 아키텍처 | x64 / Windows Desktop |
| 제한 capability | `runFullTrust` |

교체 후보로 빌드한 파일의 기록은 다음과 같다. 아직 Partner Center에 업로드하거나
제출하지 않았다.

| 항목 | 값 |
| --- | --- |
| 파일 | `app/electron-dist/store/MultiAgent-Store-Release-1.7.2.0-x64.msix` |
| 크기 | 157,629,333 bytes / 150.33 MiB |
| SHA-256 | `6b953c3bb6e1d97c824a7af702a5d79f21eb1953b680437fd0752a5a9439119b` |
| 아키텍처 | x64 / Windows Desktop |
| 제한 capability | `runFullTrust` |
| 로컬 검증 | Store verifier, packaged smoke, packaged lifecycle smoke 통과 |
| WACK | 비관리자 셸에서 실행 차단됨. 제출 전 관리자 PowerShell에서 실행 필요 |

## 채널과 버전 규칙

1. 한 제품 릴리스는 개발자 빌드와 Store에서 같은 네 자리 버전 `X.Y.Z.0`을 쓴다.
2. npm과 Electron Updater 호환 버전만 `X.Y.Z`를 사용한다. 앱 UI, GitHub 태그,
   설치 파일명, Android `versionName`, MSIX는 네 자리 버전을 유지한다.
3. 새 Store 패키지는 Partner Center에 이미 제출한 모든 패키지보다 반드시 높은
   버전이어야 한다. 실패했거나 취소한 버전도 재사용하지 않는 편이 안전하다.
4. Store 빌드는 GitHub `electron-updater`를 사용하지 않는다. Windows와
   Microsoft Store가 설치 및 업데이트를 관리한다.[^store-updates]
5. Standard는 로컬 출력 폴더, Company는 비공개 GitHub, Store는 Microsoft
   Store를 사용하며 데이터 위치도 분리된다.[^desktop-manifest][^runtime-variant]
6. 현재 다음 Store 후보는 `1.7.2.0`이다. 새 Store 제출을 만들 때는
   그 시점의 대응 개발자 빌드 버전과 정확히 일치시킨다.

## 전체 흐름

```text
버전 확정 → 소스 테스트 → Store MSIX 빌드 → 로컬 검증 → WACK
→ Partner Center 새 업데이트 → MSIX 업로드/검증 → 공개·가격 확인
→ runFullTrust 설명 저장 → 인증 제출 → 인증 결과 확인 → Store 설치/업데이트 검증
```

## 1. 배포 전 확인

- 대응 GitHub 릴리스와 태그가 존재하고 네 자리 버전이 일치하는지 확인한다.
- `app/package.json`의 `multiAgentReleaseVersion`이 목표 Store 버전인지 확인한다.
- `app/store/store-identity.local.json`에 Partner Center의 정확한 Identity 값이
  있어야 한다. 이 파일은 로컬 전용이며 Git에 커밋하지 않는다.
- 기존 제출보다 버전이 높은지 Partner Center의 **Packages**에서 확인한다.
- 작업 트리의 사용자 변경을 보존하고, 제출할 커밋과 산출물 해시를 기록한다.

기본 소스 검증:

```powershell
cd "K:\AI\MultiAgent\app"
npm test
npm run build
npm run electron:smoke
```

## 2. Store MSIX 빌드와 로컬 검증

프로덕션 Store 패키지를 빌드하고 검증한다.

```powershell
cd "K:\AI\MultiAgent\app"
npm run release:build:store
npm run release:verify:store
```

빌더는 `app/electron-dist/store/`에 다음 파일을 만든다.[^store-builder]

- `MultiAgent-Store-Release-X.Y.Z.0-x64.msix`
- `MultiAgent-Store-Release-X.Y.Z.0-x64.metadata.json`
- 최신 산출물을 가리키는 `MultiAgent-Store-Release.metadata.json`

검증기는 MSIX 해시, Identity, 버전, x64 아키텍처, 실행 파일,
`packagedClassicApp`, `mediumIL`, `runFullTrust`, 서명 상태와 금지 파일을
확인한다. 프로덕션 MSIX는 Partner Center가 서명하므로 로컬 서명이 없어야
한다.[^store-verifier][^store-manifest]

검증 후에는 버전별 metadata의 파일 크기와 SHA-256을 배포 기록에 복사한다.
같은 폴더에 이전 버전 산출물이 남아 있을 수 있으므로 파일명만 보고 업로드하지
말고 metadata와 해시를 함께 대조한다.

## 3. WACK 실행

관리자 PowerShell에서 목표 프로덕션 metadata를 명시해 Windows App
Certification Kit을 실행한다.

```powershell
cd "K:\AI\MultiAgent\app"
pwsh -NoLogo -NoProfile -File .\scripts\test-electron-store-wack.ps1 `
  -MetadataPath .\electron-dist\store\MultiAgent-Store-Release.metadata.json
```

성공 시 `app/electron-dist/store/wack-report.xml`을 생성한다. 보고서 수정 시각이
목표 MSIX 빌드 시각보다 늦고, report가 목표 패키지를 대상으로 했는지 확인한
뒤 함께 보관한다.[^wack-runner]

현재 보관된 `wack-report.xml`의 시각은 `1.7.0.0` 산출물보다 이전이다. 따라서
현재 제출에 대해 확실히 확인된 사실은 **로컬 verifier 통과와 Partner Center
패키지 검증 통과**이며, 정확한 `1.7.0.0` WACK 보고서 보존 여부는 확인되지
않았다. `1.7.2.0` WACK도 현재 셸이 관리자 권한이 아니어서 실행되지 않았으므로,
Partner Center 업로드 전에 위 명령을 관리자 PowerShell에서 실행하고 새 보고서를
확인해야 한다.

## 4. Partner Center 업데이트 만들기

제품 개요:

`https://partner.microsoft.com/en-us/dashboard/products/9NVBSGNRTPLR/overview`

1. **Start update**를 눌러 새 제출을 만든다.
2. 기존 제출이 `In certification`이면 중복 업데이트를 만들지 않는다.
3. **Packages**에서 목표 MSIX 하나만 업로드한다.[^create-submission]
4. 분석이 끝나 `Validated`가 표시되는지 확인한다.
5. Windows 10/11 Desktop만 대상인지 확인하고 **Save**를 누른다.

### 파일 업로드 제약

MultiAgent 내장 브라우저 자동화는 일반 DOM의 버튼, 드롭다운, 체크박스,
라디오 버튼과 텍스트 입력을 처리할 수 있지만 운영체제 네이티브 파일 선택기는
현재 제어하지 않는다. MSIX와 Store 이미지 업로드는 일반 Chrome에서 해당
Partner Center URL을 열어 파일을 직접 선택한다.

### 중복 또는 멈춘 업로드

- 정상 행은 실제 파일 크기와 버전이 표시되고 분석 후 `Validated`가 된다.
- `Paused`, `null Bytes`, 중복 패키지 오류가 난 행만 **Delete**한다.
- 정상 행을 남긴 채 페이지 아래 **Save**를 눌러 삭제를 확정한다.
- 처리 시간이 비정상적으로 길면 새 파일을 계속 추가하지 말고 새로고침 후 기존
  행의 상태를 먼저 확인한다.

## 5. 공개·가격 설정

**Pricing and availability**에서 다음 값을 사용한다.[^visibility-options]

- Markets: **All worldwide markets**
- Future markets: 사용 가능 시 기본 가격과 일반 출시일로 자동 포함
- Audience: **Public audience**
- Discoverability: **Make this product available and discoverable in the Microsoft Store**
- Base price: 무료 (`KRW - Korea`, `₩0`; 각 시장 변환 가격도 무료인지 확인)
- Release: **as soon as possible**
- Stop acquisition: **never**

변경 후 페이지 맨 아래 **Save draft**를 누르고 개요에서 완료 상태를 확인한다.

## 6. 나머지 제출 항목

- **Properties**: Developer tools / Utilities, 개인정보처리방침, 웹사이트와 지원
  URL, 실제 기능에 맞는 제품 선언을 유지한다.
- **Age ratings**: IARC 질문을 실제 기능 기준으로 답하고 Preview 결과를 저장한다.
- **Store listings**: 한국어와 영어 설명, 기능, 스크린샷을 확인한다. 대표
  스크린샷은 `app/store/listing/screenshots/multiagent-store-primary.png`이다.
- **Submission options**: 인증 통과 즉시 게시를 선택하고 `runFullTrust`
  설명을 저장한다.[^submission-options]

## 7. `runFullTrust` 설명

`runFullTrust`는 관리자 권한 상승 요청이 아니다. MultiAgent가 UWP 샌드박스
밖에서 사용자가 선택한 PowerShell, Command Prompt, Git, CLI 에이전트와
PTY를 실행하고 프로젝트 파일을 다루기 위해 필요한 packaged classic app
capability다. 앱은 `allowElevation`을 선언하지 않으며 드라이버나 Windows
서비스를 설치하지 않는다.[^capability-declarations]

Partner Center의 restricted capability 입력란에는 다음 설명을 사용한다.

> MultiAgent is an Electron desktop workspace and terminal manager. The
> runFullTrust capability is required to start user-selected local Windows
> shells and development tools, including PowerShell, Command Prompt, Git, and
> configured CLI agents; create terminal/PTY sessions; exchange standard input
> and output; monitor child-process and local-port status; and access project
> files in folders selected by the user. Every process launch is initiated by
> an explicit user action or by a session or automation the user has
> configured. MultiAgent does not request administrator elevation, install
> drivers or services, change Windows security settings, or execute hidden
> processes. This capability is limited to the app's core terminal and
> workspace-management functions, which cannot operate inside the UWP sandbox.
> Reviewers can test it by adding a local project folder, creating a terminal
> session, running 'echo MultiAgent test', and closing the session.

`runFullTrust` 경고는 추가 심사 대상이라는 안내이며 그 자체가 패키지 검증
실패는 아니다. 이 capability를 제거하면 MultiAgent의 핵심 터미널과 프로세스
기능이 깨지므로 구체적인 인증 거절 사유 없이 제거하지 않는다.

## 8. 제출 직전과 인증 중 확인

1. 모든 필수 항목이 `Complete` 또는 `Unchanged`인지 확인한다.
2. `Submission options: Incomplete`가 남아도 페이지를 열어 필수 입력과 저장
   상태를 다시 확인한다. **Submit for certification**이 활성화되어 있고 제출이
   정상 접수되면 오래된 표시일 수 있다.
3. 최종 제출 버튼은 외부 상태를 바꾸므로 사용자의 명시적 확인 후 누른다.
4. 접수 후 제품 개요에 `Update in certification`과 제출 번호가 나타나는지
   확인한다.
5. 인증 중에는 구체적인 오류나 Microsoft 요청이 없으면 제출을 취소하지 않는다.

Partner Center는 보통 수 시간, 경우에 따라 최대 3영업일이 걸릴 수 있다고
안내한다. `runFullTrust` 검토가 포함되면 더 오래 걸릴 수 있다.

## 9. 인증 결과별 처리

### 통과

1. 상태가 Publishing을 거쳐 Store 게시 완료로 바뀌는지 확인한다.
2. 일반 Microsoft 계정에서 제품을 검색하거나 제품 페이지를 열어 설치한다.
3. 앱 정보의 버전이 제출 버전과 같은지 확인한다.
4. 기존 Store 설치 위에서 업데이트할 때 사용자 데이터가 유지되는지 확인한다.
5. 프로젝트 추가, 세션 생성·재개, 터미널/PTY, Git, 브라우저 MCP, Remote,
   문서 보기, 종료를 스모크 테스트한다.
6. 설정의 업데이트 UI가 GitHub updater가 아니라 Microsoft Store 제품 페이지를
   여는지 확인한다.

### 실패 또는 추가 정보 요청

1. 인증 보고서에서 정확한 테스트, 정책, capability 또는 재현 단계를 확인한다.
2. 설명만 부족하면 Partner Center에 보충하고, 코드나 패키지가 원인이면 수정한다.
3. 새 네 자리 버전으로 다시 빌드하고 verifier와 WACK을 반복한다.
4. 인증 요청과 무관한 권한을 추가하거나 필요한 `runFullTrust`를 임의로 제거하지
   않는다.

### 게시 후 긴급 문제

이미 게시된 버전은 같은 버전으로 교체하지 않는다. 더 높은 패치 버전을 만들어
새 업데이트로 제출한다. 인증 지연 동안 GitHub 채널과 Store 채널의 실제 제공
버전을 릴리스 노트에 구분해 표시한다.

## 10. 자동화 후보

Microsoft Store Developer CLI(`msstore`)를 사용하면 패키지 업로드와 제출
초안 생성을 자동화할 수 있다. 현재 개발 PC에는 Store CLI가 설치되어 있지
않다. 또한 개인 Microsoft 계정(MSA)이 아니라 Partner Center에 연결된
Microsoft Entra ID 인증이 필요하다.[^msstore-cli]

도입 시에는 처음부터 자동 제출하지 말고 `--noCommit`으로 초안까지만 만든다.

```powershell
msstore publish "K:\AI\MultiAgent\app" `
  --inputFile "K:\AI\MultiAgent\app\electron-dist\store\MultiAgent-Store-Release-X.Y.Z.0-x64.msix" `
  --appId 9NVBSGNRTPLR `
  --noCommit
```

자동화 우선순위는 다음과 같다.

1. 목표 버전·Identity·해시·WACK 보고서 시각을 검사하는 preflight.
2. `msstore publish --noCommit`으로 패키지 업로드와 제출 초안 생성.
3. Partner Center에서 공개 범위, 가격, `runFullTrust`, 제출 항목을 사람이 검토.
4. 사용자의 최종 확인 후 인증 제출.

## 배포 기록 템플릿

```text
제품 버전:
Git commit / tag:
MSIX 파일:
크기:
SHA-256:
로컬 verifier:
WACK report / 실행 시각:
Partner Center submission ID:
Audience / discoverability:
가격 / 시장:
runFullTrust 설명 저장:
인증 제출 시각:
인증 결과:
Store 설치·업데이트 테스트:
```

[^desktop-manifest]: 배포 버전과 Store 빌드 명령
[^store-builder]: Store MSIX 빌더
[^store-verifier]: Store MSIX 무결성 검증기
[^wack-runner]: Windows App Certification Kit 실행기
[^store-manifest]: Store 패키지 매니페스트
[^runtime-variant]: Standard, Company, Store 런타임 분리
[^release-playbook]: 전체 릴리스 플레이북
[^create-submission]: [Microsoft Store MSIX 제출 만들기](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/create-app-submission)
[^capability-declarations]: [Microsoft 앱 capability 선언](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/app-capability-declarations)
[^submission-options]: [Microsoft Store submission options](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/manage-submission-options)
[^visibility-options]: [Microsoft Store 공개 범위와 검색 노출](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/visibility-options)
[^support-info]: [Microsoft Store 개인정보처리방침과 지원 정보](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/support-info)
[^store-updates]: [Microsoft Store 패키지 업데이트](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/package-updates-from-store)
[^msstore-cli]: [Microsoft Store Developer CLI](https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/overview)
