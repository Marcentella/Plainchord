"""
Trains the fingertip refiner on build.py's patches and says honestly how good it is:
5 folds, each tested on GuiFiR songs and on one own-recording chord it never trained on.

  mpenv/Scripts/python scripts/refiner/train.py <datasets dir> [suffix] [--final]

Each fold's model is saved (fold<k><suffix>.pt) so apply.py can replay held-out videos honestly.
--final also trains on everything and writes <datasets dir>/refiner/refiner<suffix>.pt and .onnx.
"""
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

import rect
from train_model import Refiner

ROOT = Path(sys.argv[1]) / "refiner"
SUFFIX = next((a for a in sys.argv[2:] if not a.startswith("--")), "")
FINAL = "--final" in sys.argv
EPOCHS = 40
dev = "cuda" if torch.cuda.is_available() else "cpu"

d = np.load(ROOT / f"train{SUFFIX}.npz")
patch = torch.from_numpy(d["patch"]).to(dev)  # N,H,W,4 uint8
tip, target, has, xr = (torch.from_numpy(d[k]).to(dev) for k in ("tip", "target", "has", "xrange"))
source, fold, group = d["source"], d["fold"].copy(), d["group"]
OWN_CHORDS = sorted(set(group[source == 1]))
for k, chord in enumerate(OWN_CHORDS):  # each own chord is held out in one fold
    fold[(source == 1) & (group == chord)] = k
S = rect.PX_PER_STRING


def batch(idx, train):
    """Crops the full patches to H x W; training adds shift, flip and colour changes."""
    n = len(idx)
    if train:
        ox = torch.randint(0, 2 * rect.MARGIN_X + 1, (n,), device=dev)
        oy = torch.randint(0, 2 * rect.MARGIN_Y + 1, (n,), device=dev)
    else:
        ox = torch.full((n,), rect.MARGIN_X, device=dev)
        oy = torch.full((n,), rect.MARGIN_Y, device=dev)
    rows = (oy[:, None] + torch.arange(rect.H, device=dev))[:, :, None]
    cols = (ox[:, None] + torch.arange(rect.W, device=dev))[:, None, :]
    x = patch[idx[:, None, None], rows, cols].permute(0, 3, 1, 2).float() / 255
    off = torch.stack([ox, oy], 1).float()
    t, g, r = tip[idx] - off, target[idx] - off, xr[idx] - ox[:, None]
    if train:
        rgb = x[:, :3]
        rgb = rgb * (0.7 + 0.6 * torch.rand(n, 1, 1, 1, device=dev)) + 0.15 * (torch.rand(n, 3, 1, 1, device=dev) - 0.5)
        rgb = rgb + 0.03 * torch.randn_like(rgb)
        x = torch.cat([rgb.clamp(0, 1), x[:, 3:]], 1)
        flip = torch.rand(n, device=dev) < 0.5  # mirror along the neck (left-handed players, mirrored cameras)
        x = torch.where(flip[:, None, None, None], x.flip(3), x)
        fx = lambda v: torch.where(flip, rect.W - 1 - v, v)
        t = torch.stack([fx(t[:, 0]), t[:, 1]], 1)
        g = torch.stack([fx(g[:, 0]), g[:, 1]], 1)
        r = torch.stack([fx(r[:, 1]), fx(r[:, 0])], 1)
        r = torch.where(flip[:, None], r, xr[idx] - ox[:, None])
    return x, t, g, r


def loss_fn(out, g, r, h):
    ly = (F.smooth_l1_loss(out[:, 1], g[:, 1], reduction="none", beta=2.0) * h[:, 1]).sum() / h[:, 1].sum()
    lx = (F.smooth_l1_loss(out[:, 0], g[:, 0], reduction="none", beta=2.0) * h[:, 0]).sum() / h[:, 0].sum().clamp(min=1)
    # Own recordings: along the neck only the fret space is known; pay only for leaving it.
    own = h[:, 0] == 0
    lo, hi = torch.minimum(r[:, 0], r[:, 1]), torch.maximum(r[:, 0], r[:, 1])
    lr = ((lo - out[:, 0]).clamp(min=0) + (out[:, 0] - hi).clamp(min=0))[own].sum() / own.sum().clamp(min=1)
    return ly + 0.5 * lx + 0.5 * lr


def train(train_idx):
    torch.manual_seed(0)
    model = Refiner().to(dev)
    opt = torch.optim.AdamW(model.parameters(), 2e-3, weight_decay=1e-3)
    steps = EPOCHS * (len(train_idx) // 128)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 2e-3, total_steps=steps)
    idx = torch.from_numpy(train_idx).to(dev)
    # Own frames of one video are near-copies: sample so the two sources weigh about the same.
    w = torch.where(torch.from_numpy(source[train_idx] == 1), 1.0 / max(1, (source[train_idx] == 1).sum()), 1.0 / max(1, (source[train_idx] == 0).sum()))
    model.train()
    for _ in range(steps):
        b = idx[torch.multinomial(w, 128, replacement=True).to(dev)]
        x, _, g, r = batch(b, True)
        loss = loss_fn(model(x), g, r, has[b])
        opt.zero_grad()
        loss.backward()
        opt.step()
        sched.step()
    return model.eval()


@torch.no_grad()
def predict(model, idx):
    idx = torch.from_numpy(idx).to(dev)
    outs = [model(batch(idx[i : i + 512], False)[0]) for i in range(0, len(idx), 512)]
    return torch.cat(outs) + torch.tensor([rect.MARGIN_X, rect.MARGIN_Y], device=dev)  # back to full-patch pixels


pred = torch.zeros_like(tip)
for k in range(5):
    test = np.flatnonzero(fold == k)
    model = train(np.flatnonzero(fold != k))
    pred[test] = predict(model, test)
    torch.save({"state": model.state_dict(), "own_chord": OWN_CHORDS[k] if k < len(OWN_CHORDS) else None}, ROOT / f"fold{k}{SUFFIX}.pt")
    print(f"fold {k}: {len(test)} held out", flush=True)

err_before = ((tip - target)[:, 1].abs() / S).cpu().numpy()
err_after = ((pred - target)[:, 1].abs() / S).cpu().numpy()
print("\nAcross the neck, in string spacings, on data never trained on (median | share over half a string):")
rows = [("GuiFiR (labelled tips)", source == 0)] + [(f"own {c}", (source == 1) & (group == c)) for c in OWN_CHORDS] + [("own, all chords", source == 1)]
for label, m in rows:
    print(f"  {label:24} n={m.sum():5}  model tip {np.median(err_before[m]):.2f} | {100 * (err_before[m] > 0.5).mean():4.1f} %   refined {np.median(err_after[m]):.2f} | {100 * (err_after[m] > 0.5).mean():4.1f} %")
np.save(ROOT / f"cv_pred{SUFFIX}.npy", pred.cpu().numpy())

if FINAL:
    model = train(np.arange(len(fold)))
    torch.save(model.state_dict(), ROOT / f"refiner{SUFFIX}.pt")
    torch.onnx.export(model.cpu(), torch.zeros(1, 4, rect.H, rect.W), str(ROOT / f"refiner{SUFFIX}.onnx"), input_names=["patch"], output_names=["press"], dynamic_axes={"patch": {0: "n"}, "press": {0: "n"}}, opset_version=17)
    print("saved final model")
