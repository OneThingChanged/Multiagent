# MultiAgent 프로젝트 지침

## 배포 채널 분리

- 사용자가 **“라이브 배포”** 또는 이에 준하는 표현을 사용하면 Git 저장소와 GitHub Release 채널만 배포한다.
- 라이브 배포만 요청된 경우 Microsoft Store용 MSIX 빌드, 검증, Partner Center 업로드 및 제출을 실행하지 않는다.
- Microsoft Store 배포는 사용자가 **“Microsoft Store 배포”**를 별도로 명시한 경우에만 진행한다.
- 제품 버전은 네 부분 `X.Y.Z.R`을 사용한다. Microsoft Store 배포 시에는 별도 채널의 버전 검증 규칙도 확인한다.
- 두 채널을 모두 배포해야 할 때도 GitHub와 Microsoft Store 절차를 각각 독립적으로 검증하고 실행한다.

## 작은 변경의 버전 증가

- 작은 수정·개선은 Git 커밋을 기준으로 네 번째 자리 `R`만 1 올린다. 예: `1.7.3.0` → `1.7.3.1` → `1.7.3.2`.
- 같은 커밋을 재빌드하거나 재검증할 때는 버전을 추가로 올리지 않는다. 변경과 버전 갱신을 같은 커밋에 포함한다.
- npm 호환 버전은 앞의 세 자리 `X.Y.Z`를 유지하고, 제품 버전·설치 파일명·Android versionName은 `X.Y.Z.R`로 맞춘다. APK를 갱신할 때는 Android versionCode도 증가시킨다.
- 네 번째 자리 증가만으로 Company의 세 자리 GitHub 업데이터나 Store 배포를 자동 수행하지 않는다. 해당 채널 배포는 별도 요청과 검증을 따른다.
