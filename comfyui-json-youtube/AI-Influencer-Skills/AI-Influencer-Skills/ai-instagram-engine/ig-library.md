# IG Library — the realism system (ported from the Dataset Prompt Library)

This is WHY the output reads as a real person's phone and not a photoshoot. Every
prompt you author is composed from this system. Scenes carry no identity and no
capture effects; capture realism comes from exactly ONE style recipe per shot.

## Contents
1. Composition formula
2. Style recipes (STYLE-01…07) — pick exactly one per shot
3. Realism toolkit + hard guards
4. GLAM + locks
5. Vibes (creative directions)
6. Variety rules for a batch of N
7. Proven scene catalog — SFW lifestyle (IG)
8. Proven scene catalog — Baddie SFW (BAD)

---

## 1. Composition formula (fixed order)

```
Show the character + [framing] + [angle] + [pose/attitude] + wearing [outfit]
+ [setting] + [lighting] + [STYLE recipe] (+ GLAM) (+ body lock if body visible)
+ Realistic skin with natural texture, visible pores and subtle imperfections.
```
One concrete value per slot — one outfit (color + item), one setting, one angle,
one pose, one lighting. Always start with `Show the character`.

## 2. Style recipes — the #1 believability lever (pick ONE per shot)

- **STYLE-01 dull-daylight** — `flat dull indoor daylight away from any direct sun, slightly underexposed, muted washed-out colors, faint sensor grain, imperfect white balance, casual slightly tilted framing, face sharp` — the ONLY allowed daylight: grey and boring. Bright/sunny/warm daylight is banned (see NO-SUN guard)
- **STYLE-02 night-selfie** — `low-light night front-camera selfie, warm screen glow, mild motion blur, faint sensor grain, slightly imperfect white balance — not studio; face sharp` — ONLY in cramped mundane settings (car, bed, small room); with a scenic backdrop it renders cinematic (NO-CINEMATIC-NIGHT guard)
- **STYLE-03 flash** — `harsh direct on-camera flash, hard shadows, bright specular highlights, flattened ambient, raw unedited look`
- **STYLE-04 lowq-candid** — `low-quality slightly blurry amateur snapshot, visible grain, casual off-center framing, face still readable`
- **STYLE-05 overcast-outdoor** — `flat grey overcast daylight, no sun anywhere, muted desaturated colors, slightly underexposed, faint sensor grain, candid tilted framing, face sharp` — the only way outdoor daytime shots stay real. (Golden hour was REMOVED from this library: tested twice live, even as a selfie with lens flare it always renders as an editorial photoshoot.)
- **STYLE-06 ultrawide** — `ultra-wide front camera held at arm's length, her arm visible at the edge of the frame, slight barrel distortion, subject a little smaller in frame` — the visible selfie arm is mandatory, otherwise it renders as a polished wide interior shot
- **STYLE-07 clinical-sharp** — `clean sharp focus, natural skin texture, no smoothing` (rare on IG — only for crisp detail shots)

## 3. Realism toolkit + hard guards

Sprinkle 1–2 extra cues max (tasteful imperfection, NOT destroyed): background blur ·
mild motion blur in background/movement · faint sensor grain in the shadows · slight
JPEG/phone-compression look · imperfect white balance · candid slightly-off framing.

**Hard guards:**
- **NO SUN. EVER.** The single strongest realism rule, proven across two live
  batches: every rejected "fake photoshoot" image was a sunny/golden/bright-warm
  scene; every accepted one was night, flash, lamp, neon, screen glow, or flat grey
  light. Direct sun makes the model render HDR-perfect editorial images and NO
  prompt cue (selfie arm, lens flare, blown highlights) can stop it. Allowed light:
  night + artificial (flash / lamp / neon / screen / club), dim indoor, flat grey
  overcast. Sunny scenes only if the user explicitly insists — warn them first.
