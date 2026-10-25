# 2026-10-25 — 트러블슈팅 문서 로컬 전용 전환

## 실제 작업 순서와 변경 파일

1. .gitignore, git status, git ls-files docs/troubleshooting을 확인했다. 기존 추적 파일은 4개였고 미추적 문서도 있었다.
2. .gitignore에 /docs/troubleshooting/을 추가해 해당 폴더 전체를 이후 추가 대상에서 제외했다.
3. 이 작업 이력 파일을 작성했다.
4. git rm -r --cached -- docs/troubleshooting으로 기존 추적 파일 4개만 Git 인덱스에서 제외했다. 로컬 파일과 기존 미커밋 문서 내용은 유지했다.
5. git ls-files, git check-ignore, 로컬 파일 존재 여부 및 staged diff를 확인했다.

기존 커밋 이력을 재작성하거나 push하지 않는다. 추적 제거는 staged 상태이며 다음 커밋에 반영된다. 다른 작업의 미커밋 변경은 유지한다. 코드 변경이 없어 빌드/테스트는 실행하지 않는다.
