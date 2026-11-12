"""
Writes lib/rtmPose.fixture.json: rtmlib's crop, model input and decoding on a
synthetic frame, for lib/rtmPose.test.ts to check the browser port against.

  mpenv/Scripts/python scripts/refiner/rtm_fixture.py
"""
import json
from pathlib import Path

import numpy as np
from rtmlib.tools.pose_estimation.pre_processings import bbox_xyxy2cs, top_down_affine
from rtmlib.tools.pose_estimation.post_processings import get_simcc_maximum

W, H = 320, 180
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
rgb = [127 + 120 * np.sin(xs * 0.13 + c) * np.cos(ys * 0.11 - c) for c in range(3)]
img = np.round(np.dstack(rgb[::-1])).astype(np.uint8)  # BGR, as OpenCV reads frames

# A hand near the right edge, so part of the crop falls outside the frame.
hand = [[0.80 + 0.01 * (i % 5), 0.40 + 0.015 * (i // 5)] for i in range(21)]
p = np.array(hand) * [W, H]
lo, hi = p.min(0), p.max(0)
c = (lo + hi) / 2
s = (hi - lo).max() * 0.65
center, scale = bbox_xyxy2cs(np.array([c[0] - s, c[1] - s, c[0] + s, c[1] + s]), padding=1.25)
crop, scale = top_down_affine((256, 256), scale, center, img)
mean, std = np.array((123.675, 116.28, 103.53)), np.array((58.395, 57.12, 57.375))
x = ((crop - mean) / std).transpose(2, 0, 1).astype(np.float32).ravel()

# Decoding: fake outputs with a peak per keypoint, then rtmlib's postprocess.
rng = np.random.default_rng(1)
simcc_x = rng.random((1, 21, 512)).astype(np.float32)
simcc_y = rng.random((1, 21, 512)).astype(np.float32)
for j in range(21):
    simcc_x[0, j, 40 + 20 * j] = 5
    simcc_y[0, j, 500 - 22 * j] = 5
locs, _ = get_simcc_maximum(simcc_x, simcc_y)
kp = locs[0] / 2.0 / 256 * scale + center - scale / 2

step = 97
out = {
    "width": W,
    "height": H,
    "hand": hand,
    "center": [float(v) for v in center],
    "side": float(scale[0]),
    "step": step,
    "input": [round(float(v), 4) for v in x[::step]],
    "simccX": [round(float(v), 4) for v in simcc_x.ravel()],
    "simccY": [round(float(v), 4) for v in simcc_y.ravel()],
    "keypoints": [[float(a) / W, float(b) / H] for a, b in kp],
}
dest = Path(__file__).resolve().parents[2] / "lib/rtmPose.fixture.json"
dest.write_text(json.dumps(out, separators=(",", ":")))
print(dest, len(out["input"]), out["side"])