- **WHO HOLDS THE CAMERA? Exactly TWO legal constructions** (everything else
  renders as a photoshoot — proven across three live batches):
  1. **MIRROR selfie** — phone visible in the mirror. The single most reliable
     realism anchor; never failed once. Make it ≥ half of every batch.
  2. **FRONT-CAM POV** — the image IS what her front camera sees: write
     `POV front-camera selfie shot from her phone, her arm reaching toward the
     camera and cut off at the frame edge`. The phone itself is NEVER visible.
  NEVER write just "taking a selfie" — the model then renders the ACT from a
  third-person camera (her holding the phone up, photographed from outside =
  editorial). NEVER use propped-phone/timer shots — the phone ends up visible
  inside its own photo (logical break, renders editorial). NEVER a phone in frame
  outside a mirror. An implied photographer ("walking toward the camera") is the
  same failure. Shot-by-a-friend only if the user asks: `shot on a friend's phone,
  slightly tilted candid framing, mild motion blur`.
- **NO CINEMATIC NIGHT — boring light is real, pretty light is fake.** Night shots
  are safe ONLY when cramped + mundane (car seat, bed close-up, small bathroom,
  hallway, elevator) or flash-lit. Scenic/atmospheric night compositions — city-light
  bokeh panoramas, TV glow as the only source, rain-streaked mood windows, one
  dramatic lamp in a big dark room — render as noise-free cinematic photography
  that no phone could produce (proven live, even with correct selfie POV).
- **Bright scenes need physical flaws.** Night/flash/lamp shots look real on their
  own physics; daylight gives the model license to render perfection. In any bright
  scene include at least 2 concrete degradation cues (blown-out highlights, sensor
  grain, tilted framing, imperfect white balance) — vibe words alone get ignored.
- **The face is ALWAYS sharp.** Blur / grain / motion only ever touch background or
  movement — never the face.
- **Banned words** (they flip the image into photoshoot mode): professional, DSLR,
  editorial, 8k, hyperrealistic, masterpiece, beautiful, stunning, supermodel,
  ethereal, cinematic (unless the user explicitly asks for a polished look).
- Every prompt ends with the skin clause:
  `Realistic skin with natural texture, visible pores and subtle imperfections.`

## 4. GLAM + locks

- **GLAM** (styling only, optional for baddie/elevated): `glossy lips, winged
  eyeliner and lashes, gold hoop earrings, long manicured nails, fine jewelry`.
  NEVER hair color / eye color / skin tone / body — that is identity, anchors only.
- **Body lock** (append when the body is visible — tight / cropped / midriff):
  `Do not make the breasts smaller or larger — keep the exact same breast size and
  body proportions as in the reference images.`
  The jobs-file path does NOT auto-append it — you add it per prompt.
- **Face hold** (optional on face-visible shots): `Keep the same face and eye color
  as in the reference images.`

## 5. Vibes (directions, not lists — interpret like a creator; default: baddie)

- **BADDIE** — confident, hot. Poses: hip out, chin-down-eyes-up, over-the-shoulder
  look-back, lip bite, smirk, power stance, hand in hair. Outfits: cropped + low-rise,
  bodycon mini, corset top, matching set, tiny shorts, baby tee. GLAM on. Light:
  phone flash, neon/club, warm screen glow, lamp glow, moody spotlight.
- **SOFT-GIRL / CLEAN-GIRL** — natural, cozy. Soft smile, candid. Oversized tee,
  knit, slip dress, athleisure. Dull flat daylight, lamp light, rainy-day window.
- **LUXURY / OLD-MONEY** — penthouse, marble bathroom, luxury car, rooftop, hotel.
  Satin slip dress, blazer, going-out mini. Warm moody light, low-angle grand rooms.
- **FITNESS** — gym mirror selfies, post-workout glow, athletic sets, leggings +
  sports bra. Clean overhead / daylight.
- **EGIRL / ALT** — tongue out, peace sign, choker, graphic crop top, LED/RGB room.
Unknown vibe named by the user (coquette, festival, old-money…)? Interpret it —
attitude + styling + setting/lighting lean.

## 6. Variety rules for a batch of N (what makes it read as a real feed)

- Spread framings (close-up / waist-up / full-body), settings (home / out / gym /
  night), lighting and time-of-day. Vary pose and attitude per shot.
- **At least half of every batch = mirror selfies** — across all live tests the
  mirror construction never produced a single fake-looking image.
