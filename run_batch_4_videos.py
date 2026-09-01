import json
import urllib.request
import urllib.parse
import os
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

def build_video_job(image_filename, prompt_text, prefix, seed=12345, duration=4.0, width=768, height=1024):
    """Build single MiniMax H3 Image-to-Video API payload"""
    return {
        "1": {
            "class_type": "LoadImage",
            "inputs": {
                "image": image_filename
            }
        },
        "2": {
            "class_type": "UNETLoader",
            "inputs": {
                "unet_name": "minimax_h3_fl2va_pruned_int8_convrot.safetensors",
                "weight_dtype": "default"
            }
        },
        "3": {
            "class_type": "CLIPLoader",
            "inputs": {
                "clip_name": "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors",
                "type": "minimax",
                "device": "default"
            }
        },
        "4": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "minimax_h3_video_vae_fp16.safetensors"
            }
        },
        "5": {
            "class_type": "VAELoader",
            "inputs": {
                "vae_name": "minimax_h3_audio_vae_fp32.safetensors"
            }
        },
        "6": {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {
                "model": ["2", 0],
                "lora_name": "minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors",
                "strength_model": 1.0
            }
        },
        "7": {
            "class_type": "ComfyMathExpression",
            "inputs": {
                "values.a": duration,
                "expression": "max(5, round(a * 24)) + (5 - (max(5, round(a * 24)) % 17)) % 17"
            }
        },
        "8": {
            "class_type": "MiniMaxH3ImageToVideo",
            "inputs": {
                "clip": ["3", 0],
                "vae": ["4", 0],
                "first_frame": ["1", 0],
                "prompt": prompt_text,
                "width": width,
                "height": height,
                "length": ["7", 1]
            }
        },
        "9": {
            "class_type": "RandomNoise",
            "inputs": {
                "noise_seed": seed
            }
        },
        "10": {
            "class_type": "BasicGuider",
            "inputs": {
                "model": ["6", 0],
                "conditioning": ["8", 0]
            }
        },
        "11": {
            "class_type": "KSamplerSelect",
            "inputs": {
                "sampler_name": "res_multistep"
            }
        },
        "12": {
            "class_type": "BasicScheduler",
            "inputs": {
                "model": ["6", 0],
                "steps": 8,
                "denoise": 1.0,
                "scheduler": "simple"
            }
        },
        "13": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["9", 0],
                "guider": ["10", 0],
                "sampler": ["11", 0],
                "sigmas": ["12", 0],
                "latent_image": ["8", 1]
            }
        },
        "14": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["13", 0],
                "vae": ["4", 0]
            }
        },
        "15": {
            "class_type": "VAEDecodeAudio",
            "inputs": {
                "samples": ["13", 0],
                "vae": ["5", 0]
            }
        },
        "16": {
            "class_type": "CreateVideo",
            "inputs": {
                "images": ["14", 0],
                "audio": ["15", 0],
                "fps": 24,
                "bit_depth": 8
            }
        },
        "17": {
            "class_type": "SaveVideo",
            "inputs": {
                "video": ["16", 0],
                "filename_prefix": f"video/{prefix}",
                "format": "auto",
                "codec": "auto"
            }
        }
    }

SCENES = [
    {
        "name": "01_Yacht",
        "image_candidates": ["FaceLock_01_Yacht", "Scene_01_Yacht"],
        "prompt": 'The blonde woman speaks naturally to the camera in a selfie video on the yacht deck, gentle breeze moving her hair, expressive facial expressions while talking, one natural blink, holding the camera steady. 24fps real-time motion, natural speech movement. Audio: The girl speaks clearly in German with natural energy: "Wie viele Mädels auf Instagram flexen bitte mit teuren Yachten..." Ambient gentle sea breeze and engine hum sound.'
    },
    {
        "name": "02_Restaurant",
        "image_candidates": ["FaceLock_02_Restaurant", "Scene_02_Restaurant"],
        "prompt": 'The woman speaks directly to the camera in the restaurant, holding her cocktail glass, natural talking mouth movement, subtle head gestures and warm eye contact, ambient candlelight flickering. Smooth 24fps real-time motion. Audio: The girl speaks in German with an expressive tone: "...und verdienen am Ende nur an euren Kursen, ohne euch wirklich zu helfen!" Dim ambient restaurant chatter sound.'
    },
    {
        "name": "03_Home_GreenScreen",
        "image_candidates": ["FaceLock_03_Home_GreenScreen", "Scene_03_Home_GreenScreen"],
        "prompt": 'The woman in the grey hoodie speaks with excitement directly to the camera, holding her smartphone with the solid bright green screen steady in front of her, joyful smiling facial expression, natural talking mouth movement. Smooth 24fps real-time motion, smartphone screen stays bright solid green. Audio: The girl speaks in German with an excited upbeat tone: "Ich zeige euch jetzt die echte App, mit der ich mir das finanziere. Schaut her:" Quiet cozy room ambient sound.'
    },
    {
        "name": "04_Luxury_Car",
        "image_candidates": ["FaceLock_04_Luxury_Car", "Scene_04_Luxury_Car"],
        "prompt": 'The woman in the car speaks confidently to the camera, pointing her index finger downwards toward the bottom of the screen with a friendly smile and affirmative nod. Neon LED car interior light, smooth 24fps real-time motion. Audio: The girl speaks in German with a clear call to action: "Link ist direkt unten, holt euch den Bonus ab, bevor er weg ist!" Low engine hum and street ambient sound.'
    }
]

if __name__ == "__main__":
    print("======================================================")
    print(" 🚀 4-IN-1 AUTOMATED BATCH VIDEO GENERATOR (16s Creative)")
    print("======================================================")
    
    if not check_comfy():
        print("[-] Error: ComfyUI is not responding at http://127.0.0.1:8188.")
        print("    Please make sure ComfyUI Desktop is running.")
        sys.exit(1)
        
    print("[+] ComfyUI is LIVE and connected!\n")
    
    base_seed = int(time.time() * 1000) % 1000000000
    
    for i, scene in enumerate(SCENES, 1):
        # We can find the image file or use the prefix from the output
        print(f"[*] Queueing Shot {i}/4: {scene['name']} ...")
        
        # We use standard image filename pattern generated by ComfyUI
        image_name = f"{scene['image_candidates'][0]}_00001_.png"
        
        job = build_video_job(
            image_filename=image_name,
            prompt_text=scene["prompt"],
            prefix=scene["name"],
            seed=base_seed + i * 111,
            duration=4.0,
            width=768,
            height=1024
        )
        
        try:
            res = queue_prompt(job)
            print(f"    [+] Queued! Prompt ID: {res.get('prompt_id')}")
        except Exception as e:
            print(f"    [-] Failed to queue: {e}")
            
    print("\n🎉 ALL 4 VIDEO SCENES QUEUED SUCCESSFULLY!")
    print("ComfyUI will render them sequentially (1.5-2 mins per shot).")
    print("Output videos will be saved in your ComfyUI/output/video/ folder.")
