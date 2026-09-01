import json
import urllib.request
import urllib.parse
import sys
import time

COMFY_URL = "http://127.0.0.1:8188"

def check_comfy():
    try:
        req = urllib.request.urlopen(f"{COMFY_URL}/system_stats", timeout=3)
        return req.status == 200
    except Exception:
        return False

def queue_prompt(prompt_workflow):
    payload = json.dumps({"prompt": prompt_workflow}).encode("utf-8")
    req = urllib.request.Request(
        f"{COMFY_URL}/prompt",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def build_4in1_workflow(seed_base):
    prompts = {
        "yacht": "candid raw smartphone selfie, 24yo blonde natural german girl on a luxury yacht deck, bright sunny day, mediterranean blue sea and coastline in background, wearing casual white linen shirt, wind in hair, looking directly into camera with confident slight smile. Direct harsh sunlight, authentic skin texture with visible pores, 35mm mobile camera perspective, film grain, unposed UGC travel photo",
        "restaurant": "candid raw smartphone photo, 24yo blonde natural german girl sitting at a table in a high-end luxury restaurant at night, warm dim ambient candlelight, bokeh of blurred restaurant background, wearing elegant dark top, holding a cocktail glass, looking into camera, authentic expression. Flash photography, natural skin texture with pores, mobile UGC lifestyle photo",
        "home_greenscreen": "candid raw smartphone photo, 24yo blonde natural german girl in cozy grey oversized hoodie sitting on couch at home, holding up her smartphone directly toward the camera showing her phone screen to the viewer. The phone screen is a solid bright pure green screen #00FF00 with small tracking markers for chroma keying. Warm cozy room lighting, authentic skin texture with visible pores, looking at camera with excited happy smile, mobile UGC photo",
        "luxury_car": "candid raw smartphone selfie, 24yo blonde natural german girl sitting in the passenger seat of a luxury sports car at night, premium black leather interior, subtle ambient neon LED dashboard lighting, street lights bokeh through the window, pointing her index finger downwards toward the bottom of the frame, confident friendly smile. Front camera flash, natural skin texture, mobile UGC viral snapshot"
    }

    negative = "ugly, deformed face, bad eyes, extra fingers, plastic waxy skin, cgi, 3d render, cartoon, blurry, distorted anatomy, bad hands, low quality"

    wf = {
        "2": {"class_type": "UNETLoader", "inputs": {"unet_name": "krea2_turbo_fp8_scaled.safetensors", "weight_dtype": "default"}},
        "3": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen3vl_4b_fp8_scaled.safetensors", "type": "krea2", "device": "default"}},
        "4": {"class_type": "VAELoader", "inputs": {"vae_name": "wan_2.1_vae.safetensors"}},
        "8": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": negative}}
    }

    scenes = [
        ("01_Yacht", prompts["yacht"], 10, 11, 12, 13, 14),
        ("02_Restaurant", prompts["restaurant"], 20, 21, 22, 23, 24),
        ("03_Home_GreenScreen", prompts["home_greenscreen"], 30, 31, 32, 33, 34),
        ("04_Luxury_Car", prompts["luxury_car"], 40, 41, 42, 43, 44),
    ]

    for idx, (prefix, text, p_id, l_id, k_id, v_id, s_id) in enumerate(scenes):
        wf[str(p_id)] = {"class_type": "CLIPTextEncode", "inputs": {"clip": ["3", 0], "text": text}}
        wf[str(l_id)] = {"class_type": "EmptyLatentImage", "inputs": {"width": 1024, "height": 1344, "batch_size": 1}}
        wf[str(k_id)] = {
            "class_type": "KSampler",
            "inputs": {
                "model": ["2", 0],
                "positive": [str(p_id), 0],
                "negative": ["8", 0],
                "latent_image": [str(l_id), 0],
                "seed": seed_base + idx * 100,
                "steps": 8,
                "cfg": 1.0,
                "sampler_name": "res_multistep",
                "scheduler": "simple",
                "denoise": 1.0
            }
        }
        wf[str(v_id)] = {"class_type": "VAEDecode", "inputs": {"samples": [str(k_id), 0], "vae": ["4", 0]}}
        wf[str(s_id)] = {"class_type": "SaveImage", "inputs": {"filename_prefix": f"Batch4_{prefix}", "images": [str(v_id), 0]}}

    return wf

if __name__ == "__main__":
    print("[*] Checking ComfyUI connection at http://127.0.0.1:8188 ...")
    if not check_comfy():
        print("[-] Error: ComfyUI is not accessible. Make sure ComfyUI Desktop is running.")
        sys.exit(1)

    seed = int(time.time() * 1000) % 1000000000
    print(f"[+] Generating 4 Scenes Simultaneously (Seed: {seed}) ...")
    wf = build_4in1_workflow(seed)
    res = queue_prompt(wf)
    print(f"[+] Successfully queued 4 Scenes! Prompt ID: {res.get('prompt_id')}")
    print("[*] Generated images will appear in ComfyUI/output/ folder.")
