import json
import urllib.request
import urllib.error
import re

class LocalOllamaCreativeDirector:
    """
    Local Ollama Creative Director (Mistral NeMo 12B / Qwen 2.5):
    Generates 4-scene high-converting UGC ad scripts, master character portrait prompt,
    4 scene image prompts, and 4 video motion/speech prompts using local Ollama.
    Enforces keep_alive=0 to immediately release VRAM before diffusion starts.
    """
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "ollama_url": ("STRING", {
                    "multiline": False,
                    "default": "http://127.0.0.1:11434",
                    "placeholder": "http://127.0.0.1:11434"
                }),
                "model": ("STRING", {
                    "multiline": False,
                    "default": "mistral-nemo:12b-instruct-2407-q4_K_M",
                    "placeholder": "mistral-nemo:12b-instruct-2407-q4_K_M or qwen2.5:14b"
                }),
                "campaign_topic": ("STRING", {
                    "multiline": True,
                    "default": "Germany iGaming / gambling: Exposing fake Instagram rich girls and revealing the real no-deposit app that financed everything"
                }),
                "character_archetype": ("STRING", {
                    "multiline": False,
                    "default": "24yo natural blonde German girl, beautiful casual creator"
                }),
                "target_geo": ([
                    "Germany (DE)",
                    "Netherlands (NL)",
                    "Austria (AT)",
                    "Switzerland (CH)",
                    "English (Global)"
                ], {"default": "Germany (DE)"}),
                "keep_alive": ("STRING", {
                    "multiline": False,
                    "default": "0m",
                    "placeholder": "0m (unloads VRAM immediately)"
                }),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xffffffffffffffff}),
            }
        }

    RETURN_TYPES = (
        "STRING", # 1. master_character_prompt
        "STRING", "STRING", # 2. scene1_image, scene1_video
        "STRING", "STRING", # 3. scene2_image, scene2_video
        "STRING", "STRING", # 4. scene3_image, scene3_video (GreenScreen)
        "STRING", "STRING", # 5. scene4_image, scene4_video (CTA)
        "STRING"  # 6. full_script_markdown
    )
    RETURN_NAMES = (
        "master_character_prompt",
        "scene1_image_prompt", "scene1_video_prompt",
        "scene2_image_prompt", "scene2_video_prompt",
        "scene3_image_prompt", "scene3_video_prompt",
        "scene4_image_prompt", "scene4_video_prompt",
        "full_script_markdown"
    )
    FUNCTION = "generate_creative_package"
    CATEGORY = "🎬 MatrixLab / UGC Director"

    def generate_creative_package(self, ollama_url, model, campaign_topic, character_archetype, target_geo, keep_alive, seed):
        # Language specific dialogue rule
        lang_map = {
            "Germany (DE)": "German (authentic casual conversational UGC slang used in Berlin/Munich)",
            "Netherlands (NL)": "Dutch (authentic casual conversational UGC slang used in Amsterdam)",
            "Austria (AT)": "Austrian German (natural conversational dialect)",
            "Switzerland (CH)": "Swiss German / High German casual",
            "English (Global)": "Natural conversational English UGC creator style"
        }
        chosen_language = lang_map.get(target_geo, "German")

        system_prompt = f"""You are the world's #1 Viral Direct-Response UGC Video Ad Creative Director and Prompt Engineer for Meta (Facebook/Instagram Ads) and TikTok Ads.
Your job is to take a campaign topic and character archetype, and generate an end-to-end 4-scene video ad package following the proven 16-second viral formula (Hook -> Problem/Story -> Smartphone Proof GreenScreen -> Reward/CTA).

TARGET LANGUAGE FOR DIALOGUE: {chosen_language}.

CRITICAL RULES:
1. MASTER CHARACTER PROMPT: A clean, hyperrealistic studio portrait prompt on neutral grey background, 50mm portrait lens, matte velvety skin with visible fine pores, soft natural diffused light, direct eye contact.
2. 4 SCENE IMAGE PROMPTS: Must follow the 'Matrix Lab' consistency rule: DO NOT write lengthy biometric descriptions of the face (the face will be transferred via ReActor from the Master Character). Describe only camera angle, framing, location, luxury/casual wardrobe, pose, and candid iPhone mobile lighting.
3. SCENE 3 IMAGE PROMPT: Must feature the character holding a modern smartphone towards the camera with a bright solid green screen (#00FF00) on the display, perfect for chroma-key overlay.
4. 4 SCENE VIDEO PROMPTS: Must describe camera movement, authentic micro-expressions (24fps), and include the exact spoken dialogue line for native audio synthesis in the format:
   'Audio: The woman says in {chosen_language} with an energetic emotional tone: "[EXACT_SPOKEN_SENTENCE]". Ambient room sound.'
5. Output MUST be valid, raw JSON without markdown code fences or conversational text.

JSON FORMAT SCHEMA:
{{
  "master_character_prompt": "Studio portrait of the synthetic female creator from the reference...",
  "scene1": {{
    "angle": "Hook / Pattern Interrupt",
    "image_prompt": "Candid eye-level mobile photo of a young woman on a luxury yacht in Monaco, sunny day, casual white linen shirt, holding sunglasses, laughing, soft sunlight, photorealistic UGC iPhone look",
    "video_prompt": "Smooth handheld camera tracking. The woman lowers her sunglasses, looks directly into the lens with an excited smirk, speaking naturally. 24fps mobile video. Audio: The woman says in German with an energetic tone: 'Ich dachte erst, diese ganzen Instagram-Mädels faken alles, aber schau mal hier!'. Ambient sea breeze sound."
  }},
  "scene2": {{
    "angle": "Problem / Story Exposition",
    "image_prompt": "Candid eye-level photo of the young woman sitting in a high-end luxury restaurant at night, stylish black outfit, looking at the viewer, warm ambient candle lighting, realistic skin texture, photorealistic",
    "video_prompt": "Subtle camera push-in. The woman leans forward on the table, talking intimately to the camera, gesturing with one hand, natural blinking and smile. Audio: The woman says in German: 'Ich habe monatelang nach dem echten Trick gesucht, bis mir eine Freundin diese eine App gezeigt hat!'. Warm restaurant ambience."
  }},
  "scene3": {{
    "angle": "Smartphone Proof / Green Screen",
    "image_prompt": "Close-up portrait of the young woman in a modern cozy bedroom at night, holding up a smartphone facing directly to the camera with a glowing solid bright green screen (#00FF00) on the display, soft screen glow on her face, photorealistic",
    "video_prompt": "Steady locked shot. The woman holds her phone steady towards the lens with the bright green screen glowing, pointing at it with excitement while talking. Audio: The woman says in German: 'Du musst nicht mal einen Cent einzahlen, die geben dir direkt 50 Freispiele beim Start!'. Soft room ambience."
  }},
  "scene4": {{
    "angle": "Reward / Call To Action",
    "image_prompt": "Candid medium shot of the young woman sitting in the driver seat of a luxury sports car, looking out the open window at the camera, wearing an elegant jacket, smiling triumphantly, golden hour sunlight, photorealistic",
    "video_prompt": "Dynamic cinematic gimbal movement. The woman smiles warmly, winks, and gestures down towards the link with confidence. Audio: The woman says in German: 'Klick jetzt unten auf den Link und hol dir deinen Bonus, bevor die Aktion vorbei ist!'. Distant luxury car engine sound."
  }}
}}"""

        user_content = f"Campaign Topic: {campaign_topic}\nCharacter Archetype: {character_archetype}\nTarget Geo: {target_geo}\nSeed: {seed}"

        # Clean URL
        endpoint = ollama_url.rstrip("/") + "/api/generate"
        
        payload = {
            "model": model,
            "prompt": f"<system>\n{system_prompt}\n</system>\n\n<user>\n{user_content}\n</user>",
            "stream": False,
            "format": "json",
            "keep_alive": keep_alive,
            "options": {
                "temperature": 0.35,
                "seed": seed if seed > 0 else 42,
                "num_ctx": 8192
            }
        }

        try:
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=120) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                raw_response = res_data.get("response", "")
                
                # Robust JSON extraction
                json_str = raw_response.strip()
                match = re.search(r'\{.*\}', json_str, re.DOTALL)
                if match:
                    json_str = match.group(0)
                
                data = json.loads(json_str)

                master_char = data.get("master_character_prompt", "")
                s1_img = data.get("scene1", {}).get("image_prompt", "")
                s1_vid = data.get("scene1", {}).get("video_prompt", "")
                s2_img = data.get("scene2", {}).get("image_prompt", "")
                s2_vid = data.get("scene2", {}).get("video_prompt", "")
                s3_img = data.get("scene3", {}).get("image_prompt", "")
                s3_vid = data.get("scene3", {}).get("video_prompt", "")
                s4_img = data.get("scene4", {}).get("image_prompt", "")
                s4_vid = data.get("scene4", {}).get("video_prompt", "")

                markdown_preview = f"""# 🎬 UGC Video Script ({target_geo})
**Model:** `{model}` | **VRAM Unload:** `keep_alive={keep_alive}`

### 👤 Master Character Anchor:
> {master_char}

---
### 1️⃣ Scene 1 (Hook - Yacht):
* **Photo:** {s1_img}
* **Video:** {s1_vid}

---
### 2️⃣ Scene 2 (Story - Restaurant):
* **Photo:** {s2_img}
* **Video:** {s2_vid}

---
### 3️⃣ Scene 3 (Smartphone GreenScreen - Home):
* **Photo:** {s3_img}
* **Video:** {s3_vid}

---
### 4️⃣ Scene 4 (Reward CTA - Luxury Car):
* **Photo:** {s4_img}
* **Video:** {s4_vid}
"""
                return (
                    master_char,
                    s1_img, s1_vid,
                    s2_img, s2_vid,
                    s3_img, s3_vid,
                    s4_img, s4_vid,
                    markdown_preview
                )

        except Exception as e:
            print(f"[LocalOllamaCreativeDirector] Warning/Fallback triggered: {e}")
            # Robust fallback script
            fallback_char = f"Studio portrait of a {character_archetype}, 50mm portrait lens, neutral grey studio background, frontal diffused lighting, matte velvety skin with fine pore texture, natural hair, neutral relaxed expression, photorealistic, sharp focus, 8k"
            
            fb_s1_img = "Candid eye-level mobile photo of a young woman on a luxury yacht in Monaco, sunny day, casual white linen shirt, holding sunglasses, laughing, soft sunlight, photorealistic UGC iPhone look"
            fb_s1_vid = "Smooth handheld camera tracking. The woman lowers her sunglasses, looks directly into the lens with an excited smile, speaking naturally. 24fps mobile video. Audio: The woman says in German with an excited tone: 'Ich dachte erst, diese ganzen Instagram-Mädels faken alles, aber schau mal hier!'. Ambient sea breeze sound."
            
            fb_s2_img = "Candid eye-level photo of the young woman sitting in a high-end luxury restaurant at night, stylish black outfit, looking at the viewer, warm ambient candle lighting, realistic skin texture, photorealistic"
            fb_s2_vid = "Subtle camera push-in. The woman leans forward on the table, talking intimately to the camera, gesturing with one hand, natural blinking and smile. Audio: The woman says in German: 'Ich habe monatelang nach dem echten Trick gesucht, bis mir eine Freundin diese eine App gezeigt hat!'. Warm restaurant ambience."
            
            fb_s3_img = "Close-up portrait of the young woman in a cozy modern bedroom at night, holding up a smartphone facing directly to the camera with a glowing solid bright green screen (#00FF00) on the display, soft screen glow on her face, photorealistic"
            fb_s3_vid = "Steady locked shot. The woman holds her phone steady towards the lens with the bright green screen glowing, pointing at it with excitement while talking. Audio: The woman says in German: 'Du musst nicht mal einen Cent einzahlen, die geben dir direkt 50 Freispiele beim Start!'. Soft room ambience."
            
            fb_s4_img = "Candid medium shot of the young woman sitting in the driver seat of a luxury sports car, looking out the open window at the camera, wearing an elegant jacket, smiling triumphantly, golden hour sunlight, photorealistic"
            fb_s4_vid = "Dynamic cinematic gimbal movement. The woman smiles warmly, winks, and gestures down towards the link with confidence. Audio: The woman says in German: 'Klick jetzt unten auf den Link und hol dir deinen Bonus, bevor die Aktion vorbei ist!'. Distant luxury car engine sound."
            
            fb_md = f"# 🎬 Fallback UGC Video Script ({target_geo})\n*(Ollama connection not ready or loading: {e})*\n\nUsing calibrated German gambling ad package."

            return (
                fallback_char,
                fb_s1_img, fb_s1_vid,
                fb_s2_img, fb_s2_vid,
                fb_s3_img, fb_s3_vid,
                fb_s4_img, fb_s4_vid,
                fb_md
            )
