"""
Runs PlainChord's own hand model (public/models/hand_landmarker-float16-v1.task)
over every frame of a folder of videos and saves the landmarks, for
scripts/guifir/evaluate.mjs (GuiFiR) and scripts/own-videos/evaluate.mjs (our
own recordings). VIDEO mode, like the app: the model tracks the hand from frame
to frame instead of searching each frame from scratch.

Neither dataset is in the repo (GuiFiR's terms forbid redistribution; the
recordings are personal). Then:

  py -3.12 -m venv mpenv && mpenv/Scripts/python -m pip install mediapipe
  mpenv/Scripts/python scripts/guifir/landmarks.py <videos dir> <out.json> [split.csv]

With GuiFiR's metadata/split.csv, only its val/test clips are run.
Writes { clip: { fps, frames: [[hand, ...], ...] } }, hand = { handedness,
score, points: [[x, y], ...21] } in 0-1 image coordinates; clip = file name
without extension.
"""
import csv
import json
import sys
import time
from pathlib import Path

import cv2
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import HandLandmarker, HandLandmarkerOptions, RunningMode

VIDEOS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
MODEL = Path(__file__).resolve().parents[2] / "public/models/hand_landmarker-float16-v1.task"
# The app asks the camera for 1280x720; 4K test clips are scaled down to that
# so the model sees what it would see live.
MAX_WIDTH = 1280

clips = sorted(p.stem for p in VIDEOS.glob("*.mp4"))
if len(sys.argv) > 3:
    split = {row["clip_id"]: row["split"] for row in csv.DictReader(open(sys.argv[3]))}
    clips = [c for c in clips if split.get(c) in ("val", "test")]

out = {}
started = time.time()
for i, clip in enumerate(clips):
    landmarker = HandLandmarker.create_from_options(
        HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(MODEL)),
            running_mode=RunningMode.VIDEO,
            num_hands=2,
        )
    )
    capture = cv2.VideoCapture(str(VIDEOS / f"{clip}.mp4"))
    fps = capture.get(cv2.CAP_PROP_FPS)
    frames = []
    while True:
        ok, bgr = capture.read()
        if not ok:
            break
        if bgr.shape[1] > MAX_WIDTH:
            bgr = cv2.resize(bgr, (MAX_WIDTH, round(bgr.shape[0] * MAX_WIDTH / bgr.shape[1])), interpolation=cv2.INTER_AREA)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        result = landmarker.detect_for_video(image, round(len(frames) * 1000 / fps))
        frames.append(
            [
                {
                    "handedness": result.handedness[h][0].category_name,
                    "score": round(result.handedness[h][0].score, 3),
                    "points": [[round(p.x, 5), round(p.y, 5)] for p in points],
                }
                for h, points in enumerate(result.hand_landmarks)
            ]
        )
    landmarker.close()
    out[clip] = {"fps": fps, "frames": frames}
    print(f"{i + 1}/{len(clips)} {clip}: {len(frames)} frames, {time.time() - started:.0f} s", flush=True)

json.dump(out, open(OUT, "w"), separators=(",", ":"))
