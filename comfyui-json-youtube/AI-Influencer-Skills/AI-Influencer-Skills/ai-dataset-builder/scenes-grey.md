# Dataset — default scene set (grey studio)

Identity (face, hair, eyes, body, skin) comes ONLY from the anchor images — never
written into a prompt. The bust/body lock preserves whatever the anchors show, it
never forces a size. FACE shots are portraits (face + upper body), not tight crops.

These shots use "the same outfit as in the reference images" on purpose: the anchors
always exist in this skill, and matching them minimizes drift. For a uniform rotation
in one canonical outfit, swap the outfit phrase (e.g. "a black fitted ribbed
short-sleeve t-shirt and blue straight-leg jeans") — keep everything else identical.

3 blocks, 13 shots. White-background variants live in `scenes-white.md`. You can add
or edit scenes freely — `generate.py` reads whatever is present (stem line, then a
`>` prompt line).

---

## BLOCK 1 — FACE (identity portraits, grey studio)

face_01_front
> Show the character's face from a frontal angle, neutral expression, natural skin texture with visible pores and no makeup, the entire head and hair fully visible, wearing the same outfit as in the reference images, against a soft grey studio background. Keep the same eye color as in the reference images. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images.

face_02_34_left
> Show the character's face from a three-quarter front left angle, neutral expression, natural skin texture with visible pores and no makeup, the entire head and hair fully visible, wearing the same outfit as in the reference images, against a soft grey studio background. Keep the same eye color as in the reference images. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images.

face_03_34_right
> Show the character's face from a three-quarter front right angle, neutral expression, natural skin texture with visible pores and no makeup, the entire head and hair fully visible, wearing the same outfit as in the reference images, against a soft grey studio background. Keep the same eye color as in the reference images. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images.

face_04_closeup
> Show a close-up portrait of the character's face and shoulders from a frontal angle, neutral expression, looking at the camera, natural skin texture with visible pores and no makeup, wearing the same outfit as in the reference images, against a soft grey studio background. Keep the same eye color as in the reference images.

## BLOCK 2 — EMOTIONS (one expression grid)

emotions_grid_01
> Create a 3x3 grid of nine head-and-shoulders portraits of the same character with consistent lighting and framing, each panel a different expression: (1) soft natural smile, (2) playful tongue out, (3) neutral calm look, (4) lip bite, (5) surprised open mouth, (6) shy glance down, (7) raised brow smirk, (8) puffed cheeks, (9) closed-eye grin. Smartphone candid style with natural skin texture. Keep the same face and eye color as in the reference images.

## BLOCK 3 — 360° ROTATION (consistency-locked, grey studio)

> Generate all 8 in one batch for best consistency.

r360_01_front
> Show the character's full body from a frontal angle, standing straight with arms relaxed at her sides, the entire head and hair fully visible, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_02_34_front_left
> Show the character's full body from a three-quarter front left angle, standing straight with arms relaxed at her sides, the entire head and hair fully visible, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_03_34_front_right
> Show the character's full body from a three-quarter front right angle, standing straight with arms relaxed at her sides, the entire head and hair fully visible, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_04_profile_left
> Show the character's full body from a left side profile angle, standing straight with arms relaxed at her sides, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_05_profile_right
> Show the character's full body from a right side profile angle, standing straight with arms relaxed at her sides, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_06_34_back_left
> Show the character's full body from a three-quarter back left angle, standing straight with arms relaxed at her sides, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_07_34_back_right
> Show the character's full body from a three-quarter back right angle, standing straight with arms relaxed at her sides, wearing the same outfit as in the reference images, against a soft grey studio background. Do not make the breasts smaller or larger — keep the exact same breast size and body proportions as in the reference images. Render the outfit exactly as in the references — do not restyle, recolor or resize it.

r360_08_back
> Show the character's full body from a back view angle, standing straight, the full head and long hair visible from behind, wearing the same outfit as in the reference images, against a soft grey studio background. Render the outfit exactly as in the references — do not restyle, recolor or resize it.
