# 릴리즈 & 코드 서명 가이드

서명된 인스톨러를 만들어 GitHub Releases에 올리고, 인앱 자동 업데이터가 인식하게 하는 전체 절차. 일반 개발/디버그 빌드는 [BUILD.md](BUILD.md) 참고.

## 자동 업데이터 동작 개요

- 앱은 `tauri-plugin-updater`로 업데이트를 확인한다.
- standard endpoint(`tauri.conf.json` → `plugins.updater.endpoints`): `https://github.com/OneThingChanged/Multiagent/releases/latest/download/latest.json`
- company endpoint(`tauri.company.conf.json`): `https://github.com/OneThingChanged/Multiagent/releases/latest/download/latest-company.json`
- 즉 설치된 빌드 variant가 **GitHub의 "Latest" 릴리즈에 첨부된 자기 manifest** 를 읽는다.
- `latest.json`의 `version`이 현재 앱 버전보다 높고, `signature`가 앱에 박힌 **pubkey로 검증**되면 업데이트를 제안한다.

세 가지가 모두 맞아야 사용자에게 업데이트가 보인다:
1. 릴리즈가 **Latest로 마킹**돼 있어야 한다 (draft/prerelease면 안 됨)
2. `latest.json` / `latest-company.json` + `.sig` 자산이 릴리즈에 **첨부**돼 있어야 한다
3. 빌드가 **올바른 키로 서명**돼 있어야 한다 (pubkey와 짝)

## 빌드 Variant

| variant | 제품명 | identifier | updater manifest | 원격 기능 |
|---|---|---|---|---|
| standard | `MultiAgent` | `com.jintae.multiagent` | `latest.json` | 포함 |
| company | `MultiAgentCompany` | `com.jintae.multiagent.company` | `latest-company.json` | 제외 |

두 variant는 같은 버전을 쓰되 identifier와 updater endpoint가 다르다. 그래서 사용자가 standard를 설치하면 standard 업데이트만 받고, company를 설치하면 company 업데이트만 받는다.

## 서명 키

| 항목 | 값 |
|---|---|
| private key | `C:\Users\OneThingChanged\.tauri\multiagent.key` |
| public key | `C:\Users\OneThingChanged\.tauri\multiagent.key.pub` |
| 비밀번호 | 없음 (생성 시 `--ci`, 빈 문자열) |
| pubkey 등록 위치 | `app/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |

- private key는 repo 밖(홈 디렉토리)에 있고 **절대 커밋하지 않는다.**
- pubkey는 앱에 박혀 배포된다. 빌드의 `.sig`가 이 pubkey로 검증된다.
- 키 페어 생성(최초 1회 또는 재발급):

```bash
cd K:/AI/MultiAgent/app
npm run tauri -- signer generate -w "C:/Users/OneThingChanged/.tauri/multiagent.key" --ci --force
```

> **키를 분실하면** 기존 사용자는 자동 업데이트를 못 받는다 (서명 검증 실패). 새 키를 만들고 `tauri.conf.json`의 pubkey를 교체한 뒤, 사용자는 새 버전을 **수동으로 한 번** 설치해야 한다. (0.3.x → 0.4.0 전환 때 실제로 키를 한 번 교체했음.)

## 릴리즈 절차

### 1. Tauri 버전 올리기 (소스 3곳)

| 파일 | 필드 |
|---|---|
| `app/src-tauri/Cargo.toml` | `[package] version` |
| `app/src-tauri/tauri.conf.json` | `"version"` |
| `app/src/lib/appInfo.ts` | `APP_VERSION` |

3곳이 어긋나면 Tauri 빌드 산출물 파일명/표시 버전이 꼬인다. `app/src-tauri/Cargo.lock`의
루트 패키지 버전도 최종 커밋에 같이 반영돼야 한다. `app/package.json`과
`app/package-lock.json`은 Electron test 채널 버전(`0.5.x-electron.n`)을 사용하므로 Tauri와
일치시키지 않는다. `write-latest-json.mjs`도 `tauri.conf.json` 버전을 기준으로 manifest를 쓴다.

### 2. 빠른 검증

작은 hotfix라도 릴리즈 전 최소 검증은 이 두 개로 고정한다.

```powershell
cd "K:\AI\MultiAgent\app"
npm test

cd "K:\AI\MultiAgent\app\src-tauri"
cargo test
```

### 3. 서명 빌드

private key를 환경변수로 넘겨 빌드한다. (비밀번호가 없어도 `_PASSWORD=""`를 줘야 프롬프트 없이 진행됨)

PowerShell/Codex 환경에서는 아래 블록을 그대로 쓰면 된다. private key는 현재 프로세스 환경변수에만 주입하고, 빌드 후 바로 지운다.

```powershell
cd "K:\AI\MultiAgent\app"
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath "C:\Users\OneThingChanged\.tauri\multiagent.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
npm run release:build:all
$code = $LASTEXITCODE
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
if ($code -ne 0) { throw "release build failed: $code" }
```

Bash/Git Bash에서는 다음처럼 실행한다.

```bash
cd K:/AI/MultiAgent/app
export TAURI_SIGNING_PRIVATE_KEY="$(cat /c/Users/OneThingChanged/.tauri/multiagent.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run release:build:all
```

> `TAURI_SIGNING_PRIVATE_KEY`에는 **키 파일의 내용**을 넣는다(경로 아님). 경로로 넘기는 `TAURI_SIGNING_PRIVATE_KEY_PATH`는 환경에 따라 비밀번호 프롬프트가 떠서 헤드리스에서 멈출 수 있으니 내용 주입 방식을 쓴다.

성공하면 로그 끝에 `Finished N updater signatures at:` 가 보이고 `.sig` 파일이 생성된다.

### 4. 산출물

```
app/src-tauri/target/release/bundle/
  nsis/MultiAgent_<ver>_x64-setup.exe        ← 메인 인스톨러
  nsis/MultiAgent_<ver>_x64-setup.exe.sig    ← 서명 (updater용)
  nsis/MultiAgentCompany_<ver>_x64-setup.exe
  nsis/MultiAgentCompany_<ver>_x64-setup.exe.sig
  msi/MultiAgent_<ver>_x64_en-US.msi
  msi/MultiAgent_<ver>_x64_en-US.msi.sig
  msi/MultiAgentCompany_<ver>_x64_en-US.msi
  msi/MultiAgentCompany_<ver>_x64_en-US.msi.sig
  latest.json
  latest-company.json
