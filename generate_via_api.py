import json
import urllib.request
import urllib.parse
import sys
import time

COMFY_URL = "http://127.0.0.1:8188"

def check_comfy_live():
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

def build_krea2_api_prompt(positive_prompt, seed=123456, width=1024, height=1344):
    """Clean API format for ComfyUI execution"""
    return {
        "2": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "krea2_turbo_fp8_scaled.safetensors",
                "weight_dtype": "default"
            }
        },
        "3": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen3vl_4b_fp8_scaled.safetensors",
                "type": "krea2",
                "device": "default"
            }
        },
        "4": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "wan_2.1_vae.safetensors"
            }
        },
        "13": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["3", 0],
                "text": positive_prompt
            }
        },
        "8": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "clip": ["3", 0],
                "text": "blurry, distorted anatomy, plastic skin, overprocessed face, waxy texture, extra fingers, bad hands, cgi, 3d render"
            }
        },
        "68": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1
            }
        },
        "67": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["2", 0],
                "positive": ["13", 0],
                "negative": ["8", 0],
                "latent_image": ["68", 0],
                "seed": seed,
                "steps": 8,
                "cfg": 1.0,
                "sampler_name": "res_multistep",
                "scheduler": "simple",
                "denoise": 1.0
            }
        },
        "44": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["67", 0],
                "vae": ["4", 0]
            }
        },
        "72": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "Gambling_UGC_DE_NL",
                "images": ["44", 0]
            }
        }
    }

if __name__ == "__main__":
    print("Checking connection to ComfyUI at http://127.0.0.1:8188 ...")
    if not check_comfy_live():
        print("[-] ComfyUI is not responding at http://127.0.0.1:8188. Make sure ComfyUI Desktop is running!")
        sys.exit(1)

    print("[+] ComfyUI is LIVE!")
    prompt_text = (
        "candid raw smartphone photo, 24yo natural german girl with messy blonde hair in a casual grey oversized hoodie, "
        "sitting on a bed in a cozy bedroom at night, holding her smartphone toward the camera in excitement, "
        "genuine shocked and happy facial expression, mouth slightly open, eyes wide, direct eye contact with camera. "
        "Direct harsh iPhone flash photography, authentic skin texture with visible fine pores and subtle natural imperfections, "
        "no smooth plastic skin, no heavy makeup. Dim background with soft warm ambient lamp light, real life room setting, "
        "realistic depth of field, 35mm mobile camera perspective, film grain, high realism, unstaged UGC photo"
    )
    
    current_seed = int(time.time() * 1000) % 1000000000
    workflow = build_krea2_api_prompt(prompt_text, seed=current_seed)
    
    print(f"[*] Queueing generation with seed {current_seed} ...")
    res = queue_prompt(workflow)
    print(f"[+] Generation successfully queued! Prompt ID: {res.get('prompt_id')}")
    print("[*] Image will be saved to your ComfyUI output directory.")
