"""
The flattened fretboard patch the fingertip refiner looks at, shared by
build.py (training data) and apply.py (running the trained model).

The calibration already tells where the neck is, so each fingertip's
surroundings are resampled into a canonical view: x runs along the neck, y
across it, and the six strings are always six rows PX_PER_STRING apart, from
any camera distance, angle or player. The network then only has to learn
"on which row does this finger end", not what a guitar looks like from every
viewpoint. Same geometry as lib/fretMapping.ts (fan-shaped string plane).
"""
import cv2
import numpy as np

PX_PER_STRING = 8
SPREAD_NUT = 35 / 648
SPREAD_BRIDGE = 52.5 / 648
# Canonical pixels per unit of u (scale lengths): one string spacing at the nut = PX_PER_STRING.
K = PX_PER_STRING / (SPREAD_NUT / 5)
# Patch: v from -0.5 to 1.5 (the neck plus half its width either side), +-MARGIN px for jitter.
H = 10 * PX_PER_STRING
W = 96
MARGIN_X = 8
MARGIN_Y = 2
FULL_W = W + 2 * MARGIN_X
FULL_H = H + 2 * MARGIN_Y


def spread(u):
    return SPREAD_NUT + (SPREAD_BRIDGE - SPREAD_NUT) * u


def wire_u(n):
    return 1 - 2 ** (-n / 12)


def homographies(corners_px, end_fret):
    """corners_px: nut x low E, nut x high e, fret x low E, fret x high e (image pixels)."""
    ue = wire_u(end_fret)
    plane = np.float32([[0, -spread(0) / 2], [0, spread(0) / 2], [ue, -spread(ue) / 2], [ue, spread(ue) / 2]])
    to_neck = cv2.getPerspectiveTransform(np.float32(corners_px), plane)
    return to_neck, np.linalg.inv(to_neck)


def to_canon(to_neck, pts_px):
    """Image pixels -> canonical pixels (x = u*K, y = (v+0.5)*5*PX_PER_STRING)."""
    q = cv2.perspectiveTransform(np.float32(pts_px).reshape(-1, 1, 2), to_neck).reshape(-1, 2)
    v = q[:, 1] / spread(q[:, 0]) + 0.5
    return np.stack([q[:, 0] * K, (v + 0.5) * 5 * PX_PER_STRING], 1)


def from_canon(to_image, pts):
    pts = np.float32(pts).reshape(-1, 2)
    u = pts[:, 0] / K
    v = pts[:, 1] / (5 * PX_PER_STRING) - 0.5
    plane = np.stack([u, (v - 0.5) * spread(u)], 1)
    return cv2.perspectiveTransform(plane.reshape(-1, 1, 2).astype(np.float32), to_image).reshape(-1, 2)


def string_y(k):
    """Canonical y of string k (0 = low E ... 5 = high e)."""
    return (k / 5 + 0.5) * 5 * PX_PER_STRING


def patch(img, to_neck, to_image, hand_px, finger):
    """
    Full-size patch (FULL_H x FULL_W x 4, uint8) centred along the neck on finger's
    tip (0 = index ... 3 = pinky): RGB + a guide channel drawing that finger's last
    two bones and tip, so the network knows which finger is being asked about.
    Returns (patch, origin): canonical pixel = patch pixel + origin.
    """
    knuckle = 5 + 4 * finger
    canon = to_canon(to_neck, hand_px)
    tip = canon[knuckle + 3]
    origin = np.array([round(float(tip[0])) - FULL_W // 2, -MARGIN_Y], np.float32)
    xs, ys = np.meshgrid(np.arange(FULL_W, dtype=np.float32) + origin[0], np.arange(FULL_H, dtype=np.float32) + origin[1])
    src = from_canon(to_image, np.stack([xs.ravel(), ys.ravel()], 1)).reshape(FULL_H, FULL_W, 2)
    rgb = cv2.remap(img, src[..., 0], src[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    guide = np.zeros((FULL_H, FULL_W), np.uint8)
    line = np.round((canon[[knuckle + 1, knuckle + 2, knuckle + 3]] - origin) * 4).astype(np.int32)
    if np.abs(line).max() < 1e6:
        cv2.polylines(guide, [line.reshape(-1, 1, 2)], False, 128, 1, cv2.LINE_AA, 2)
        cv2.circle(guide, tuple(line[2]), 6, 255, -1, cv2.LINE_AA, 2)
    return np.dstack([rgb, guide]), origin
