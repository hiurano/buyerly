# MATRIX Dataset Builder Prompt Library V1

Use these prompts after Face Merge and Identity Swap.
Each prompt is built as a structured instruction block so the model has clear anchors:
Subject, Identity, Camera, Framing, Pose, Background, Wardrobe, Quality, Avoid.

Replace the wardrobe or location only when needed. Keep the identity and avoid lines stable.

---

## FACE IDENTITY SET

### DB_FACE_01_FRONT
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same face shape, eye spacing, nose, lips, hair color, hairstyle, skin tone, and overall identity.
Camera: front-facing portrait, eye-level camera, 70mm portrait lens look.
Framing: head and upper shoulders visible, full hair inside the frame, no crop on the head.
Pose: neutral relaxed expression, looking directly into the camera.
Background: clean white studio background, soft even lighting.
Wardrobe: simple fitted black top, no logos.
Quality: photorealistic, sharp facial detail, natural skin texture, balanced exposure.
Avoid: different person, changed hairstyle, heavy makeup, jewelry, sunglasses, distorted face, cropped head, extra limbs, text, watermark.

### DB_FACE_02_THREE_QUARTER_LEFT
Subject: same adult synthetic female character from the reference image.
Identity: preserve the exact same identity, hair, facial structure, skin tone, and body silhouette from the reference.
Camera: three-quarter left portrait, eye-level camera, realistic studio lens.
Framing: face, full head, hair, neck, and upper shoulders visible.
Pose: calm neutral expression, head slightly turned left, eyes toward camera.
Background: plain white studio background with soft shadow.
Wardrobe: simple fitted black top, no accessories.
Quality: photorealistic, high detail, consistent facial features, clean lighting.
Avoid: face drift, new haircut, exaggerated expression, glam makeup, jewelry, cropped hair, blurry eyes, text, watermark.

### DB_FACE_03_THREE_QUARTER_RIGHT
Subject: same adult synthetic female character from the reference image.
Identity: keep the same face, hair, skin tone, proportions, and recognizable identity.
Camera: three-quarter right portrait, eye-level camera, natural portrait perspective.
Framing: full head and hair visible, shoulders included, clean portrait crop.
Pose: relaxed neutral face, head slightly turned right, eyes toward camera.
Background: plain white studio background, soft even lighting.
Wardrobe: simple fitted black top, no logos or patterns.
Quality: photorealistic, sharp eyes, natural skin, clean details.
Avoid: different identity, changed hair length, strong makeup, jewelry, face asymmetry, cropped head, text, watermark.

### DB_FACE_04_SIDE_LEFT
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same hairstyle, hair color, face structure, skin tone, and body silhouette.
Camera: clean left side profile portrait, eye-level camera.
Framing: full head and hair visible, neck and shoulders included.
Pose: neutral expression, relaxed posture, side profile.
Background: clean white studio background.
Wardrobe: simple fitted black top.
Quality: photorealistic, sharp profile details, natural lighting, realistic skin texture.
Avoid: changed nose shape, changed chin shape, new hairstyle, jewelry, cropped hair, blurry profile, text, watermark.

### DB_FACE_05_SIDE_RIGHT
Subject: same adult synthetic female character from the reference image.
Identity: keep the same person, same hair, same facial structure, same skin tone, same body silhouette.
Camera: clean right side profile portrait, eye-level camera.
Framing: full head and hair visible, neck and shoulders included.
Pose: neutral expression, relaxed posture, side profile.
Background: plain white studio background, soft lighting.
Wardrobe: simple fitted black top.
Quality: photorealistic, clean profile, sharp facial detail, natural skin.
Avoid: identity shift, changed hairstyle, accessories, cropped head, distorted profile, text, watermark.

