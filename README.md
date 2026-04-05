# Smart Folder (스마트 폴더)

AI 기반 스마트 미디어 정리 도구 - macOS 데스크톱 애플리케이션

## 개요

Smart Folder는 사진과 영상 파일을 자동으로 분류, 정리, 동기화하는 데스크톱 애플리케이션입니다. EXIF 메타데이터 분석, 이미지 품질 평가, 중복 감지, 파일 동기화 등 미디어 관리에 필요한 모든 기능을 제공합니다.

**Tech Stack:** Tauri 2 + Rust + React 19 + TypeScript + TailwindCSS + SQLite

---

## 주요 기능

### 1. 미디어 라이브러리 관리

여러 소스 폴더를 등록하여 사진과 영상을 통합 관리합니다.

- **2단계 스캔**: Phase 0(빠른 파일 목록) + Phase 1(EXIF 추출, 썸네일 생성)
- **지원 포맷**: JPEG, PNG, GIF, BMP, WebP, TIFF, HEIC, HEIF, AVIF, RAW(CR2, CR3, NEF, ARW, DNG 등), MP4, MOV, AVI, MKV, WebM 등 40종+
- **EXIF 메타데이터**: 촬영일, 카메라 정보, GPS 좌표, 렌즈, 초점거리, 조리개, ISO
- **보기 모드**: 그리드/리스트 뷰, 날짜별/폴더별 그룹핑, 페이지네이션

### 2. 중복 파일 탐지

3단계 알고리즘으로 정확하고 빠르게 중복 파일을 찾습니다.

- **Phase 1**: 파일 크기 기반 후보 그룹핑 (100KB 이상)
- **Phase 2**: xxHash64 퀵 해시 (4KB) - 기존 SHA256 대비 10~50배 빠름
- **Phase 3**: SHA256 전체 해시로 정확한 중복 확인
- **Dry-Run 미리보기**: 삭제 전 영향 받을 파일 목록 확인 가능
- **보관 파일 지정**: 그룹 내 원본으로 유지할 파일 선택

### 3. B컷 자동 탐지 (버스트 사진 정리)

연속 촬영된 사진 중 최고 품질을 자동으로 선택합니다.

- **시간 근접성 그룹핑**: 설정 가능한 시간 간격 (기본 5초)
- **이미지 품질 분석**:
  - 선명도: 라플라시안 분산 (Laplacian variance)
  - 노출: 히스토그램 기반 밝기/클리핑 분석
  - 해상도 가중치 (15%)
  - 파일 크기 정규화 (10%)
- **자동 최고 사진 선택** + 수동 오버라이드
- **Dry-Run 미리보기**: B컷 삭제 전 미리 확인

### 4. 스마트 정리

파일을 자동으로 분류하여 폴더 구조를 정리합니다.

- **날짜별 정리**: EXIF 촬영일 기준 YYYY-MM-DD 폴더 구조
- **유형별 정리**: 사진/영상 자동 분류
- **미리보기 후 실행**: Dry-Run으로 이동 계획 확인 후 실행
- **완전한 되돌리기**: 모든 작업을 undo journal에 기록

### 5. 파일 동기화

소스 폴더에서 대상 폴더로 단방향 동기화를 수행합니다.

- **Dry-Run 미리보기**: 동기화 실행 전 변경 사항 전체 확인
- **청크 복사**: 1MB 단위 진행률 표시
- **충돌 해결**: 대상이 더 최근인 경우 3가지 옵션
  - 소스로 덮어쓰기 (Force Copy)
  - 대상 이름 변경 후 복사 (Rename + Copy)
  - 건너뛰기 (Skip)
- **xxHash64 체크섬 비교**: 동일 내용이면 충돌 무시
- **고아 파일 감지**: 소스에 없는 대상 파일 목록화
- **제외 패턴**: glob 패턴으로 특정 파일/폴더 제외
- **프리셋 저장**: 자주 쓰는 동기화 설정 저장/재사용
- **취소 지원**: 동기화 중 언제든 중단 가능

