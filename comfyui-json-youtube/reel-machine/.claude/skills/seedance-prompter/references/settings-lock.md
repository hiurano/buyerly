# Seedance 2.0 — settings lock + bug→fix table

## Settings (hardcoded in `wavespeed/ws-video.sh` — here for reference)
| Field | Value |
|---|---|
| model | `bytedance/seedance-2.0/text-to-video` (reference mode, no start image) |
| aspect_ratio | `9:16` |
| resolution | `480p` draft → **`720p` final** → Topaz-upscale to 1080×1920 (enum also allows 1080p, 4k — skip them, see cost ladder) |
| duration | 4–15s (hero ≈15, CTA ≈8) |
| generate_audio | `true` (native) |
| reference_images | your 4–6 character refs (face first); do NOT exceed ~6 — extra/near-dup refs dilute identity |
| reference_audios | **empty** — native voice, steered in the prompt. Ref audios make the voice come out different each run (tested). Never TTS/ElevenLabs as a ref. |
| reference_videos | empty (a ref video transfers motion AND look → dilutes identity + real-face risk) |
| enable_web_search | `false` |

## The cost ladder (the trick that keeps this cheap at volume)
1. **Draft @480p** (~$1.50 / 15s run) — 2–4 runs until identity/pacing/pose/tone lock.
2. **ONE final @720p** (~$3 / 15s run) — same package, same settings, only the resolution changes.
3. **Upscale to 1080×1920 with Topaz** (Video AI, one-time license) — a 720p+Topaz final is visually on par
   with a native 1080p/4k gen at a fraction of the price. NEVER iterate at 1080p/4k.

## Voice
- **Default = native Seedance audio**, steered in the prompt ("sweet cute young female voice" / "cold, confident").
- **Cross-reel voice consistency:** don't chase it with reference audios — keep the best visual take and
  **dub the locked voice in the edit** (preserve the beat timing). Reference audios = inconsistent output.

## Bug → root cause → fix (in the prompt)
| Bug in the output | Cause | Fix |
|---|---|---|
| Speech too fast / crammed | too many words in the duration | CUT words; fewer words = the model stretches = slower |
| Speech choppy / word-by-word | per-second word chopping fed as the script | write flowing sentences; PACING: "natural connected speech, NOT one word at a time" |
| Short line sounds robotic/AI | isolated fragments ("you didn't") read the most AI | connect the fragment into the sentence ("…but you didn't") + a soft/natural delivery note |
| Long dead gaps (single-person CTA) | over-corrected pacing | "ONE continuous flowing sentence, no gaps"; negative: "long gaps, big pauses" |
| Changes pose / loses the phone | a lean / pose-change beat | POSE LOCK: one stable selfie pose, arm raised, phone always in hand; remove lean beats |
| Two arms / doubled hands | camera holder ambiguous | decide ONE camera POV from the reference (whose arm is in frame) and name only that holder |
| Films a mirror not a selfie | "selfie" alone is ambiguous | "front camera, NO mirror, not a reflection"; negative: mirror/reflection |
| Clone looks flat / not like the ref | the LENS wasn't described | describe the lens too: ultra-wide fisheye selfie distortion, dark rounded vignette border — the lens is part of the look |
| Outfit drifts / mixes | outfit in face-refs fights the prompt | outfit comes from the PROMPT (+ 1–2 dedicated outfit refs); keep face-refs outfit-neutral |
| Walks out at the end | "she steps out" + selfie POV | she does NOT walk out; stays facing the lens; hold for the CTA |
| Invented junk (glowing displays, wall text) | model hallucinates a readout | "plain walls, NO digital display / no text"; negative: glowing digits/text |
| Face goes AI during motion | fast body motion (walk-ins are the worst) | keep her fairly still; no walk-in openings; add any dynamic hook (glitch intro) in the EDIT, not the gen |
| Warm/grateful delivery on a cold reveal | tone not steered | explicit tone line ("cold, flat, matter-of-fact") + negative "warm or grateful delivery" |

## Draft QA (before the 720p final)
Identity holds the whole clip? · mouth timing matches the script? · off-cam vs on-cam right? · one continuous
shot, no invented cuts? · pose held, phone in hand? · pacing has the real pauses (not rushed)? · tone right?
All pass → `--final`. Lip-sync slurs? keep the best visual, dub your real audio in edit, preserve the beats.

## Advanced (off-menu)
- A START IMAGE flips Seedance into image-to-video/keyframe mode: strongest pose/scene lock, but it HIDES the
  reference images + audio and looks crisper/posed. Only for a shot that needs an exact opening pose.
- Seedance 2.0 **Mini** is fine for cheap vibe drafts but has weak lip-sync/timing — never use Mini for the final.