### DB_FACE_06_BEAUTY_CHECK
Subject: same adult synthetic female character from the reference image.
Identity: preserve the exact same identity, facial proportions, hair, skin tone, and body silhouette.
Camera: close portrait, eye-level camera, realistic beauty test image.
Framing: face and full hair visible, shoulders lightly visible, clean centered composition.
Pose: very slight natural smile, direct eye contact.
Background: light gray studio background, soft diffused lighting.
Wardrobe: simple neutral top.
Quality: photorealistic, crisp eyes, realistic skin texture, no over-smoothing, no plastic skin.
Avoid: different person, overdone makeup, beauty filter, jewelry, sunglasses, cropped hair, text, watermark.

---

## BODY TURNAROUND SET

### DB_BODY_01_FRONT
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same face, hair, skin tone, body silhouette, height impression, and proportions from the reference.
Camera: full-body front view, eye-level camera, neutral studio perspective.
Framing: entire body visible from head to feet, full hair visible, centered composition.
Pose: natural standing pose, arms relaxed, balanced posture.
Background: clean white studio background, soft shadow under feet.
Wardrobe: simple fitted black top and fitted dark leggings, no logos.
Quality: photorealistic, realistic anatomy, consistent identity, clean dataset reference image.
Avoid: body shape drift, changed face, changed hair, cropped feet, cropped head, extreme pose, extra fingers, text, watermark.

### DB_BODY_02_BACK
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same hairstyle, hair color, skin tone, body silhouette, and proportions from the reference.
Camera: full-body back view, eye-level camera, neutral studio perspective.
Framing: entire body visible from head to feet, hair fully visible, centered composition.
Pose: natural standing pose, arms relaxed at sides.
Background: clean white studio background, soft even lighting.
Wardrobe: simple fitted black top and fitted dark leggings, no logos.
Quality: photorealistic, realistic posture, clean body reference, consistent body shape.
Avoid: face visible from front, changed hairstyle, cropped feet, cropped head, twisted body, text, watermark.

### DB_BODY_03_LEFT_SIDE
Subject: same adult synthetic female character from the reference image.
Identity: keep the same hair, skin tone, body silhouette, and proportions.
Camera: full-body left side view, eye-level camera.
Framing: full body from head to feet, full hair visible.
Pose: natural standing pose, arms relaxed, clean side profile.
Background: plain white studio background with soft lighting.
Wardrobe: simple fitted black top and fitted dark leggings.
Quality: photorealistic, realistic anatomy, sharp full-body reference.
Avoid: front-facing angle, changed body shape, cropped head, cropped feet, distorted limbs, text, watermark.

### DB_BODY_04_RIGHT_SIDE
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same hair, skin tone, body silhouette, and proportions.
Camera: full-body right side view, eye-level camera.
Framing: full body from head to feet, full hair visible.
Pose: natural standing pose, arms relaxed, clean side profile.
Background: clean white studio background.
Wardrobe: simple fitted black top and fitted dark leggings.
Quality: photorealistic, realistic proportions, clear body reference.
Avoid: front-facing angle, identity drift, changed hairstyle, cropped feet, distorted limbs, text, watermark.

### DB_BODY_05_FRONT_LEFT_45
Subject: same adult synthetic female character from the reference image.
Identity: preserve face, hair, skin tone, body silhouette, and proportions from the reference.
Camera: full-body three-quarter front left view, eye-level camera.
Framing: entire body visible from head to feet, centered.
Pose: relaxed standing pose, slight weight shift, natural arms.
Background: clean white studio background, soft even lighting.
Wardrobe: simple fitted black top and fitted dark leggings.
Quality: photorealistic, consistent face and body, clean dataset image.
Avoid: changed identity, changed body shape, cropped head, cropped feet, exaggerated pose, text, watermark.