- **Light balance: a default batch is 100% night / flash / lamp / dim indoor /
  flat-overcast.** No sun, no golden hour, no bright warm windows (NO-SUN guard).
  At most 1–2 dull-daylight (STYLE-01) or overcast (STYLE-05) shots per 12 for
  variety — grey and muted, never sunny.
- Rough content mix (tune to vibe): ~40% mirror/selfie · ~30% out-and-about ·
  ~15% lifestyle moment · ~15% going-out / night.
- **No repeats:** every prompt is a different scene+outfit+style combo — and check
  against the shots already delivered in this session.

---

## 7. Proven scene catalog — SFW lifestyle (adapt, recombine, re-dress freely)

Each line = scene seed + its proven style. Swap outfits/settings to fit the vibe;
keep the capture recipe logic. **Seeds that read third-person (café, street walk,
balcony, picnic, dress spin, festival, kitchen candid) MUST be converted to selfie
POV — mirror, front camera, or propped phone — per the WHO-HOLDS-THE-CAMERA guard.
Used verbatim they render as photoshoots.**

- **IG-01 bedroom mirror** (STYLE-01): waist-up bedroom mirror selfie, phone near her face, oversized white baby tee + low-rise blue jeans, white bedding and fairy lights behind, soft daylight.
- **IG-02 café window** (STYLE-05): front-camera selfie at an indoor café table by the window on a grey day, matcha latte in front of her, knit sweater, muted flat light.
- **IG-03 OOTD mirror** (STYLE-01): full-body outfit-of-the-day mirror selfie, cropped knit top + pleated mini skirt + sneakers, tidy bedroom.
- **IG-04 bathroom vanity** (STYLE-03): getting-ready mirror selfie at the vanity, makeup bottles on the counter, soft cropped hoodie, harsh bathroom light.
- **IG-06 gym mirror** (STYLE-01): gym mirror selfie, matching pastel pilates set, bright studio, clean overhead light.
- **IG-07 airplane** (STYLE-01 + bg blur): close-up selfie by the window seat, cozy oversized knit, blurred cabin.
- **IG-08 quick mirror** (STYLE-04): quick low-quality bedroom mirror selfie, baby tee + grey sweatpants, slightly messy room, mild blur and grain.
- **IG-09 candid laugh** (STYLE-04): laughing mid-conversation half-turned to camera, cropped tank top, friends out of frame, grainy candid.
- **IG-10 fit-check** (STYLE-04): casual full-body fit-check, zip-up hoodie + biker shorts, messy bedroom, blurry amateur shot.
- **IG-12 morning bed** (STYLE-04): cross-legged on the bed with a coffee mug, sleepy dim-morning vibe, curtains half closed, oversized shirt, grain.
- **IG-13 fitting room** (STYLE-04): fitting-room mirror selfie trying on a new outfit, cropped cardigan + jeans, clothes on hooks.
- **IG-14 night bathroom flash** (STYLE-03): night bathroom mirror selfie with direct phone flash, black going-out mini dress, hard shadows, white tiles.
- **IG-15 night car** (STYLE-02): night front-camera selfie in a car, warm screen-flash on her face, hoodie, streetlights blurred behind.
- **IG-16 concert** (STYLE-03): hands up in a dark crowd, flash-lit candid, cropped top, colorful stage lights, grainy energetic.
- **IG-17 neon street** (STYLE-02): night street selfie, neon signs glowing, satin mini dress, warm screen glow + grain.
- **IG-18 cozy night bed** (STYLE-02): lying back on her bed, warm bedside lamp + phone glow, thin-strap tank top, gentle grain.
- **IG-19 supermarket run** (STYLE-04): POV front-camera selfie in a supermarket aisle late at night, basket in the other hand, flat fluorescent light, grainy.
- **IG-20 elevator ride** (STYLE-03): elevator mirror selfie on the way up, flash against the metal wall, keys in the other hand.
- **IG-21 bathrobe counter** (STYLE-03): bathroom mirror selfie wrapped in a towel turban doing skincare, products on the counter, harsh bathroom light.
- **IG-22 hotel mirror** (STYLE-03): hotel room mirror selfie in the evening, flash against the big mirror, travel bag open on the bed behind. *(proven live)*
- **IG-23 dorm ultrawide** (STYLE-06): full-body fit-check on an ultra-wide lens, cropped tee + cargo pants, whole room visible.
- **IG-24 passenger seat grey day** (STYLE-05): POV front-camera selfie in the car passenger seat on a grey overcast day, seatbelt still on, parking lot through the window.
- **IG-25 café ultrawide** (STYLE-06): cozy dim café on ultra-wide, whole interior visible, oversized sweater, warm lamp light.
- **IG-26 stairwell flash** (STYLE-03): quick selfie in a plain stairwell on the way out, flash on, going-out fit, concrete steps behind.
- **IG-27 top-down bed** (STYLE-06): lying on the bed, top-down ultra-wide selfie, oversized graphic tee, room stretched at the edges.
- **IG-28 festival** (STYLE-04 + motion): in a festival crowd, candid and slightly blurry, crop top + denim shorts, colorful blurred lights.

