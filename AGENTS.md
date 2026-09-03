# MultiAgent 프로젝트 지침

## 배포 채널 분리

- 사용자가 **“라이브 배포”** 또는 이에 준하는 표현을 사용하면 Git 저장소와 GitHub Release 채널만 배포한다.
- 라이브 배포만 요청된 경우 Microsoft Store용 MSIX 빌드, 검증, Partner Center 업로드 및 제출을 실행하지 않는다.
- Microsoft Store 배포는 사용자가 **“Microsoft Store 배포”**를 별도로 명시한 경우에만 진행한다.
- GitHub와 Microsoft Store는 동일한 제품 릴리스의 네 부분 버전 `X.Y.Z.0`을 사용한다. Store 배포를 나중에 진행하더라도 해당 GitHub 릴리스와 같은 제품 버전을 유지한다.
- 두 채널을 모두 배포해야 할 때도 GitHub와 Microsoft Store 절차를 각각 독립적으로 검증하고 실행한다.
