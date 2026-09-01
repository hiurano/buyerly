# Install with an AI agent

Give the agent this repository and the path to the intended ComfyUI installation. The agent must
read `AGENTS.md`, run `python scripts/verify.py`, use the platform installer, restart ComfyUI, and
perform the visible `live=false` canvas check. Existing target folders are a hard stop.

Suggested prompt:

> Install MATRIX POWER NODES Wave 1 into my ComfyUI. Read AGENTS.md first. Do not overwrite any
> existing custom node, do not inspect or log credentials, keep live=false, make no paid calls, and
> verify all ten nodes in the real ComfyUI canvas after restart.

