# Implementation Plan — UI Contract Governance

## Goal

Make Buyerly controls and visual primitives change from one production source, while ensuring Codex, Claude and GitHub Copilot read the same mandatory rules.

## Scope

1. Define the normative component and token contract.
2. Point repository agent instructions to that contract without duplicating it.
3. Move the active shared foundation tokens into `ui-system.css` and keep `styles.css` as the legacy/domain layer.
4. Add a pull-request checklist and frontend contract tests that fail when the governance files or canonical tokens drift.
5. Preserve existing markup behavior and API contracts.

## Definition of done

- shared control values are declared in `ui-system.css`;
- new UI work has one mandatory documented path;
- Codex, Claude and Copilot instruction entrypoints reference the same contract;
- CI verifies the instruction files, token ownership and component recipes;
- CSS cache version and changelog are updated;
- GitHub Actions is green before merge.
