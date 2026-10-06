# GitHub에 올리고 갤럭시 탭에 설치하기

PC 웹 브라우저(Chrome/Edge)로 진행하는 방법입니다. git 프로그램 설치는 필요 없습니다.
전체 소요 시간: 약 20~30분.

```mermaid
flowchart LR
  A[1 계정·2단계 인증] --> B[2 저장소 만들기] --> C[3 파일 올리기] --> D[4 Pages 켜기] --> E[5 탭에 설치] --> F[6 첫 실행·폴더 지정]
```

---

## 1. GitHub 계정 만들기 + 2단계 인증 (보안 필수)
1. https://github.com 접속 → **Sign up** → 이메일, 비밀번호, 아이디 입력
   - 아이디는 앱 주소에 들어갑니다: `https://<아이디>.github.io/...`
2. 로그인 후 오른쪽 위 프로필 사진 → **Settings**
3. 왼쪽 메뉴 **Password and authentication** → **Enable two-factor authentication**
4. 휴대폰 인증 앱(Google Authenticator 등) 또는 GitHub Mobile로 등록
5. **복구 코드(Recovery codes)를 내려받아 안전한 곳에 보관**합니다. 휴대폰을 잃어버렸을 때 필요합니다.

## 2. 저장소 만들기
1. 오른쪽 위 **+** → **New repository**
2. 설정
   - Repository name: `work-schedule` (원하는 이름, 영문 권장)
   - **Public** 선택 (무료 Pages 조건. 코드만 공개되고 업무 데이터는 올라가지 않습니다)
   - "Add a README file" 등 나머지는 **체크하지 않음**
3. **Create repository**

> 비공개(Private)로 하려면 GitHub Pro(유료)가 필요합니다. 비공개로 해도 앱 주소는 누구나 열 수 있습니다(빈 앱만 보임).

## 3. 파일 올리기
1. 받은 zip 파일을 PC에서 압축 해제합니다. (`work-schedule-pwa` 폴더)
2. 저장소 화면의 **uploading an existing file** 링크를 누릅니다.
3. `work-schedule-pwa` 폴더 **안의 내용 전체**를 끌어다 놓습니다.
   - `icons` 폴더도 폴더째 끌어다 놓으면 구조가 유지됩니다.
   - 올라가야 할 목록: `index.html`, `app.css`, `app.js`, `xlsx.js`, `store.js`, `sw.js`, `manifest.webmanifest`, `icons/` (3개 파일), `README.md`, `DEPLOY.md`, `.gitignore`
   - `.gitignore`가 안 보이면 탐색기에서 "숨긴 항목 표시"를 켭니다. (빠져도 앱 동작에는 문제 없음)
4. 아래 **Commit changes** 버튼을 누릅니다.
5. 저장소 첫 화면에 위 파일들이 **최상위에** 있는지 확인합니다. (`work-schedule-pwa/index.html`처럼 한 단계 안에 있으면 안 됨)

## 4. GitHub Pages 켜기
1. 저장소 상단 **Settings** → 왼쪽 **Pages**
2. **Build and deployment** → Source: **Deploy from a branch**
3. Branch: **main**, 폴더: **/(root)** → **Save**
4. 1~3분 뒤 같은 화면 위쪽에 주소가 표시됩니다.
   - `https://<아이디>.github.io/work-schedule/`
5. PC 브라우저로 주소를 열어 "작업 폴더를 지정하세요" 화면이 나오면 성공입니다.

## 5. 갤럭시 탭에 설치
1. 탭에서 **Chrome** 앱을 엽니다. (삼성 인터넷 아님)
   - Chrome을 최신 버전으로 업데이트합니다. (Play 스토어 → Chrome → 업데이트)
2. 주소 `https://<아이디>.github.io/work-schedule/` 를 엽니다.
3. 오른쪽 위 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가** → **설치**
4. 홈 화면에 "업무일정" 아이콘이 생깁니다. 이후에는 이 아이콘으로 실행합니다.