### 6. 외장 디바이스 자동 감지

SD카드, USB 드라이브 등 외장 디바이스를 자동으로 인식합니다.

- **macOS 네이티브**: `diskutil` 기반 볼륨 정보 파싱
- **자동 감지**: 마운트/언마운트 이벤트 실시간 모니터링
- **안전한 추출**: `diskutil eject` 기반 안전 추출
- **디바이스 식별**: UUID 기반 디바이스 추적
- **소스 등록**: 감지된 볼륨을 바로 소스 폴더로 추가

### 7. 파일시스템 실시간 감시 (Watch Mode)

소스 폴더의 변경사항을 실시간으로 감지합니다.

- **notify 크레이트**: macOS FSEvents 기반 파일 감시
- **500ms 디바운싱**: 대량 변경 시 이벤트 배치 처리
- **폴더별 토글**: 개별 폴더 감시 시작/중지
- **자동 스캔 연동**: 변경 감지 시 자동 라이브러리 업데이트

### 8. 스케줄링 (Cron 기반 반복 작업)

정해진 시간에 작업을 자동으로 실행합니다.

- **Cron 표현식**: 유연한 스케줄 설정
- **지원 작업**: 스캔, 중복 탐지, 정리, 동기화
- **활성화/비활성화**: 개별 스케줄 토글
- **설정 영속화**: YAML 설정 파일에 저장

### 9. 사진 리뷰어

폴더 단위로 사진을 하나씩 검토하며 정리합니다.

- **키보드 단축키**: K(보관), D(버리기), 방향키(탐색)
- **진행률 표시**: 검토 완료 비율 실시간 표시
- **일괄 삭제**: 마킹된 파일 한 번에 삭제
- **프리뷰 캐시**: 전후 이미지 미리 로드

### 10. 폴더 트리 분석

파일 시스템을 다양한 관점에서 분석합니다.

- **폴더 트리**: 계층적 폴더 탐색 (최대 5단계)
- **용량 분석**: 폴더별 저장 공간 사용량 시각화
- **분할 비교**: 두 폴더를 나란히 비교
- **날짜 폴더 정리**: YYYYMMDD → YYYY-MM-DD 일괄 변환

### 11. MCP (Model Context Protocol) 통합

AI 에이전트가 Smart Folder를 제어할 수 있는 MCP 서버를 제공합니다.

- **Unix 도메인 소켓**: `{app_data_dir}/smart-folder.sock`
- **JSON-RPC 프로토콜**: MCP 2024-11-05 규격 준수
- **지원 도구 6종**: scan, get_stats, detect_duplicates, organize, sync, get_media_list

### 12. 작업 히스토리 및 되돌리기

모든 파일 작업을 추적하고 되돌릴 수 있습니다.

- **배치 기반 기록**: 관련 작업을 하나의 배치로 그룹핑
- **역순 되돌리기**: LIFO 순서로 안전하게 되돌리기
- **DB 경로 동기화**: 파일 이동 시 DB 경로도 함께 업데이트

### 13. 다국어 지원 (i18n)

한국어와 영어를 지원하며 언어 전환이 가능합니다.

- **지원 언어**: 한국어 (기본), English
- **번역 키**: 130+ 키 (15개 네임스페이스)
- **동적 전환**: 설정에서 즉시 언어 변경
- **자동 감지**: 브라우저 언어 설정 기반 초기 언어 선택

### 14. 설정 시스템

모든 앱 설정을 YAML 파일로 관리합니다.

- **Atomic 저장**: 임시 파일 → rename 패턴으로 손상 방지
- **설정 항목**: 테마, 언어, 파일 감시, 동기화 프리셋, 스케줄, MCP
- **설정 UI**: 일반/감시/스케줄/MCP 탭 기반 설정 화면

