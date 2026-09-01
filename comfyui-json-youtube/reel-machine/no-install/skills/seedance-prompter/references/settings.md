# Seedance 2.0 — settings lock + bug→fix table

| Field | Value |
|---|---|
| model | `bytedance/seedance-2.0/text-to-video` (reference mode, no start image) |
| aspect_ratio | `9:16` |
| resolution | `480p` draft → `1080p` final (enum also allows 720p, 4k) |
| duration | 4–15s (hero ≈15, CTA ≈8) |
| generate_audio | `true` (native) |
| reference_images | your 4–6 character refs (face first); do NOT exceed ~6 |
| reference_audios | empty by default; a REAL human voice sample only (never TTS/ElevenLabs) |
| reference_videos | empty (a ref video dilutes identity + real-face risk) |
| enable_web_search | `false` |

Cost ≈ $0.60/clip. Draft cheap, finalize once.

## Bug → root cause → fix (in the prompt)
| Bug in the output | Cause | Fix |
|---|---|---|
| Speech too fast / crammed | too many words in the duration | CUT words; fewer words = the model stretches = slower |
| Speech choppy / word-by-word | per-second word chopping fed as the script | write flowing sentences; PACING: "natural connected speech, NOT one word at a time" |
| Long dead gaps (single-person CTA) | over-corrected pacing | "ONE continuous flowing sentence, no gaps"; negative: "long gaps, big pauses" |
| Changes pose / loses the phone | a lean / pose-change beat | POSE LOCK: one stable selfie pose, arm raised, phone always in hand; remove lean beats |
| Films a mirror not a selfie | "selfie" alone is ambiguous | "front camera, NO mirror, not a reflection"; negative: mirror/reflection |
| Walks out at the end | "she steps out" + selfie POV | she does NOT walk out; stays facing the lens; hold for the CTA |
| Invented junk (glowing displays, wall text) | model hallucinates a readout | "plain walls, NO digital display / no text"; negative: glowing digits/text |
| Face goes AI during motion | fast body motion | keep her fairly still; add any dynamic hook (glitch intro) in the EDIT, not the gen |
| Warm/grateful delivery on a cold reveal | tone not steered | explicit tone line ("cold, flat, matter-of-fact") + negative "warm or grateful delivery" |

## Draft QA (before the 1080p final)
Identity holds the whole clip? · mouth timing matches the script? · off-cam vs on-cam right? · one continuous
shot, no invented cuts? · pose held, phone in hand? · pacing has the real pauses (not rushed)? · tone right?
All pass → `--final`. Lip-sync slurs? keep the best visual, dub your real audio in edit, preserve the beats.
