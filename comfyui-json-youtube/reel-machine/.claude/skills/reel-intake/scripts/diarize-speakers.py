import os, json, sys, warnings, wave
warnings.filterwarnings("ignore")
import numpy as np, torch
from pyannote.audio import Pipeline
tok=os.environ.get("HF_TOKEN")
wav, jsonp = sys.argv[1], sys.argv[2]
try:
    pipe=Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=tok)
except Exception as e:
    print("PIPELINE_ERROR:", repr(e)[:300]); sys.exit(2)
# load wav ourselves (bypass torchcodec)
w=wave.open(wav,'rb'); sr=w.getframerate(); n=w.getnframes()
data=np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32)/32768.0
wt=torch.from_numpy(data).unsqueeze(0)
dia=pipe({"waveform": wt, "sample_rate": sr})
ann=getattr(dia,"speaker_diarization",None) or getattr(dia,"diarization",None) or dia
print("OUTPUT_FIELDS:", [a for a in dir(dia) if not a.startswith("_")][:15])
turns=[(seg.start,seg.end,spk) for seg,_,spk in ann.itertracks(yield_label=True)]
print("=== DIARIZATION TURNS ===")
for st,en,sp in turns: print(f"  {st:5.2f}-{en:5.2f}  {sp}")
words=[w for s in json.load(open(jsonp)).get('segments',[]) for w in s.get('words',[])]
def spk(wd):
    best=None;bo=-1
    for st,en,sp in turns:
        ov=min(en,wd['end'])-max(st,wd['start'])
        if ov>bo: bo=ov;best=sp
    return best or "?"
print("=== WORDS grouped by SPEAKER ===")
cur=None;line="";t0=None
for wd in words:
    s=spk(wd)
    if s!=cur:
        if line: print(f"  [{cur}] {t0:.2f}-{pt:.2f}  {line.strip()}")
        cur=s; line=""; t0=wd['start']
    line+=wd['word']; pt=wd['end']
if line: print(f"  [{cur}] {t0:.2f}-{pt:.2f}  {line.strip()}")
