# Learnings and edge cases

- Native browser `prompt()` is not supported in the tested ComfyUI/Electron surface. Canvas-only
  controls need a same-document dialog or temporary DOM input.
- A credential field must never be a ComfyUI widget; widgets serialize into workflows and prompts.
- Empty Save is not Cancel. It must close safely and visibly report `No API Key entered`.
- Collapsing a node while the dialog is open must clear and remove the temporary password inputs.
- ComfyUI can rewrite PNG container metadata on SaveImage. Compare decoded pixels when proving a
  cache replay, not only the PNG container hash.
- Edit-node verification needs an input image at runtime, but public workflows must ship with an
  empty `LoadImage` value to avoid leaking a local filename.
- ComfyUI creates Python bytecode unless the isolated verifier disables it. Exact tree-hash checks
  should run before imports or use `PYTHONDONTWRITEBYTECODE=1`.
- Frontend selectors change. A failed node-search selector is not proof that a node failed to load;
  cross-check server registration and the visible canvas before classifying the defect.
- Ten generated key-mask JavaScript files are specialized for ten node classes and therefore have
  different file hashes. Their shared-block identity is proven by the same manifest block version
  and content hash.
- `live=false` is a safety gate, not a credential check. Credential ingestion and billable execution
  remain separate actions.