---

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데스크톱 프레임워크 | Tauri 2.10.3 |
| 백엔드 | Rust 2021 edition |
| 비동기 런타임 | Tokio (full features) |
| 병렬 처리 | Rayon |
| 프론트엔드 | React 19 + TypeScript 5.9 |
| 상태 관리 | Zustand 5 |
| UI/스타일링 | TailwindCSS 4 + Lucide Icons |
| 빌드 도구 | Vite 8 |
| 데이터베이스 | SQLite (rusqlite, WAL mode) |
| 해싱 | xxHash64 (quick), SHA256 (full) |
| 이미지 처리 | image crate, kamadak-exif |
| 파일 감시 | notify 7.0 |
| 스케줄링 | tokio-cron-scheduler |
| 설정 | serde_yaml (atomic write) |
| 국제화 | i18next + react-i18next |
| MCP | 커스텀 JSON-RPC over Unix socket |

---

## 데이터베이스 스키마

21개 테이블로 구성된 정규화된 SQLite 스키마:

| 테이블 | 용도 |
|--------|------|
| `media_files` | 미디어 파일 메타데이터 (핵심) |
| `media_exif` | EXIF 카메라/GPS 정보 |
| `tags` / `media_tags` | 태그 시스템 |
| `albums` / `album_media` | 앨범/컬렉션 |
| `duplicate_groups` / `duplicate_members` | 중복 그룹 |
| `bcut_groups` / `bcut_members` | B컷 그룹 |
| `source_folders` | 등록된 소스 폴더 |
| `undo_journal` | 작업 히스토리 |
| `classification_rules` | 분류 규칙 |
| `watch_activity_log` | 파일 감시 이벤트 로그 |
| `schedules` / `schedule_runs` | 스케줄 관리 |
| `sync_history` / `sync_file_checksums` | 동기화 이력 |
| `known_devices` | 외장 디바이스 UUID 추적 |

---

## 프로젝트 구조

