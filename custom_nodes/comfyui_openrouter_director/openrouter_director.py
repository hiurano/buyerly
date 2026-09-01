import json
import urllib.request
import urllib.error
import re

class OpenRouterCreativeDirector:
    """
    OpenRouter AI Creative Director:
    Generates 4-scene UGC scripts, image generation prompts, and video motion/audio prompts
    using LLMs (Claude 3.5 Sonnet, Gemini 2.0 Flash, GPT-4o) via OpenRouter API.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "openrouter_api_key": ("STRING", {
                    "multiline": False,
                    "default": "",
                    "placeholder": "sk-or-v1-..."
                }),
                "model": ([
                    "google/gemini-2.0-flash-001",
                    "anthropic/claude-3.5-sonnet",
                    "openai/gpt-4o-mini",
                    "openai/gpt-4o",
                    "deepseek/deepseek-chat"
                ], {"default": "google/gemini-2.0-flash-001"}),
                "campaign_topic": ("STRING", {
                    "multiline": True,
                    "default": "Germany iGaming / gambling: Exposing fake Instagram rich girls and revealing the real no-deposit app that financed everything"
                }),
                "character_archetype": ("STRING", {
                    "multiline": False,
                    "default": "24yo natural blonde German girl"
                }),
                "target_geo": ([
                    "Germany (DE)",
                    "Netherlands (NL)",
                    "Austria (AT)",
                    "Switzerland (CH)",
                    "English (Global)"
                ], {"default": "Germany (DE)"}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            }
        }

    RETURN_TYPES = (
        "STRING", "STRING",
        "STRING", "STRING",
        "STRING", "STRING",
        "STRING", "STRING",
        "STRING"
    )
    RETURN_NAMES = (
        "scene1_image_prompt", "scene1_video_prompt",
        "scene2_image_prompt", "scene2_video_prompt",
        "scene3_image_prompt", "scene3_video_prompt",
        "scene4_image_prompt", "scene4_video_prompt",
        "full_script_markdown"
    )
    FUNCTION = "generate_creative_script"
    CATEGORY = "MatrixLab/CreativeDirector"

    def generate_creative_script(self, openrouter_api_key, model, campaign_topic, character_archetype, target_geo, seed):
        # Fallback default prompts if no API key or offline
        fallback_data = {
            "scene1_image_prompt": f"candid raw smartphone selfie, {character_archetype} on a luxury yacht deck, bright sunny day, mediterranean blue sea and coastline in background, wearing casual white linen shirt, wind in hair, looking directly into camera with confident slight smile. Direct harsh sunlight, authentic skin texture with visible pores, 35mm mobile camera perspective, film grain, unposed UGC travel photo",
            "scene1_video_prompt": 'The blonde woman speaks naturally to the camera in a selfie video on the yacht deck, gentle breeze moving her hair, expressive facial expressions while talking, one natural blink, holding the camera steady. 24fps real-time motion, natural speech movement. Audio: The girl speaks clearly in German with natural energy: "Wie viele Mädels auf Instagram flexen bitte mit teuren Yachten..." Ambient gentle sea breeze and engine hum sound.',
            "scene2_image_prompt": f"candid raw smartphone photo, {character_archetype} sitting at a table in a high-end luxury restaurant at night, warm dim ambient candlelight, bokeh of blurred restaurant background, wearing elegant dark top, holding a cocktail glass, looking into camera, authentic expression. Flash photography, natural skin texture with pores, mobile UGC lifestyle photo",
            "scene2_video_prompt": 'The woman speaks directly to the camera in the restaurant, holding her cocktail glass, natural talking mouth movement, subtle head gestures and warm eye contact, ambient candlelight flickering. Smooth 24fps real-time motion. Audio: The girl speaks in German with an expressive tone: "...und verdienen am Ende nur an euren Kursen, ohne euch wirklich zu helfen!" Dim ambient restaurant chatter sound.',
            "scene3_image_prompt": f"candid raw smartphone photo, {character_archetype} in cozy grey oversized hoodie sitting on couch at home, holding up her smartphone directly toward the camera showing her phone screen to the viewer. The phone screen is a solid bright pure green screen #00FF00 with small tracking markers for chroma keying. Warm cozy room lighting, authentic skin texture with visible pores, looking at camera with excited happy smile, mobile UGC photo",
            "scene3_video_prompt": 'The woman in the grey hoodie speaks with excitement directly to the camera, holding her smartphone with the solid bright green screen steady in front of her, joyful smiling facial expression, natural talking mouth movement. Smooth 24fps real-time motion, smartphone screen stays bright solid green. Audio: The girl speaks in German with an excited upbeat tone: "Ich zeige euch jetzt die echte App, mit der ich mir das finanziere. Schaut her:" Quiet cozy room ambient sound.',
            "scene4_image_prompt": f"candid raw smartphone selfie, {character_archetype} sitting in the passenger seat of a luxury sports car at night, premium black leather interior, subtle ambient neon LED dashboard lighting, street lights bokeh through the window, pointing her index finger downwards toward the bottom of the frame, confident friendly smile. Front camera flash, natural skin texture, mobile UGC viral snapshot",
            "scene4_video_prompt": 'The woman in the car speaks confidently to the camera, pointing her index finger downwards toward the bottom of the screen with a friendly smile and affirmative nod. Neon LED car interior light, smooth 24fps real-time motion. Audio: The girl speaks in German with a clear call to action: "Link ist direkt unten, holt euch den Bonus ab, bevor er weg ist!" Low engine hum and street ambient sound.'
        }

        api_key = openrouter_api_key.strip()
        if not api_key:
            print("[OpenRouter Creative Director] No API key provided, using optimized default storyboard.")
            return self._format_output(fallback_data)

        lang = "German" if "German" in target_geo or "DE" in target_geo or "AT" in target_geo or "CH" in target_geo else ("Dutch" if "Netherlands" in target_geo else "English")

        system_instruction = f"""You are an elite Performance Media Buying Creative Director specializing in viral TikTok & Meta Reels UGC video ads.
