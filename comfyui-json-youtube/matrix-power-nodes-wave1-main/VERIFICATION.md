# Verification

Version `v1.0.0` was verified on 2026-08-05 against ComfyUI 0.28.0, frontend 1.47.10, and
Python 3.12.13 in isolated runtimes.

- 10/10 exact factory pack hashes loaded by the ComfyUI server.
- 10/10 nodes appeared in the headed ComfyUI frontend.
- 10/10 green key controls opened a visible temporary password input.
- Cancel, empty Save, collapse, expand, and reopen behavior passed.
- 10/10 `live=false` runs were queued through the visible Run control with zero provider submits.
- 10/10 explicitly authorized live smoke runs completed successfully.
- 10/10 restart replays returned pixel-identical decoded output with zero new provider submits.
- Credential route and intent remained ABI v2; PACK_ABI remained 4.
- No credential value or key field was retained in workflows, prompts, evidence, logs, receipts,
  screenshots, or public files.
- Each pack independently passed release hygiene, exact-hash fresh install, and no-overwrite gates.
- The complete domain suite passed 887 tests at the feature-verification checkpoint.

The v1.0.0 paid smoke admitted an estimated total of USD 0.57. This is historical verification,
not a price guarantee. WaveSpeed pricing and model availability can change.