```
smart_folder/
├── src/                          # React 프론트엔드
│   ├── App.tsx                   # 메인 앱 (뷰 라우팅)
│   ├── main.tsx                  # 엔트리포인트
│   ├── i18n/                     # 국제화
│   │   ├── index.ts              # i18next 초기화
│   │   └── locales/              # 번역 파일 (ko.json, en.json)
│   ├── stores/
│   │   └── appStore.ts           # Zustand 전역 상태
│   ├── hooks/
│   │   └── useTauriEvents.ts     # Tauri 이벤트 리스너 (6종)
│   ├── types/
│   │   └── index.ts              # TypeScript 타입 정의 (30+)
│   ├── utils/
│   │   └── format.ts             # 포맷팅 유틸리티
│   └── components/
│       ├── layout/
│       │   └── TitleBar.tsx      # 헤더 내비게이션
│       ├── sidebar/
│       │   ├── Sidebar.tsx       # 사이드바 (소스, 라이브러리, 도구)
│       │   └── VolumePanel.tsx   # 외장 디바이스 패널
│       ├── gallery/
│       │   └── GalleryGrid.tsx   # 미디어 갤러리
│       ├── duplicates/
│       │   └── DuplicatesView.tsx # 중복 관리
│       ├── bcut/
│       │   └── BcutView.tsx      # B컷 관리
│       ├── organize/
│       │   ├── OrganizeView.tsx  # 스마트 정리
│       │   └── HistoryView.tsx   # 작업 히스토리
│       ├── review/
│       │   └── ReviewView.tsx    # 사진 리뷰어
│       ├── foldertree/
│       │   └── FolderTreeView.tsx # 폴더 분석 (4모드)
│       ├── sync/
│       │   ├── SyncView.tsx      # 동기화 메인 뷰
│       │   └── ConflictReviewPanel.tsx # 충돌 해결 UI
│       └── settings/
│           └── SettingsView.tsx  # 설정 (일반/감시/스케줄/MCP)
│
├── src-tauri/                    # Rust 백엔드
│   ├── Cargo.toml                # Rust 의존성 (25+ 크레이트)
│   ├── tauri.conf.json           # Tauri 설정
│   └── src/
│       ├── lib.rs                # 앱 초기화 + 44개 커맨드 등록
│       ├── core/                 # 비즈니스 로직
│       │   ├── config.rs         # YAML 설정 (atomic write)
│       │   ├── hasher/mod.rs     # xxHash64 + SHA256 해싱
│       │   ├── scanner/mod.rs    # 파일 탐색 (40+ 포맷)
│       │   ├── metadata/mod.rs   # EXIF 추출
│       │   ├── quality.rs        # 이미지 품질 분석
│       │   ├── classifier/mod.rs # 파일 분류 규칙
│       │   ├── organizer/mod.rs  # 파일 이동/복사/되돌리기
│       │   ├── undo/mod.rs       # 작업 기록
│       │   ├── sync.rs           # 동기화 엔진
│       │   ├── watcher.rs        # 파일시스템 감시
│       │   ├── volume.rs         # 외장 디바이스 감지
│       │   ├── scheduler.rs      # Cron 스케줄러
│       │   └── mcp/              # MCP 서버
│       │       ├── mod.rs        # JSON-RPC 서버
│       │       └── tools.rs      # MCP 도구 정의 (6종)
│       ├── commands/             # Tauri 커맨드 핸들러
│       │   ├── scan.rs           # 스캔 (4 커맨드)
│       │   ├── folders.rs        # 소스 폴더 (5 커맨드)
│       │   ├── media.rs          # 미디어 조회 (7 커맨드)
│       │   ├── duplicate.rs      # 중복 관리 (9 커맨드)
│       │   ├── bcut.rs           # B컷 관리 (7 커맨드)
│       │   ├── organize.rs       # 정리 (2 커맨드)
│       │   ├── fileops.rs        # 파일 작업 (9 커맨드)
│       │   ├── undo.rs           # 되돌리기 (2 커맨드)
│       │   ├── sync.rs           # 동기화 (7 커맨드)
│       │   ├── config.rs         # 설정 (3 커맨드)
│       │   ├── watch.rs          # 파일 감시 (3 커맨드)
│       │   ├── schedule.rs       # 스케줄 (4 커맨드)
│       │   ├── volume.rs         # 볼륨 (4 커맨드)
│       │   └── mcp.rs            # MCP 제어 (3 커맨드)
│       └── db/                   # 데이터베이스
│           ├── connection.rs     # SQLite 연결 (WAL, Mutex)
│           ├── migrations.rs     # 스키마 (21 테이블)
│           └── queries.rs        # SQL 쿼리
│
├── package.json                  # npm 의존성
├── vite.config.ts                # Vite 빌드 설정
├── tsconfig.json                 # TypeScript 설정
└── scripts/
    └── bump-version.mjs          # 버전 관리 스크립트
```

---

## 시작하기

### 사전 요구사항

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.77.2+
- macOS (볼륨 감지, 파일 작업에 macOS 전용 기능 사용)

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run tauri:dev

# 프로덕션 빌드
npm run tauri:build
```

### 버전 관리

```bash
npm run version:patch   # 0.1.3 → 0.1.4
npm run version:minor   # 0.1.3 → 0.2.0
npm run version:major   # 0.1.3 → 1.0.0
```

---

## 향후 로드맵

- [ ] CLI 모드 (헤드리스 동기화/정리 실행)
- [ ] AI 이미지 분류 (Claude Vision 통합)
- [ ] 유사 이미지 탐지 (Perceptual Hash 비교)
- [ ] 클라우드 스토리지 연동
- [ ] GPS 기반 지도 뷰
- [ ] 태그 시스템 UI
- [ ] 앨범/컬렉션 관리

---

## 라이선스

MIT License