## 6. 첫 실행 · 작업 폴더 지정
시작 화면에 버튼이 두 개 있습니다. 처음이면 **신규 생성**, 이미 쓰던 폴더가 있으면 **폴더 선택**을 누릅니다.

- **신규 생성 (오른쪽)**: 만들 위치(권장: `내장 메모리 > Documents`)를 고르고 → **이 폴더 사용** → 접근 **허용**
  - 그 안에 `업무일정` 폴더와 이번 주 빈 파일(`업무일정_2026_W41.xlsx` 등)이 자동으로 만들어지고 앱이 열립니다.
  - 같은 위치에 `업무일정` 폴더가 이미 있으면 그 폴더를 그대로 엽니다.
- **폴더 선택 (왼쪽)**: 기존 작업 폴더를 고르고 → **이 폴더 사용** → 접근 **허용**
- 안드로이드 정책상 **내장 메모리 최상위**와 **Download 폴더 자체**는 고를 수 없습니다. Documents처럼 그 안의 폴더를 고르세요.

이후 순서:
1. 빈 화면이 나오면 **[프로젝트]** 에서 프로젝트를 추가하고 할일을 입력합니다.
2. 저장 확인: 상단에 `저장됨 HH:MM` 표시 → 내 파일 앱의 작업 폴더에 `업무일정_2026_W41.xlsx` 같은 파일이 생겼는지 확인합니다.

**동작 점검 (권장)**
- 앱을 완전히 닫고 다시 열기 → 데이터가 그대로인지
- 비행기 모드에서 앱 열기 → 정상 실행되는지 (오프라인)
- 탭 재부팅 후 열기 → [계속]을 한 번 누르면 이어지는지

---

## 7. 코드를 수정해서 다시 올릴 때
1. PC에서 파일을 수정하고 **`sw.js`의 `VERSION`을 올립니다** (예: `'1.0.0'` → `'1.0.1'`).
2. 저장소 화면 → **Add file → Upload files** → 바뀐 파일들을 끌어다 놓기 → **Commit changes** (같은 이름은 덮어씀)
3. 1~3분 뒤 탭에서 앱을 열면 상단에 **"새 버전(1.0.1)이 준비되었습니다"** → **[업데이트]**
4. **직접 올린 적이 없는데 이 안내가 뜨면 누르지 말고**, GitHub 저장소의 커밋 기록(Commits)을 확인하세요.

---

## 8. 문제 해결

| 증상 | 원인·조치 |
|---|---|
| "이 브라우저는 작업 폴더 저장 기능을 지원하지 않습니다" | 삼성 인터넷 또는 구버전 Chrome → 최신 Chrome으로 열기 |
| 앱 설치 메뉴가 없음 | Chrome 메뉴의 "홈 화면에 추가" 사용. 주소가 `https://`인지 확인 |
| 앱을 열 때마다 [계속]을 눌러야 함 | 브라우저 보안 정책상 정상 동작. 한 번 누르면 이어짐 |
| 폴더 기억이 사라짐 | Chrome 데이터 삭제 등으로 발생. [폴더 선택]으로 같은 폴더를 다시 지정하면 됨 (데이터는 폴더에 있음) |
| "저장 실패" 표시 | 폴더 권한이 끊김 → [저장]을 눌러 다시 허용 |
| "파일을 읽지 못했습니다" | 저장 중 앱이 꺼져 파일이 손상됨 → [복구해서 다시 저장] |
| Pages 주소가 404 | 파일이 저장소 최상위에 있는지, Pages 설정(main, /root) 확인 후 몇 분 대기 |
| PC 엑셀에서 수정한 내용이 안 보임 | 수정한 파일이 가장 최신 주차 파일인지 확인. 머리글 이름을 바꾸지 않았는지 확인 |

---

참고:
- [About GitHub Pages – GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)
- [Configuring a publishing source for your GitHub Pages site – GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Configuring two-factor authentication – GitHub Docs](https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication)
- [Document tree access restrictions – Android Developers](https://developer.android.com/training/data-storage/shared/documents-files#document-tree-access-restrictions)