```

### 5. latest manifest 작성

`.sig` 파일의 **내용 전체**를 `signature`에 넣는다.

```json
{
  "version": "0.4.5",
  "notes": "이번 릴리즈 요약",
  "pub_date": "2026-06-13T13:30:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<nsis setup.exe.sig 파일 내용 그대로>",
      "url": "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/MultiAgent_<ver>_x64-setup.exe"
    }
  }
}
```

- `signature`는 NSIS **setup.exe.sig** 의 내용 (msi 것과 헷갈리지 말 것)
- `url`은 그 릴리즈의 setup.exe 다운로드 주소
- `npm run release:build:all`은 두 variant를 빌드하고 `latest.json`, `latest-company.json`을 bundle 폴더에 같이 작성한다. 둘 중 하나라도 서명/manifest가 없으면 실패한다.
- 수동 재작성만 필요하면 `npm run release:manifests`

### 6. 커밋 / 태그 / 푸시

```bash
cd K:/AI/MultiAgent
git add -A
git commit -m "Release <ver> - <요약>"
git tag v<ver>
git push origin main
git push origin v<ver>
```

> push가 SSL 오류(`unable to get local issuer certificate`)로 막히면 한 번만:
> `git config --global http.sslBackend schannel`

### 7. GitHub 릴리즈 게시

핵심: **draft로 두지 말고 바로 publish + Latest 마킹.** (0.4.4·0.4.5가 draft로 만들어져 업데이터가 못 보던 사고가 있었음.)

```bash
gh release create v<ver> --title "v<ver> — <제목>" --notes "..." \
  --latest \
  app/src-tauri/target/release/bundle/nsis/MultiAgent_<ver>_x64-setup.exe \
  app/src-tauri/target/release/bundle/nsis/MultiAgent_<ver>_x64-setup.exe.sig \
  app/src-tauri/target/release/bundle/nsis/MultiAgentCompany_<ver>_x64-setup.exe \
  app/src-tauri/target/release/bundle/nsis/MultiAgentCompany_<ver>_x64-setup.exe.sig \
  app/src-tauri/target/release/bundle/msi/MultiAgent_<ver>_x64_en-US.msi \
  app/src-tauri/target/release/bundle/msi/MultiAgent_<ver>_x64_en-US.msi.sig \
  app/src-tauri/target/release/bundle/msi/MultiAgentCompany_<ver>_x64_en-US.msi \
  app/src-tauri/target/release/bundle/msi/MultiAgentCompany_<ver>_x64_en-US.msi.sig \
  app/src-tauri/target/release/bundle/latest.json \
  app/src-tauri/target/release/bundle/latest-company.json
```

이미 만들어진 릴리즈에 자산만 갱신/추가할 때:

```bash
gh release upload v<ver> --clobber <파일들...>
gh release edit v<ver> --draft=false --latest
```

### 8. 검증

```bash
# Latest 태그가 이번 버전인가
gh api repos/OneThingChanged/Multiagent/releases/latest --jq '.tag_name'
# 자산이 다 있나 (standard/company setup.exe, .sig, msi, .sig, latest*.json)
gh release view v<ver> --json assets --jq '.assets[].name'
# latest.json 버전 확인 (CDN 캐시 우회: 버전 직접 URL)
curl -sL "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/latest.json" | grep version
curl -sL "https://github.com/OneThingChanged/Multiagent/releases/download/v<ver>/latest-company.json" | grep version
```

> `/releases/latest/download/latest.json`(업데이터가 보는 경로)은 GitHub CDN 캐시 때문에 publish 직후 몇 분간 옛 버전을 줄 수 있다. 버전 직접 URL이 맞으면 정상이고, 몇 분 뒤 캐시가 갱신된다.

## 자주 빠뜨리는 함정 (체크리스트)

- [ ] Tauri 버전 소스 3곳과 Cargo.lock 루트 버전이 모두 갱신됐나
- [ ] `TAURI_SIGNING_PRIVATE_KEY`(+빈 PASSWORD) 주고 `npm run release:build:all` 했나 → 두 variant `.sig` 생성 확인
- [ ] `latest.json` / `latest-company.json`의 signature가 각 variant의 **NSIS setup.exe.sig** 내용인가
- [ ] 릴리즈가 **draft 아님 + Latest 마킹**인가
- [ ] standard/company 자산(setup.exe, setup.exe.sig, msi, msi.sig, latest*.json)을 다 올렸나
- [ ] `gh api .../releases/latest`가 이번 태그를 가리키나

## 미서명 경고

코드 서명 인증서(EV/OV)는 없으므로 첫 실행 시 Windows SmartScreen 경고가 뜬다 ("추가 정보 → 실행"). 이건 위 updater 서명(키 기반 무결성 검증)과는 별개다.