### DB_BODY_06_FRONT_RIGHT_45
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same face, hair, skin tone, body silhouette, and proportions.
Camera: full-body three-quarter front right view, eye-level camera.
Framing: entire body visible from head to feet, full hair visible.
Pose: relaxed standing pose, slight weight shift, natural arms.
Background: clean white studio background, soft shadow under feet.
Wardrobe: simple fitted black top and fitted dark leggings.
Quality: photorealistic, realistic anatomy, consistent character sheet look.
Avoid: face drift, body drift, cropped feet, cropped hair, extreme pose, text, watermark.

### DB_BODY_07_BACK_LEFT_45
Subject: same adult synthetic female character from the reference image.
Identity: preserve hairstyle, hair color, skin tone, body silhouette, and proportions.
Camera: full-body three-quarter back left view, eye-level camera.
Framing: full body from head to feet, hair fully visible.
Pose: relaxed standing pose, arms natural, shoulders turned away from camera.
Background: plain white studio background.
Wardrobe: simple fitted black top and fitted dark leggings.
Quality: photorealistic, clean body reference, realistic posture.
Avoid: front view, changed hairstyle, changed body shape, cropped feet, distorted posture, text, watermark.

### DB_BODY_08_BACK_RIGHT_45
Subject: same adult synthetic female character from the reference image.
Identity: preserve hairstyle, skin tone, body silhouette, and proportions from the reference.
Camera: full-body three-quarter back right view, eye-level camera.
Framing: entire body visible from head to feet, centered composition.
Pose: relaxed standing pose, arms natural, shoulders turned away from camera.
Background: clean white studio background, soft even lighting.
Wardrobe: simple fitted black top and fitted dark leggings.
Quality: photorealistic, realistic anatomy, clean dataset reference.
Avoid: front view, identity drift, cropped head, cropped feet, twisted limbs, text, watermark.

---

## STUDIO DATASET SET

### DB_STUDIO_01_BLACK_TSHIRT
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same face, hair, skin tone, body silhouette, and proportions.
Camera: medium full-body studio shot, eye-level camera.
Framing: body visible from head to below knees, full hair visible.
Pose: relaxed standing pose, natural expression.
Background: light gray studio background, soft diffused lighting.
Wardrobe: plain fitted black t-shirt and blue jeans, no logo.
Quality: photorealistic, clean fashion catalog lighting, sharp details.
Avoid: changed identity, changed body shape, heavy makeup, jewelry, distorted hands, text, watermark.

### DB_STUDIO_02_WHITE_TOP
Subject: same adult synthetic female character from the reference image.
Identity: keep the same identity, hair, facial features, skin tone, and body proportions.
Camera: upper-body studio shot, eye-level camera.
Framing: head, full hair, torso, and arms visible.
Pose: relaxed posture, neutral expression, direct eye contact.
Background: clean white studio background.
Wardrobe: simple fitted white top and dark pants, no logos.
Quality: photorealistic, natural skin, sharp face, balanced lighting.
Avoid: different person, changed hair, accessories, heavy makeup, cropped head, text, watermark.

### DB_STUDIO_03_SPORTSWEAR
Subject: same adult synthetic female character from the reference image.
Identity: preserve exact identity, hairstyle, skin tone, body silhouette, and proportions.
Camera: full-body studio fitness catalog shot, eye-level camera.
Framing: full body visible from head to feet, full hair visible.
Pose: natural standing pose, relaxed shoulders, no action pose.
Background: clean light gray studio background.
Wardrobe: simple fitted sports top and high-waist leggings, no logos.
Quality: photorealistic, clean commercial lighting, realistic anatomy.
Avoid: changed body shape, exaggerated pose, cropped feet, distorted hands, text, watermark.

### DB_STUDIO_04_CASUAL_DRESS
Subject: same adult synthetic female character from the reference image.
Identity: preserve same face, hair, skin tone, body silhouette, and proportions.
Camera: full-body studio fashion shot, eye-level camera.
Framing: full body visible, full hair visible, centered.
Pose: relaxed standing pose, slight natural smile.
Background: warm neutral studio background, soft light.
Wardrobe: simple fitted casual dress, clean solid color, no pattern.
Quality: photorealistic, realistic fabric, sharp facial details.
Avoid: identity drift, body drift, heavy styling, jewelry, cropped head, cropped feet, text, watermark.

