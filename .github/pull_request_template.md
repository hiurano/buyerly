## What changed

<!-- Describe the user-visible outcome and the affected product surface. -->

## Verification

- [ ] GitHub Actions is green.
- [ ] No unrelated behavior, API, workspace or security contract changed.
- [ ] `CHANGELOG.md` is updated when the change is user-visible or contract-level.

## UI contract (complete when frontend is affected)

- [ ] I read `docs/UI_CONTRACT.md` and `docs/DESIGN_SYSTEM.md`.
- [ ] Shared controls and semantic tokens are reused; no page-local duplicate component was added.
- [ ] Shared values use `frontend/src/styles/tokens.css`, and shared controls reuse or extend `frontend/src/ui/`.
- [ ] Product UI uses `frontend/`; public legal documents and assets use `frontend/public/`.
- [ ] Focus, disabled, busy, empty, error and success states remain understandable without color alone.
- [ ] Checked 390 / 768 / 1024 / 1440px and there is no document-level horizontal overflow.
- [ ] Existing ids, handlers and API payloads are preserved unless explicitly in scope.