You must output a 4-scene narrative arc (4 seconds per scene, 16 seconds total) following this proven structure:
- Scene 1 (0-4s): HOOK / Lifestyle (e.g. Yacht / Travel). Pattern interrupt.
- Scene 2 (4-8s): PIVOT / Luxury setting (e.g. Restaurant / Club). Exposure angle ("They make money off you...").
- Scene 3 (8-12s): PROOF / Cozy Home. Character holds up smartphone directly to camera with a SOLID BRIGHT PURE GREEN SCREEN (#00FF00) on the phone display for chroma-keying.
- Scene 4 (12-16s): CTA / Statement (e.g. Luxury Car interior / Balcony). Clear gesture pointing downwards.

CRITICAL RULES:
1. Speech language: {lang}. All audio lines must be authentic, natural spoken {lang} (no AI robotic phrasing).
2. Video motion prompts must follow the format: `<Motion description>, 24fps real-time motion. Audio: The girl speaks in {lang}: "<Exact speech in quotes>" <Ambient sound description>.`
3. Scene 3 Image prompt MUST include: `The phone screen is a solid bright pure green screen #00FF00 with small tracking markers for chroma keying.`
4. Output MUST be ONLY a single valid JSON object with NO markdown formatting, NO backticks, NO explanation.

JSON Schema:
{{
  "scene1_image_prompt": "...",
  "scene1_video_prompt": "...",
  "scene2_image_prompt": "...",
  "scene2_video_prompt": "...",
  "scene3_image_prompt": "...",
  "scene3_video_prompt": "...",
  "scene4_image_prompt": "...",
  "scene4_video_prompt": "..."
}}"""

        user_prompt = f"Campaign Topic: {campaign_topic}\nCharacter: {character_archetype}\nTarget GEO: {target_geo}\nSeed Variation: {seed}"

        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.7
        }

        try:
            req = urllib.request.Request(
                "https://openrouter.ai/api/v1/chat/completions",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://github.com/comfyanonymous/ComfyUI",
                    "X-Title": "ComfyUI OpenRouter Creative Director"
                }
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"].strip()
                
                # Strip any accidental markdown formatting
                if content.startswith("```json"):
                    content = content[7:]
                if content.startswith("```"):
                    content = content[3:]
                if content.endswith("```"):
                    content = content[:-3]
                content = content.strip()
                
                data = json.loads(content)
                print(f"[OpenRouter Creative Director] Successfully generated 4-scene storyboard using {model}!")
                return self._format_output(data)

        except Exception as e:
            print(f"[OpenRouter Creative Director] Error calling OpenRouter ({e}), using fallback storyboard.")
            return self._format_output(fallback_data)

    def _format_output(self, d):
        s1_img = d.get("scene1_image_prompt", "")
        s1_vid = d.get("scene1_video_prompt", "")
        s2_img = d.get("scene2_image_prompt", "")
        s2_vid = d.get("scene2_video_prompt", "")
        s3_img = d.get("scene3_image_prompt", "")
        s3_vid = d.get("scene3_video_prompt", "")
        s4_img = d.get("scene4_image_prompt", "")
        s4_vid = d.get("scene4_video_prompt", "")

        markdown = f"""### 🎬 16-Second AI UGC Creative Storyboard

**Shot 1: Hook**
* Image: `{s1_img[:120]}...`
* Motion/Audio: `{s1_vid[:120]}...`

**Shot 2: Pivot**
* Image: `{s2_img[:120]}...`
* Motion/Audio: `{s2_vid[:120]}...`

**Shot 3: App Proof (Green Screen)**
* Image: `{s3_img[:120]}...`
* Motion/Audio: `{s3_vid[:120]}...`

**Shot 4: CTA Statement**
* Image: `{s4_img[:120]}...`
* Motion/Audio: `{s4_vid[:120]}...`
"""
        return (
            s1_img, s1_vid,
            s2_img, s2_vid,
            s3_img, s3_vid,
            s4_img, s4_vid,
            markdown
        )
