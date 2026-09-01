#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/ComfyUI" >&2
  exit 2
fi

bundle_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
comfy_root="$(cd "$1" && pwd)"
custom_nodes="$comfy_root/custom_nodes"

[[ -f "$comfy_root/main.py" ]] || { echo "The selected root does not contain ComfyUI main.py." >&2; exit 1; }
[[ -d "$custom_nodes" ]] || { echo "The selected ComfyUI root has no custom_nodes directory." >&2; exit 1; }
python3 "$bundle_root/scripts/verify.py"

mapfile -t packs < <(find "$bundle_root/custom_nodes" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
[[ ${#packs[@]} -eq 10 ]] || { echo "Expected exactly 10 source packs." >&2; exit 1; }
for pack in "${packs[@]}"; do
  [[ ! -e "$custom_nodes/$pack" ]] || { echo "Destination already exists: $custom_nodes/$pack. Refusing to merge or overwrite." >&2; exit 1; }
done

stage="$custom_nodes/.matrix-wave1-stage-$$"
trap 'rm -rf -- "$stage"' EXIT
mkdir "$stage"
for pack in "${packs[@]}"; do
  cp -R "$bundle_root/custom_nodes/$pack" "$stage/$pack"
done
for pack in "${packs[@]}"; do
  mv "$stage/$pack" "$custom_nodes/$pack"
done

echo "Installed 10 MATRIX POWER NODES Wave 1 packs. Restart ComfyUI and keep live=false for the installation check."