## 8. Proven scene catalog — Baddie SFW

- **BAD-01 bedroom mirror** (STYLE-01): waist-up mirror selfie, hip pushed out, subtle smirk, cropped white tank + low-rise grey sweatpants, sliver of midriff, messy bed behind. *+ body lock*
- **BAD-02 power stance** (STYLE-01 + GLAM): full-body mirror selfie, power stance, weight on one hip, cropped top + low-rise mini skirt, gold hoops + long nails. *+ body lock*
- **BAD-03 chin-down close-up** (STYLE-01 + bg blur + GLAM): close-up selfie, chin dipped, eyes up at the lens, hair slicked back, glossy lips, fitted black tank.
- **BAD-04 gym mirror** (STYLE-01): gym mirror selfie, hand on hip, fitted sports bra + high-waist leggings, equipment behind. *+ body lock*
- **BAD-05 car backseat night** (STYLE-02): leaning back in the car backseat at night, half-lidded gaze up at the front camera, cropped hoodie + tiny shorts, streetlights moving past the window. *+ body lock*
- **BAD-06 over-the-shoulder** (STYLE-01): over-the-shoulder full-body mirror selfie, looking back with a smirk, hips angled, tight baby tee + low-rise jeans. *+ body lock*
- **BAD-09 candid attitude** (STYLE-04 + GLAM): laughing mid-candid half-turned with attitude, cropped top + cargo pants, hoops, grainy.
- **BAD-10 corset fit-check** (STYLE-04): confident fit-check, weight on one hip, black corset top + baggy low-rise jeans + small bag, messy bedroom. *+ body lock*
- **BAD-11 car sunglasses** (STYLE-04): quick car selfie with sunglasses and a smirk, fitted crop top, daylight through windows. *+ body lock*
- **BAD-12 side profile** (STYLE-04): side-profile full-body mirror selfie, chin up, fitted ribbed mini dress. *+ body lock*
- **BAD-13 lip-bite flash** (STYLE-03): night bathroom mirror selfie with flash, biting her lip, tight black crop top + tiny shorts, white tiles. *+ body lock*
- **BAD-15 going-out flash** (STYLE-03 + GLAM): going-out mirror selfie with flash, chin down eyes up, hip cocked, black bodycon mini + gold hoops. *+ body lock*
- **BAD-16 house party** (STYLE-03): flash-lit candid, both hands in her hair, corset top + low jeans, blurred people + string lights, grainy energetic.
- **BAD-17 night car** (STYLE-02): night car selfie, warm screen-flash, smirk, cropped oversized hoodie, blurred streetlights.
- **BAD-18 club bathroom** (STYLE-03 + GLAM): club bathroom mirror selfie with flash, chin down eyes up, glossy lips, black going-out top, dark tiles and dim bulbs behind. *+ body lock*
- **BAD-19 hallway mirror late** (STYLE-03): full-length hallway mirror selfie coming home late, hip out, smirk, fitted tank + low jeans, flash washing out the wall. *+ body lock*
- **BAD-20 lamp-lit bed** (STYLE-02 + bg blur): lying back on the bed at night, only the bedside lamp on, soft gaze up at the phone, oversized tee slipping off one shoulder. *+ body lock*
