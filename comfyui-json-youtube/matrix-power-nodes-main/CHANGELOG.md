# Changelog

## 0.1.0 — 2026-07-29

- Dataset Workflow V1: first public MATRIX POWER NODES release, limited to the ComfyUI Custom API
  config and image nodes built specifically for this workflow.
- Added the 25-shot Face/Body workflow with rgthree row and per-shot controls.
- Preserved heterogeneous reference dimensions without native image batching.
- Added account-scoped semantic and upload caching.
- Removed provider credentials from the ComfyUI node schema.
- Added persistent protection against duplicate paid submits after an indeterminate response.
- Removed host-owned ComfyUI runtime packages from release dependencies.
