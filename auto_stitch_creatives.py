import os
import sys
import glob
import subprocess
import time
from pathlib import Path

def find_comfy_output_dirs():
    """Find potential ComfyUI output directories across Windows and Linux."""
    home = Path.home()
    candidates = [
        # ComfyUI Desktop Windows paths
        Path(os.environ.get("LOCALAPPDATA", "")) / "Comfy-Desktop" / "ComfyUI-Shared" / "output" / "video",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Comfy-Desktop" / "ComfyUI-Installs" / "ComfyUI" / "ComfyUI" / "output" / "video",
        # Local relative output directory
        Path("./output/video"),
        Path("./output"),
        # User workspace paths
        home / "ComfyUI" / "output" / "video",
        Path("C:/Users") / os.environ.get("USERNAME", "") / "AppData/Local/Comfy-Desktop/ComfyUI-Shared/output/video",
    ]
    for p in candidates:
        if p.exists() and p.is_dir():
            return p
    return None

def find_latest_4_shots(video_dir):
    """Find the 4 most recent video files matching scenes 1..4 or latest 4 mp4s."""
    video_files = list(video_dir.glob("*.mp4")) + list(video_dir.glob("*/*.mp4"))
    if not video_files:
        return []
    
    # Sort by modification time descending
    video_files.sort(key=lambda x: x.stat().st_mtime, reverse=True)
    
    # Check if there are named shot files
    shots = {}
    for f in video_files:
        name_lower = f.name.lower()
        if "01_" in name_lower or "yacht" in name_lower:
            shots.setdefault(1, f)
        elif "02_" in name_lower or "restaurant" in name_lower:
            shots.setdefault(2, f)
        elif "03_" in name_lower or "home" in name_lower or "green" in name_lower:
            shots.setdefault(3, f)
        elif "04_" in name_lower or "car" in name_lower or "luxury" in name_lower:
            shots.setdefault(4, f)
            
    if len(shots) == 4:
        return [shots[1], shots[2], shots[3], shots[4]]
    
    # Fallback: take latest 4 mp4 files sorted chronologically by modification time
    latest_4 = video_files[:4]
    latest_4.sort(key=lambda x: x.stat().st_mtime)
    return latest_4

def stitch_videos(files, output_path):
    """Losslessly and cleanly stitch video files using ffmpeg."""
    os.makedirs(output_path.parent, exist_ok=True)
    
    # Prepare concat text list for ffmpeg
    temp_list = output_path.parent / "concat_list.txt"
    with open(temp_list, "w", encoding="utf-8") as f:
        for file in files:
            # Escape path for ffmpeg concat
            clean_path = str(file.resolve()).replace("\\", "/")
            f.write(f"file '{clean_path}'\n")
            
    print("[*] Splicing 4 video clips into a single 16-second creative...")
    
    # Run ffmpeg with re-encode for perfect audio sync and clean cut boundaries
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", str(temp_list),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(output_path)
    ]
    
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            print(f"[-] FFmpeg error:\n{res.stderr}")
            return False
    finally:
        if temp_list.exists():
            temp_list.unlink()
            
    return True

def main():
    print("=" * 60)
    print(" 🎬 AUTOMATED 4-SHOT VIDEO SPLICER (Meta Ads Ready)")
    print("=" * 60)
    
    # 1. Determine input files
    if len(sys.argv) == 5:
        files = [Path(p) for p in sys.argv[1:5]]
        print(f"[+] Using 4 files from arguments:")
    else:
        video_dir = find_comfy_output_dirs()
        if not video_dir:
            print("[-] Could not automatically locate ComfyUI output directory.")
            print("    Usage: python auto_stitch_creatives.py shot1.mp4 shot2.mp4 shot3.mp4 shot4.mp4")
            sys.exit(1)
            
        print(f"[+] Scanning ComfyUI video output at: {video_dir}")
        files = find_latest_4_shots(video_dir)
        
        if len(files) < 4:
            print(f"[-] Found {len(files)} files, need 4 video clips.")
            print("    Usage: python auto_stitch_creatives.py shot1.mp4 shot2.mp4 shot3.mp4 shot4.mp4")
            sys.exit(1)

    print("\n[+] Found 4 scenes to stitch in sequence:")
    for idx, f in enumerate(files, 1):
        print(f"    Shot {idx}: {f.name}")

    # 2. Output destination
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    ready_dir = Path("./READY_ADS")
    output_file = ready_dir / f"CREATIVE_16S_{timestamp}.mp4"

    # 3. Stitch
    success = stitch_videos(files, output_file)
    if success:
        print("\n" + "=" * 60)
        print(f"🎉 SUCCESS! 16-Second Video Creative Created:")
        print(f"👉 File: {output_file.resolve()}")
        print("=" * 60)
    else:
        print("[-] Splicing failed. Check that FFmpeg is installed.")

if __name__ == "__main__":
    main()
