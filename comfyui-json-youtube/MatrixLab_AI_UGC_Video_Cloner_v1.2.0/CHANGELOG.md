# Changelog

## 1.2.0 — 2026-08-19

### Added

- Three-pass Gemini 3.5 Flash video, frame, and audio analysis.
- Opus 5 master-prompt compilation with verified edit-structure handling.
- Ten independently controlled human or product reference slots.
- Optional target screenshot and optional voice-reference inputs.
- Mode A for prompt plus replacement images only.
- Mode B for prompt, replacement images, and source-video edit guidance.
- Analysis audit outputs and a final prompt text output.
- rgthree controls for optional inputs, references, and Seedance modes.

### Changed

- The production release contains no demonstration source video, character reference, voice sample, or generated output.
- Both paid Seedance modes and both Save Video nodes start bypassed.
- The optional target screenshot and voice-reference inputs start bypassed.
- Cut language is emitted only for high-confidence cuts verified by the source blueprint.
- The reference switcher is serialized as a fresh instance for R01–R10.
- All ten enabled reference slots are routed to Opus 5 and to both Seedance modes; disabled slots remain excluded.

### Known limitations

- rgthree Fast Groups Bypasser is not reliable with ComfyUI Nodes 2.0 enabled. Use the stable canvas configuration documented in the README.
- Partner Node pricing and model availability can change. The live ComfyUI node estimate is authoritative.
- AUTO target selection is intentionally conservative. Multi-person and multi-product videos should use an explicit Clone Intent.
