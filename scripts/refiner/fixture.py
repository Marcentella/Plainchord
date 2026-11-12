"""
Writes lib/fingerRefiner.fixture.json: one patch built by rect.py on a synthetic
frame, for lib/fingerRefiner.test.ts to check the browser-side port against.

  mpenv/Scripts/python scripts/refiner/fixture.py
"""
import json
from pathlib import Path

import numpy as np

import rect

W, H = 640, 360
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
# Smooth, so bilinear sampling agrees to within rounding. Same formula in the test, RGB order.
rgb = [127 + 120 * np.sin(xs * 0.13 + c) * np.cos(ys * 0.11 - c) for c in range(3)]
img = np.round(np.dstack(rgb[::-1])).astype(np.uint8)  # OpenCV order: BGR

corners = [[0.80, 0.40], [0.795, 0.47], [0.48, 0.53], [0.49, 0.47]]  # nut low/high, 12th fret low/high... ordered as the app does
corners = [corners[0], corners[1], corners[3], corners[2]]
hand = [[0.70 - 0.004 * i, 0.60 - 0.006 * i] for i in range(21)]
finger = 1
hand[9], hand[10], hand[11], hand[12] = [0.69, 0.60], [0.68, 0.53], [0.672, 0.48], [0.668, 0.455]

to_neck, to_image = rect.homographies(np.float32(corners) * [W, H], 12)
full, origin = rect.patch(img, to_neck, to_image, np.float32(hand) * [W, H], finger)
p = full[rect.MARGIN_Y : rect.MARGIN_Y + rect.H, rect.MARGIN_X : rect.MARGIN_X + rect.W].transpose(2, 0, 1).astype(np.float32) / 255
flat = p.ravel()
step = 37
out = {
    "width": W,
    "height": H,
    "corners": corners,
    "hand": hand,
    "finger": finger,
    "originX": float(origin[0] + rect.MARGIN_X),
    "step": step,
    "samples": [round(float(v), 4) for v in flat[::step]],
    "guideSum": round(float(p[3].sum()), 3),
    "guidePeak": [int(v) for v in np.unravel_index(p[3].argmax(), p[3].shape)],
}
dest = Path(__file__).resolve().parents[2] / "lib/fingerRefiner.fixture.json"
dest.write_text(json.dumps(out, separators=(",", ":")))
print(dest, len(out["samples"]), out["originX"], out["guideSum"], out["guidePeak"])