### DB_STUDIO_05_DENIM_LOOK
Subject: same adult synthetic female character from the reference image.
Identity: keep the same face, hair, skin tone, body silhouette, and proportions.
Camera: three-quarter full-body studio shot, eye-level camera.
Framing: full body visible from head to feet, full hair visible.
Pose: relaxed pose with one hand near hip, natural expression.
Background: plain light gray studio background.
Wardrobe: fitted black tank top, blue jeans, simple sneakers, no logos.
Quality: photorealistic, clean dataset image, realistic hands and face.
Avoid: changed person, changed hair, exaggerated pose, cropped feet, extra fingers, text, watermark.

### DB_STUDIO_06_NEUTRAL_BODYSUIT
Subject: same adult synthetic female character from the reference image.
Identity: preserve same identity, hairstyle, body silhouette, skin tone, and proportions.
Camera: full-body studio reference shot, eye-level camera.
Framing: full body visible from head to feet, centered character sheet composition.
Pose: neutral standing pose, arms relaxed, feet naturally placed.
Background: white studio background, soft even lighting.
Wardrobe: simple neutral fitted bodysuit, non-explicit, no logos, no accessories.
Quality: photorealistic, realistic anatomy, clean body shape reference.
Avoid: nudity, sexual pose, changed body shape, cropped feet, distorted anatomy, text, watermark.

---

## SELFIE AND SOCIAL SET

### DB_SELFIE_01_PHONE_FRONT
Subject: same adult synthetic female character from the reference image.
Identity: preserve face, hair, skin tone, body silhouette, and proportions.
Camera: realistic smartphone selfie, front camera look, slight wide-angle perspective.
Framing: upper body visible, full head and hair inside the frame.
Pose: relaxed casual selfie, natural slight smile, looking at camera.
Background: clean modern bedroom interior, natural daylight.
Wardrobe: simple fitted black top, no logos.
Quality: photorealistic, natural phone photo texture, realistic skin, sharp eyes.
Avoid: different identity, changed hair, beauty filter, warped phone perspective, cropped head, text, watermark.

### DB_SELFIE_02_HIGH_ANGLE
Subject: same adult synthetic female character from the reference image.
Identity: keep the same face, hair, skin tone, body silhouette, and proportions.
Camera: high-angle smartphone selfie, realistic handheld framing.
Framing: head, full hair, upper body, and some background visible.
Pose: relaxed expression, natural shoulders, looking into phone camera.
Background: bright indoor apartment background, soft daylight.
Wardrobe: simple fitted casual top.
Quality: photorealistic, natural phone image, consistent identity, realistic lighting.
Avoid: face drift, changed hairstyle, excessive makeup, distorted body, cropped hair, text, watermark.

### DB_SELFIE_03_MIRROR
Subject: same adult synthetic female character from the reference image.
Identity: preserve exact identity, hair, skin tone, body silhouette, and proportions.
Camera: realistic mirror selfie, phone visible in one hand, natural indoor lighting.
Framing: body visible from head to mid-thigh, full hair visible.
Pose: relaxed standing pose, casual expression.
Background: clean bedroom mirror setup, realistic interior.
Wardrobe: fitted black top and blue jeans, no logos.
Quality: photorealistic, realistic mirror reflection, clean hands, consistent face.
Avoid: wrong reflection, extra phone, changed face, changed body shape, cropped head, text, watermark.

### DB_SELFIE_04_COUCH
Subject: same adult synthetic female character from the reference image.
Identity: keep the same face, hairstyle, skin tone, body silhouette, and proportions.
Camera: casual smartphone photo, eye-level seated angle.
Framing: upper body and face visible, full hair visible.
Pose: seated on couch, relaxed posture, natural expression.
Background: modern living room, soft daylight, realistic depth.
Wardrobe: simple fitted casual top and lounge pants.
Quality: photorealistic, natural candid image, realistic skin and hair.
Avoid: identity shift, changed hair, heavy makeup, distorted hands, cropped head, text, watermark.

