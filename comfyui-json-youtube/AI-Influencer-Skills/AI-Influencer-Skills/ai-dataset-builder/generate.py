"""
generate.py — shared runner for the AI Dataset Builder / AI Instagram Engine skills.
core version: 5.4.0 (keep this file byte-identical in both skills)

Reads anchor images from anchors/ (face/ body/ style/), uploads them once, then
generates images of the user's OWN character. Identity comes only from the anchors.

MODES
  A) Scene file (default scenes-grey.md, or --scenes <file>):
       py generate.py --character mia
       py generate.py --character mia --blocks face,360
       py generate.py --character mia --scenes scenes-white.md
  B) Custom jobs authored by Claude (the example image is NEVER uploaded):
       py generate.py --character mia --prompt "Show the character ..." --name pose_01
       py generate.py --character mia --jobs-file custom.json
  C) Headless IG fallback (needs ig-blocks.md):
       py generate.py --character mia --ig 10

ANCHOR SYSTEM (fixed reference order — the consistency core)
  anchors/face/     THE face anchor (+ extra face views)  -> always reference #1
  anchors/body/     body / angle anchors                  -> 1-3 per shot (variable)
  anchors/style/    approved IG-look references           -> up to 3, only on ig/custom shots
  anchors/unsorted/ drop zone for unclassified pictures   -> NEVER used directly;
                    Claude looks at each one and copies it into face/ or body/ first
  Images dropped flat into anchors/ are auto-classified by filename
  (face/closeup/portrait -> face, style/insta -> style, everything else -> body).

  LOW-ANCHOR MODE: if face+body together are <= 4 images, every shot gets ALL of
  them — a tiny anchor set needs every identity signal it has. Bigger sets get a
  curated selection instead (more mediocre refs dilute identity).

    py generate.py --dry-run        # model, count, anchor plan — no API calls
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

from engine_client import get_model, is_balance_error, load_env, EngineError

SKILL_DIR = Path(__file__).resolve().parent
ANCHOR_DIR = SKILL_DIR / "anchors"
MANIFEST_FILE = ANCHOR_DIR / "manifest.json"
IG_BLOCKS_FILE = SKILL_DIR / "ig-blocks.md"
DEFAULT_SCENES = SKILL_DIR / "scenes-grey.md"
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp"}
UNSUPPORTED_EXT = {".heic", ".heif", ".avif", ".bmp", ".tif", ".tiff", ".gif"}
LOW_ANCHOR_MAX = 4   # <= this many identity anchors -> send all of them on every shot
MAX_STYLE_REFS = 3   # style refs ride AFTER the identity refs, never before

# output kind derives from the installed skill folder name, so both skills can
# share this file byte-identically but never write into each other's output
KIND = "dataset" if "dataset" in SKILL_DIR.name.lower() else "instagram"

# stem prefix -> (block, default aspect)
BLOCK_RULES = [
    ("face_",     ("face", "3:4")),
    ("emotions_", ("emotions", "1:1")),
    ("r360w_",    ("360-white", "3:4")),
    ("r360_",     ("360", "3:4")),
    ("ig_",       ("ig", "4:5")),
]

# how many BODY anchors a shot gets (the face anchor always rides in front);
# rotation/body shots need more angles, tight face shots need fewer
BODY_COUNT = {"face": 1, "emotions": 1, "360": 3, "360-white": 3,
              "ig": 2, "custom": 2, "other": 2}
STYLE_BLOCKS = {"ig", "custom"}   # only content shots get style references
VIEW_BLOCKS = {"360", "360-white"}  # pull matching-angle body anchor forward


def detect_block(stem):
    for prefix, (block, aspect) in BLOCK_RULES:
        if stem.startswith(prefix):
            return block, aspect
    return "other", "3:4"


def view_from_name(name):
    n = name.lower()
    if "34_back_left" in n:   return "34_back_left"
    if "34_back_right" in n:  return "34_back_right"
    if "34_front_left" in n or "34_left" in n:   return "34_front_left"
    if "34_front_right" in n or "34_right" in n: return "34_front_right"
    if "profile_left" in n:   return "profile_left"
    if "profile_right" in n:  return "profile_right"
    if "back" in n:           return "back"
    return "front"


def parse_scenes(path):
    jobs, pending = [], None
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if not line.strip() or line.startswith("#"):
            continue
        if line.lstrip().startswith(">"):
            if pending:
                block, aspect = detect_block(pending)
                jobs.append({"stem": pending, "filename": f"{pending}.png",
                             "prompt": line.lstrip()[1:].strip(),
                             "block": block, "aspect": aspect,
                             "view": view_from_name(pending)})
                pending = None
        elif re.match(r"^[a-z0-9_]+$", line.strip()):
            pending = line.strip()
        else:
            pending = None
    return jobs


# --------------------------------------------------------------------------- #
# anchor discovery + selection

def _images(d):
    if not d.exists():
        return []
    return sorted(p for p in d.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXT)


def find_anchors():
    """{'face': [...], 'body': [...], 'style': [...], 'unsorted': [...]} as Paths.
    Subfolders are the truth; flat files in anchors/ get classified by filename
    keywords. unsorted/ is a drop zone — counted but never used for generation."""
    groups = {"face": _images(ANCHOR_DIR / "face"),
              "body": _images(ANCHOR_DIR / "body"),
              "style": _images(ANCHOR_DIR / "style"),
              "unsorted": _images(ANCHOR_DIR / "unsorted")}
    for p in _images(ANCHOR_DIR):
        n = p.name.lower()
        if any(k in n for k in ("face", "closeup", "close-up", "portrait")):
            groups["face"].append(p)
        elif any(k in n for k in ("style", "insta", "ig_")):
            groups["style"].append(p)
        else:
            groups["body"].append(p)
    if not groups["face"] and groups["body"]:
        # best effort: promote the first body image — every shot needs a face anchor
        groups["face"] = [groups["body"].pop(0)]
    return groups


def rel_name(p):
    return p.relative_to(ANCHOR_DIR).as_posix()


def load_manifest():
    if not MANIFEST_FILE.exists():
        return None
    try:
        return json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    except Exception:
        return None


def apply_manifest_face(manifest, groups):
    """manifest.json may name the face_anchor explicitly — move it to front."""
    if not manifest:
        return
    fa = manifest.get("face_anchor")
    if not fa:
        return
    for key in ("face", "body", "style"):
        for p in groups[key]:
            if p.name == fa:
                groups[key].remove(p)
                groups["face"].insert(0, p)
                return


def anchor_view(manifest, name):
    base = name.split("/")[-1]
    if manifest:
        for a in manifest.get("anchors", []):
            if a.get("file") in (base, name) and a.get("view"):
                return a["view"]
    return view_from_name(base)


def select_anchor_files(job, named, manifest, max_refs):
    """The fixed reference order: face anchor first, then 1-3 body anchors
    (rotation shots pull the matching-angle anchor forward), then up to 3
    style references — only on content (ig/custom) shots."""
    faces, bodies, styles = named["face"], named["body"], named["style"]
    block = job["block"]
    pool = faces[1:] + bodies            # extra face views are identity refs too
    if block in VIEW_BLOCKS:
        tview = job.get("view", "front")
        pool = sorted(pool, key=lambda n: 0 if anchor_view(manifest, n) == tview else 1)
    chosen = faces[:1] + pool[:BODY_COUNT.get(block, 2)]
    if block in STYLE_BLOCKS:
        chosen += styles[:MAX_STYLE_REFS]
    if len(faces) + len(bodies) <= LOW_ANCHOR_MAX:
        chosen += [n for n in pool if n not in chosen]
    out = []
    for n in chosen:
        if n not in out:
            out.append(n)
    return out[:max_refs]


# --------------------------------------------------------------------------- #
def build_custom_jobs(args):
    jobs = []
    if args.jobs_file:
        for i, it in enumerate(json.loads(Path(args.jobs_file).read_text(encoding="utf-8")), 1):
            stem = it.get("name") or f"custom_{i:02d}"
            block, _ = detect_block(stem)
            jobs.append({"stem": stem, "filename": f"{stem}.png", "prompt": it["prompt"],
                         "block": block if block != "other" else "custom",
                         "aspect": it.get("aspect", "3:4"), "view": view_from_name(stem)})
    if args.prompt:
        stem = args.name or "custom_01"
        jobs.append({"stem": stem, "filename": f"{stem}.png", "prompt": args.prompt,
                     "block": "custom", "aspect": args.aspect or "3:4",
                     "view": view_from_name(stem)})
    return jobs


def parse_blocks_file(path):
    """Parse ig-blocks.md into {TEMPLATES, OUTFITS, LIGHTS} (lines under ## headers)."""
    section, blocks = None, {}
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("## "):
            section = line[3:].strip().upper()
            blocks[section] = []
        elif line.startswith("- ") and section:
            blocks[section].append(line[2:].strip())
    return blocks


def sample_ig(blocks, n):
    """Headless fallback: compose N unique prompts from template x outfit x light."""
    templates = blocks.get("TEMPLATES", [])
    outfits = blocks.get("OUTFITS", [])
    lights = blocks.get("LIGHTS", [])
    if not (templates and outfits and lights):
        return []
    seen, jobs, tries = set(), [], 0
    while len(jobs) < n and tries < n * 60:
        tries += 1
        t, o, l = random.choice(templates), random.choice(outfits), random.choice(lights)
        if (t, o) in seen:
            continue
        seen.add((t, o))
        prompt = (t.replace("{outfit}", o).replace("{light}", l) +
                  " Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images.")
        i = len(jobs) + 1
        jobs.append({"stem": f"ig_{i:03d}", "filename": f"ig_{i:03d}.png", "prompt": prompt,
                     "block": "ig", "aspect": "4:5", "view": "front"})
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--character", default="character")
    ap.add_argument("--model", help="nano-banana-pro|nano-banana-2|gpt-image-2|seedream (all on WaveSpeed)")
    ap.add_argument("--scenes", help="scene file (default scenes-grey.md), e.g. scenes-white.md")
    ap.add_argument("--blocks", default="all", help="filter scene blocks, e.g. face,360")
    ap.add_argument("--prompt", help="a single Claude-authored prompt")
    ap.add_argument("--name", help="filename stem for --prompt")
    ap.add_argument("--aspect", help="aspect ratio override, e.g. 3:4 / 4:5 / 9:16")
    ap.add_argument("--resolution", help="1K / 2K / 4K (default 2K)")
    ap.add_argument("--jobs-file", dest="jobs_file", help="JSON list of {name,prompt,aspect}")
    ap.add_argument("--ig", type=int, help="headless fallback: N random-mixed Instagram posts")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-concurrent", type=int, default=4)
    args = ap.parse_args()

    # any character name must survive as a folder/file name on every OS
    slug = re.sub(r"[^A-Za-z0-9._-]+", "_", args.character).strip("_.") or "character"
    if slug != args.character:
        print(f"NOTE: character name sanitized for file paths: '{args.character}' -> '{slug}'")
        args.character = slug

    load_env()
    try:
        eng = get_model(args.model)
    except EngineError as e:
        print(f"ERROR: {e.message}")
        print("Fix: put the WaveSpeed API key in the .env file (not in chat).")
        print("     No key yet? Get one at https://wavespeed.ai/?ref=matrix")
        sys.exit(1)
    if args.resolution:
        eng.resolution = args.resolution

    groups = find_anchors()
    unsorted_n = len(groups.pop("unsorted", []))
    manifest = load_manifest()
    apply_manifest_face(manifest, groups)
    skipped = sorted(p.name for p in ANCHOR_DIR.rglob("*")
                     if p.is_file() and p.suffix.lower() in UNSUPPORTED_EXT)
    if skipped:
        shown = ", ".join(skipped[:6]) + (" ..." if len(skipped) > 6 else "")
        print(f"WARNING: {len(skipped)} anchor image(s) skipped — unsupported format: {shown}")
        print("         Convert HEIC/HEIF etc. to JPG or PNG, then rerun.")
    if not groups["face"]:
        if unsorted_n:
            print(f"ERROR: {unsorted_n} image(s) are waiting in anchors/unsorted/ — sort them first.")
            print("Fix: look at each image, copy the best frontal portrait into anchors/face/")
            print("     and clear body/angle shots into anchors/body/ (originals stay in unsorted/).")
        else:
            print(f"ERROR: no anchor images found in {ANCHOR_DIR}")
            print("Fix: put the face image into anchors/face/ and body shots into anchors/body/ —")
            print("     or drop everything into anchors/unsorted/ and let Claude sort it.")
        sys.exit(1)
    if unsorted_n:
        print(f"NOTE: {unsorted_n} image(s) in anchors/unsorted/ are NOT used — "
              f"sort them into face/ or body/ to include them.")
    named = {k: [rel_name(p) for p in v] for k, v in groups.items()}
    all_paths = groups["face"] + groups["body"] + groups["style"]
    n_identity = len(named["face"]) + len(named["body"])

    big = [p for p in all_paths if p.stat().st_size > 10 * 1024 * 1024]
    if big:
        names = ", ".join(p.name for p in big[:4]) + (" ..." if len(big) > 4 else "")
        print(f"WARNING: {len(big)} anchor file(s) over 10 MB ({names}) — uploads may be slow or fail.")
        print("         Convert them to JPG (quality ~92): identical results, a fraction of the size.")

    # jobs: headless ig / custom / scene file
    if args.ig:
        if not IG_BLOCKS_FILE.exists():
            print("ERROR: --ig needs ig-blocks.md (this skill does not ship it).")
            sys.exit(1)
        jobs = sample_ig(parse_blocks_file(IG_BLOCKS_FILE), args.ig)
    elif args.prompt or args.jobs_file:
        jobs = build_custom_jobs(args)
    else:
        scene_path = Path(args.scenes) if args.scenes else DEFAULT_SCENES
        if not scene_path.is_absolute():
            scene_path = SKILL_DIR / scene_path
        if not scene_path.exists():
            print(f"ERROR: scene file not found: {scene_path}")
            sys.exit(1)
        jobs = parse_scenes(scene_path)
        if args.blocks != "all":
            wanted = {b.strip() for b in args.blocks.split(",")}
            jobs = [j for j in jobs if j["block"] in wanted]
    if not jobs:
        print("ERROR: nothing to generate.")
        sys.exit(1)
    if args.aspect:
        for j in jobs:
            j["aspect"] = args.aspect

    low = n_identity <= LOW_ANCHOR_MAX
    print(f"Model:       {eng.name}  ({eng.nsfw} NSFW, up to {eng.max_refs} refs)")
    print(f"Resolution:  {eng.resolution}{'  aspect ' + args.aspect if args.aspect else ''}")
    print(f"Anchors:     face {len(named['face'])} + body {len(named['body'])} + style {len(named['style'])}"
          f"  (low-anchor mode: {'ON — all identity anchors on every shot' if low else 'off'})")
    print(f"Face anchor: {named['face'][0]}  (reference #1 on every shot)")
    print(f"Images:      {len(jobs)}")
    try:
        print(f"Balance:     {eng.get_balance()}")
    except EngineError as e:
        print(f"Balance:     (could not fetch: {e.message})")

    if args.dry_run:
        print("\nAnchor plan (one sample per block):")
        seen = set()
        for j in jobs:
            if j["block"] in seen:
                continue
            seen.add(j["block"])
            sel = select_anchor_files(j, named, manifest, eng.max_refs)
            print(f"  {j['block']:10} {j['stem']:26} -> {sel}")
        print("\nDRY RUN — nothing generated.")
        return

    print("\nUploading anchors ...", flush=True)
    try:
        url_cache = {rel_name(p): eng.upload_file(p) for p in all_paths}
    except EngineError as e:
        print(f"ERROR uploading anchors: {e.message}")
        if e.status == 401:
            print("Your API key was rejected — open .env and check the key.")
            print("Get a key / check your account: https://wavespeed.ai/?ref=matrix")
        elif is_balance_error(e.message):
            print("Your WaveSpeed balance looks empty — top up: https://wavespeed.ai/?ref=matrix")
        sys.exit(1)
    print(f"Uploaded {len(url_cache)} reference images.", flush=True)

    for j in jobs:
        sel = select_anchor_files(j, named, manifest, eng.max_refs)
        j["image_urls"] = [url_cache[n] for n in sel if n in url_cache]

    # the skill folder may be the ONLY location the Claude Desktop app sandbox can
    # write to — all output stays inside it
    out_root = SKILL_DIR / "output"
    out_dir = out_root / args.character / KIND
    checkpoint = out_root / f"checkpoint_{args.character}_{KIND}.json"

    def progress(done, total, label):
        print(f"[{done}/{total}] {label}", flush=True)

    result = eng.batch_generate(jobs=jobs, output_dir=out_dir,
                                max_concurrent=args.max_concurrent,
                                progress_callback=progress, checkpoint_path=str(checkpoint))
    blocked = result.get("n_blocked", 0)
    extra = f" ({blocked} blocked by content filter — rerun those with --model seedream)" if blocked else ""
    print(f"\nDONE: {result['n_success']}/{result['n_total']} ok, "
          f"{result['n_failed']} failed{extra}, {result['duration_s']:.0f}s")
    if any(is_balance_error(f.get("error_message")) for f in result.get("failed", [])):
        print("Some shots failed because your WaveSpeed balance looks empty —")
        print("top up at https://wavespeed.ai/?ref=matrix and rerun (finished shots are skipped).")
    print(f"Output: {out_dir}")


if __name__ == "__main__":
    main()
