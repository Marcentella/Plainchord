"""
Runs the refiner over a scorer's DUMP and writes a landmarks file whose fingertips
(points 8, 12, 16, 20 of the fretting hand) are the refined press points, so the
same scorers measure it end to end (with PULLBACK=0: the points already are press points).

  mpenv/Scripts/python scripts/refiner/apply.py own    <datasets dir> <own videos dir> [suffix] [--final]
  mpenv/Scripts/python scripts/refiner/apply.py guifir <datasets dir> [suffix] [--final]

Without --final each video/song is refined by the fold model that never trained on
its chord/song (train.py); with it, by the model trained on everything.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import torch

import rect
from train_model import Refiner

MODE, ROOT = sys.argv[1], Path(sys.argv[2])
rest = [a for a in sys.argv[3:] if not a.startswith("--")]
VIDEOS = Path(rest.pop(0)) if MODE == "own" else ROOT / "guifir/GuiFiR/raw_clips"
SUFFIX = rest[0] if rest else ""
FINAL = "--final" in sys.argv
dev = "cuda" if torch.cuda.is_available() else "cpu"


def load(path):
    state = torch.load(path, map_location=dev, weights_only=False)  # our own files
    model = Refiner().to(dev).eval()
    model.load_state_dict(state.get("state", state))
    return model, state.get("own_chord")


if FINAL:
    final = load(ROOT / f"refiner/refiner{SUFFIX}.pt")[0]
    folds = [(final, None)] * 5
else:
    folds = [load(ROOT / f"refiner/fold{k}{SUFFIX}.pt") for k in range(5)]
by_chord = {chord: m for m, chord in folds if chord}


@torch.no_grad()
def refine(model, img, corners, end_fret, hand):
    """hand: 21 normalized points -> the same with refined fingertips."""
    h, w = img.shape[:2]
    to_neck, to_image = rect.homographies(np.float32(corners) * [w, h], end_fret)
    hand_px = np.float32(hand) * [w, h]
    patches, origins = zip(*(rect.patch(img, to_neck, to_image, hand_px, f) for f in range(4)))
    x = torch.from_numpy(np.stack(patches)[:, rect.MARGIN_Y : rect.MARGIN_Y + rect.H, rect.MARGIN_X : rect.MARGIN_X + rect.W]).to(dev).permute(0, 3, 1, 2).float() / 255
    out = model(x).cpu().numpy() + [rect.MARGIN_X, rect.MARGIN_Y] + np.stack(origins)
    tips = rect.from_canon(to_image, out) / [w, h]
    hand = [list(p) for p in hand]
    for f in range(4):
        if np.all(np.isfinite(tips[f])):
            hand[8 + 4 * f] = [round(float(tips[f][0]), 5), round(float(tips[f][1]), 5)]
    return hand


xy = lambda pts: [[p["x"], p["y"]] for p in pts]
same = lambda a, b: abs(a[0][0] - b[0][0]) < 1e-4 and abs(a[0][1] - b[0][1]) < 1e-4

if MODE == "own":
    landmarks = json.load(open(ROOT / f"propias/landmarks{SUFFIX}.json"))
    dump = json.load(open(ROOT / f"propias/dump{SUFFIX}.json"))
    for name, frames in sorted(dump.items()):
        model = folds[0][0] if FINAL else by_chord[name.split("-")[0]]
        cap = cv2.VideoCapture(str(VIDEOS / f"{name}.mp4"))
        for n in range(max(map(int, frames)) + 1):
            ok, img = cap.read()
            fr = frames.get(str(n))
            if not ok or not fr or not fr["hand"]:
                continue
            img = cv2.resize(img, (1280, 720), interpolation=cv2.INTER_AREA)
            hand = xy(fr["hand"])
            refined = refine(model, img, xy(fr["corners"]), 12, hand)
            for entry in landmarks[name]["frames"][n]:
                if same(entry["points"], hand):
                    entry["points"] = refined
        print(name, flush=True)
    json.dump(landmarks, open(ROOT / f"propias/landmarks{SUFFIX}_refined.json", "w"), separators=(",", ":"))
else:
    landmarks = json.load(open(ROOT / f"guifir/landmarks{SUFFIX}.json"))
    rows = json.load(open(ROOT / f"guifir/dump{SUFFIX}.json"))
    by_clip = {}
    for r in rows:
        by_clip.setdefault(r["clip"], {})[r["frame"]] = r
    for i, (clip, wanted) in enumerate(sorted(by_clip.items())):
        cap = cv2.VideoCapture(str(VIDEOS / f"{clip}.mp4"))
        for n in range(max(wanted) + 1):
            ok, img = cap.read()
            r = wanted.get(n)
            if not ok or not r:
                continue
            if img.shape[1] > 1920:
                img = cv2.resize(img, (1920, 1080), interpolation=cv2.INTER_AREA)
            hand = xy(r["hand"])
            refined = refine(folds[r["fold"]][0], img, xy(r["corners"]), r["endFret"], hand)
            for entry in landmarks[clip]["frames"][n]:
                if same(entry["points"], hand):
                    entry["points"] = refined
        print(f"{i + 1}/{len(by_clip)}", end="\r", flush=True)
    json.dump(landmarks, open(ROOT / f"guifir/landmarks{SUFFIX}_refined.json", "w"), separators=(",", ":"))