### DB_SELFIE_05_WINDOW_LIGHT
Subject: same adult synthetic female character from the reference image.
Identity: preserve same identity, hair, skin tone, body silhouette, and proportions.
Camera: realistic indoor portrait photo, soft window light.
Framing: upper body portrait, full hair visible, face sharp.
Pose: standing near window, relaxed expression, looking at camera.
Background: bright apartment interior, clean and natural.
Wardrobe: simple fitted light-colored top.
Quality: photorealistic, soft natural lighting, sharp facial details.
Avoid: changed identity, changed hairstyle, overexposed face, cropped hair, text, watermark.

### DB_SELFIE_06_CASUAL_FULL_BODY
Subject: same adult synthetic female character from the reference image.
Identity: preserve same face, hair, skin tone, body silhouette, and proportions.
Camera: realistic smartphone full-body photo, casual indoor angle.
Framing: full body visible from head to feet, full hair visible.
Pose: relaxed standing pose, natural expression.
Background: clean apartment hallway or bedroom, natural lighting.
Wardrobe: fitted black top, blue jeans, simple shoes.
Quality: photorealistic, consistent identity, realistic phone photo look.
Avoid: changed body shape, changed face, cropped feet, distorted legs, text, watermark.

---

## LIFESTYLE DATASET SET

### DB_LIFE_01_CAFE
Subject: same adult synthetic female character from the reference image.
Identity: preserve exact face, hair, skin tone, body silhouette, and proportions.
Camera: realistic lifestyle portrait, eye-level camera.
Framing: upper body visible, full hair visible.
Pose: seated at a cafe table, relaxed natural smile.
Background: modern cafe interior, soft daylight, realistic depth of field.
Wardrobe: fitted casual top, clean minimal styling.
Quality: photorealistic, natural candid look, sharp face, realistic lighting.
Avoid: different person, changed hairstyle, heavy makeup, jewelry overload, text, watermark.

### DB_LIFE_02_STREET
Subject: same adult synthetic female character from the reference image.
Identity: keep the same identity, hair, skin tone, body silhouette, and proportions.
Camera: realistic street portrait, eye-level camera, natural lens perspective.
Framing: body visible from head to knees, full hair visible.
Pose: walking naturally, relaxed expression.
Background: clean city street, daylight, shallow depth of field.
Wardrobe: fitted casual outfit, simple colors, no logos.
Quality: photorealistic, realistic motion, consistent face and body.
Avoid: face drift, changed hair, blurred face, distorted hands, text, watermark.

### DB_LIFE_03_GYM
Subject: same adult synthetic female character from the reference image.
Identity: preserve same face, hair, skin tone, body silhouette, and proportions.
Camera: realistic gym lifestyle photo, eye-level camera.
Framing: full body visible, full hair visible.
Pose: standing naturally in a gym environment, no exercise action.
Background: clean modern gym, natural realistic lighting.
Wardrobe: fitted sports top and leggings, no logos.
Quality: photorealistic, realistic anatomy, consistent identity, sharp details.
Avoid: extreme pose, changed body shape, different face, cropped feet, text, watermark.

### DB_LIFE_04_BEDROOM_CASUAL
Subject: same adult synthetic female character from the reference image.
Identity: preserve exact identity, hair, skin tone, body silhouette, and proportions.
Camera: realistic indoor lifestyle photo, natural phone-camera feel.
Framing: upper body visible, full head and hair visible.
Pose: relaxed seated pose on bed, casual expression.
Background: clean bedroom, daylight, realistic interior.
Wardrobe: simple fitted lounge outfit, non-explicit.
Quality: photorealistic, natural skin, consistent face, realistic lighting.
Avoid: sexual pose, nudity, changed identity, changed hair, distorted hands, text, watermark.

