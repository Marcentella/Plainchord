"""
Training patches for the fingertip refiner, from the two scorers' DUMP files:

  GuiFiR (scripts/guifir/evaluate.mjs): hand-labelled fingertips, many players.
  Own recordings (scripts/own-videos/evaluate.mjs): the chord held tells which
  string each finger presses (exact across the neck) and which fret space it is
  in (a range along it), so no labelling by hand.

  mpenv/Scripts/python scripts/refiner/build.py <datasets dir> <own videos dir> [suffix]

<datasets dir> holds guifir/ and propias/ with dump<suffix>.json (suffix "" =
MediaPipe's landmarks, "_rtm" = RTMPose's). Writes <datasets dir>/refiner/train<suffix>.npz.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

import rect

ROOT = Path(sys.argv[1])
OWN_VIDEOS = Path(sys.argv[2])
SUFFIX = sys.argv[3] if len(sys.argv) > 3 else ""
OWN_SIZE = (1280, 720)  # what the app's camera gives
OWN_EVERY = 2

chords = {c["name"]: c for c in json.load(open(Path(__file__).resolve().parents[2] / "data/chords.json", encoding="utf8"))}
# The player's own G (scripts/own-videos/evaluate.mjs).
chords["G"] = {**chords["G"], "fingers": [2, 1, 0, 0, 0, 4]}

out = {k: [] for k in ("patch", "tip", "target", "has", "xrange", "group", "fold", "finger", "source")}


def add(img, corners, end_fret, hand, finger, group, fold, source, gt_px=None, string=None, fret_range_u=None):
    h, w = img.shape[:2]
    to_neck, to_image = rect.homographies(np.float32(corners) * [w, h], end_fret)
    hand_px = np.float32(hand) * [w, h]
    p, origin = rect.patch(img, to_neck, to_image, hand_px, finger)
    tip = rect.to_canon(to_neck, hand_px[[8 + 4 * finger]])[0] - origin
    if not np.all(np.isfinite(tip)) or not (0 <= tip[1] < rect.FULL_H):
        return
    if gt_px is not None:
        target = rect.to_canon(to_neck, [gt_px])[0] - origin
        has, xr = (1, 1), (np.nan, np.nan)
        # A labelled tip this far from the model's is another finger or a lost hand, not a tip to learn.
        if np.abs(target - tip).max() > 3 * rect.PX_PER_STRING:
            return
    else:
        target = np.array([tip[0], rect.string_y(string) - origin[1]])
        has, xr = (0, 1), tuple(np.array(fret_range_u) * rect.K - origin[0])
    for k, v in zip(out, (p, tip, target, has, xr, group, fold, finger, source)):
        out[k].append(v)


# GuiFiR
rows = json.load(open(ROOT / f"guifir/dump{SUFFIX}.json"))
by_clip = {}
for r in rows:
    by_clip.setdefault(r["clip"], []).append(r)
for i, (clip, rs) in enumerate(sorted(by_clip.items())):
    cap = cv2.VideoCapture(str(ROOT / f"guifir/GuiFiR/raw_clips/{clip}.mp4"))
    wanted = {r["frame"]: r for r in rs}
    n = 0
    while wanted and n <= max(wanted):
        ok, img = cap.read()
        if not ok:
            break
        r = wanted.get(n)
        n += 1
        if r is None:
            continue
        h, w = img.shape[:2]
        if w > 1920:  # 4K clips: the app never sees more than 1080p
            img = cv2.resize(img, (1920, 1080), interpolation=cv2.INTER_AREA)
            h, w = 1080, 1920
        hand = [[p["x"], p["y"]] for p in r["hand"]]
        corners = [[p["x"], p["y"]] for p in r["corners"]]
        for f in range(4):
            if r["gt"][f]:
                add(img, corners, r["endFret"], hand, f, "_".join(clip.split("_")[:-1]), r["fold"], 0, gt_px=[r["gt"][f]["x"] * w, r["gt"][f]["y"] * h])
    print(f"guifir {i + 1}/{len(by_clip)}", end="\r", flush=True)
print(f"\nguifir: {len(out['patch'])} patches")

# Own recordings
dump = json.load(open(ROOT / f"propias/dump{SUFFIX}.json"))
for name, frames in sorted(dump.items()):
    chord_name, variant = name.split("-", 1)
    if variant.startswith("wrong"):
        continue
    chord = chords[chord_name]
    keys = sorted(map(int, frames))
    settled = [n for n in keys if n >= (keys[-1] + 1) / 2][::OWN_EVERY]
    cap = cv2.VideoCapture(str(OWN_VIDEOS / f"{name}.mp4"))
    n = 0
    while n <= settled[-1]:
        ok, img = cap.read()
        if not ok:
            break
        if n in settled and frames[str(n)]["hand"]:
            fr = frames[str(n)]
            img = cv2.resize(img, OWN_SIZE, interpolation=cv2.INTER_AREA)
            hand = [[p["x"], p["y"]] for p in fr["hand"]]
            corners = [[p["x"], p["y"]] for p in fr["corners"]]
            wires = fr.get("wires") or [rect.wire_u(k) for k in range(21)]
            for f in range(4):
                strings = [s for s in range(6) if chord["fingers"][s] == f + 1 and chord["frets"][s] > 0]
                if len(strings) == 1:
                    fret = chord["frets"][strings[0]]
                    add(img, corners, 12, hand, f, chord_name, -1, 1, string=strings[0], fret_range_u=(wires[fret - 1], wires[fret]))
        n += 1
    print(f"own {name}: total {len(out['patch'])}", flush=True)

dest = ROOT / "refiner"
dest.mkdir(exist_ok=True)
np.savez_compressed(
    dest / f"train{SUFFIX}.npz",
    patch=np.stack(out["patch"]),
    tip=np.float32(out["tip"]),
    target=np.float32(out["target"]),
    has=np.float32(out["has"]),
    xrange=np.float32(out["xrange"]),
    group=np.array(out["group"]),
    fold=np.int32(out["fold"]),
    finger=np.int32(out["finger"]),
    source=np.int32(out["source"]),
)
# A sheet of samples to check by eye: patch, guide (red), model tip (yellow), target (green).
sheet = []
rng = np.random.default_rng(0)
for src in (0, 1):
    idx = rng.choice(np.flatnonzero(np.int32(out["source"]) == src), 12, replace=False)
    tiles = []
    for i in idx:
        p = out["patch"][i]
        im = cv2.resize(p[..., :3], None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
        im[..., 2] = np.maximum(im[..., 2], cv2.resize(p[..., 3], None, fx=3, fy=3) // 2)
        for k in range(6):
            y = int((rect.string_y(k) + rect.MARGIN_Y) * 3)
            im[y, ::6] = (0, 255, 255)
        cv2.circle(im, tuple(int(v * 3) for v in out["tip"][i]), 4, (0, 255, 255), 1)
        cv2.circle(im, tuple(int(v * 3) for v in out["target"][i]), 4, (0, 255, 0), -1)
        tiles.append(im)
    sheet.append(cv2.vconcat([cv2.hconcat(tiles[:6]), cv2.hconcat(tiles[6:])]))
cv2.imwrite(str(dest / f"samples{SUFFIX}.jpg"), cv2.vconcat(sheet))
print(f"saved {len(out['patch'])} patches -> {dest}")
