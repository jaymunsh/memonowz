# 블로그 자료

Memonowz를 만들면서 남긴 자료. 전체 서술은 **[../PROCESS.md](../PROCESS.md)** 에 있고, 이 폴더는 그 문서가 참조하는 이미지 모음이다.

## 스크린샷

| 파일 | 시점 / 내용 |
|---|---|
| `01-before-orchestration.png` | 워커 기동 직전의 Orca |
| `02-worker-a-dispatched.png` | 선행 A 워커 기동 직후 |
| `03-gate-b-app-shell.png` | 게이트 B — 다크모드 앱 셸 |
| `04-three-workers-parallel.png` | 병렬 3워커가 도는 Orca |
| `08-home-light.png` | 홈 (라이트, 아이보리) |
| `09-deck-detail.png` | 덱 상세 |
| `10-study-question.png` | 4지선다 출제 |
| `11-card-editor-in-study.png` | 학습 중 카드 편집 모달 |
| `12-graded-with-explanation.png` | 채점 + 개념 설명 자동 펼침 |
| `13-result.png` | 결과 화면 |
| `14-settings.png` | 설정 |
| `15-import-json-schema.png` | 임포트 — JSON 스키마 안내 |

번호 05~07은 캡처에 실패한 시도라 비어 있다. Orca 창이 포커스를 잃으면 스크린샷이 타임아웃된다.

## 다이어그램

SVG는 `currentColor` 기반이라 글의 본문 색을 따라간다. 강조색(`#1F5A6B`)만 고정이고, 앱의 강조색과 같은 값이다.

| 파일 | 무엇을 보여주는가 |
|---|---|
| `module-graph.svg` | 모듈 의존 방향. 기능 모듈끼리 화살표가 **없다는 것**이 병렬의 전제 |
| `orchestration-flow.svg` | Claude 레인과 Codex 레인, 게이트 둘, 팬아웃 3워커 |
| `timeline.svg` | 실행 타임라인과 각 게이트가 잡은 결함 |

## 원본 기록

`.claude/session/devlog.md` 에 턴 단위 기록과 `**결정:**` 라인이 쌓여 있다. `.gitignore` 에 있어 저장소에는 없으니, 글 쓸 때 로컬에서 꺼내 쓴다.