### DB_LIFE_05_BATHROOM_MIRROR
Subject: same adult synthetic female character from the reference image.
Identity: keep same face, hair, skin tone, body silhouette, and proportions.
Camera: realistic bathroom mirror photo, phone visible, clean reflection.
Framing: body visible from head to mid-thigh, full hair visible.
Pose: relaxed mirror selfie pose, natural expression.
Background: clean modern bathroom, soft indoor lighting.
Wardrobe: fitted casual top and shorts, no logos.
Quality: photorealistic, realistic mirror lighting, consistent identity.
Avoid: wrong reflection, duplicate body, changed face, warped phone, cropped head, text, watermark.

### DB_LIFE_06_OUTDOOR_DAYLIGHT
Subject: same adult synthetic female character from the reference image.
Identity: preserve same face, hairstyle, skin tone, body silhouette, and proportions.
Camera: realistic outdoor portrait, eye-level camera, natural daylight.
Framing: upper body visible, full hair visible.
Pose: relaxed standing pose, slight natural smile.
Background: simple outdoor walkway or garden, soft background blur.
Wardrobe: fitted casual top, simple clean styling.
Quality: photorealistic, natural lighting, sharp eyes, realistic skin texture.
Avoid: different person, changed hairstyle, heavy makeup, sunglasses, text, watermark.

---

## QUALITY CONTROL SET

### DB_QC_01_IDENTITY_LOCK
Subject: same adult synthetic female character from the reference image.
Identity: preserve the exact same identity with no face drift, no hairstyle drift, no skin tone drift, and no body silhouette drift.
Camera: simple front-facing portrait, eye-level camera.
Framing: head, full hair, neck, and shoulders visible.
Pose: neutral expression, direct eye contact.
Background: white studio background, even lighting.
Wardrobe: simple black top.
Quality: clean identity check image, photorealistic, sharp facial features.
Avoid: different person, changed face, changed hair, makeup change, cropped hair, text, watermark.

### DB_QC_02_FULL_BODY_LOCK
Subject: same adult synthetic female character from the reference image.
Identity: preserve the same face, hair, skin tone, body silhouette, height impression, and proportions.
Camera: full-body front view, eye-level camera.
Framing: entire body visible from head to feet, centered.
Pose: neutral standing pose, arms relaxed.
Background: white studio background.
Wardrobe: simple fitted black top and dark leggings.
Quality: clean full-body validation image, photorealistic, realistic anatomy.
Avoid: body shape drift, face drift, cropped feet, cropped head, distorted limbs, text, watermark.

### DB_QC_03_HANDS_AND_FACE
Subject: same adult synthetic female character from the reference image.
Identity: keep the same face, hair, skin tone, body silhouette, and proportions.
Camera: medium shot, eye-level camera.
Framing: face, full hair, torso, and both hands visible.
Pose: relaxed standing pose with both hands naturally visible.
Background: light gray studio background.
Wardrobe: simple fitted casual top.
Quality: photorealistic, sharp face, realistic hands, natural skin texture.
Avoid: extra fingers, missing fingers, distorted hands, changed identity, cropped hands, text, watermark.

### DB_QC_04_REALISM_CHECK
Subject: same adult synthetic female character from the reference image.
Identity: preserve exact face, hair, skin tone, body silhouette, and proportions.
Camera: realistic candid indoor portrait, natural lens perspective.
Framing: upper body visible, full hair visible.
Pose: relaxed natural expression, looking at camera.
Background: simple apartment interior, natural daylight.
Wardrobe: simple fitted casual outfit.
Quality: photorealistic, natural skin texture, realistic lighting, no AI-gloss, no plastic look.
Avoid: over-smoothed skin, unreal eyes, changed identity, changed hair, distorted hands, text, watermark.
