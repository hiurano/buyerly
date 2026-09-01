# LTX 2.5 AI Influencer Test Prompts

Two reusable Image-to-Video prompts for testing facial animation and coordinated body movement with an AI influencer.

## Recommended test setup

- Mode: Image-to-Video
- Structure: Single shot
- Duration: 5 seconds
- Frame rate: 24 fps
- Prompt enhancement: Enabled
- Comparison rule: Reuse each prompt verbatim and keep all generation settings consistent between models.

## AIINF-I2V-01 — Expression Test

Use a controlled, straight-on headshot as the first frame.

```text
The locked straight-on studio headshot preserves the woman’s exact facial identity, centered head position, platinum-blonde hair, black hoodie, natural skin texture, soft frontal lighting, and plain gray background. She begins with the neutral expression shown in the reference, maintains direct eye contact, and makes one natural blink. Her eyebrows lift slightly and her eyes brighten as both corners of her closed mouth rise into a genuine smile; her lips then part smoothly to reveal her teeth before she holds the warm smile. Her cheeks lift naturally while her facial proportions, teeth, eyes, freckles, skin detail, hairstyle, lighting, and background remain stable. Keep the camera completely locked with no zoom, reframing, head turn, cut, dialogue, or added subject.
```

This test isolates facial identity drift, eye stability, blinking, mouth deformation, teeth generation, skin preservation, and the transition between two expressions.

## AIINF-I2V-02 — Body Movement Test

Use a high-angle, wide-angle bedroom selfie showing the initial pose, raised hand, and surrounding room.

```text
The high-angle handheld phone selfie preserves the woman’s exact identity, black hoodie, crouched forward-leaning pose, bedroom, illuminated night window, and existing wide-angle perspective. Beginning with her tongue out and her free hand extended in a peace sign, she retracts her tongue, closes her mouth into a playful smile, and maintains eye contact with the phone. At the same time, she gently straightens her torso within the crouch, rotates the peace-sign wrist inward, closes the two raised fingers naturally, and lifts that hand to brush a loose section of blonde hair behind her ear. Her hair and hoodie fabric respond subtly as she settles back into the original lean. The phone remains held overhead with mild authentic handheld drift while her face, fingers, limbs, body proportions, room geometry, window, lighting, and wide-angle distortion stay continuous in one unbroken shot with no cut, walking, dialogue, or added subject.
```

This test isolates coordinated torso, arm, wrist, finger, face, and hair movement while exposing hand-anatomy errors, body distortion, identity drift, and background or framing discontinuity.
