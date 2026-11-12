"""The fingertip refiner network (see train.py)."""
import torch
import torch.nn as nn
import torch.nn.functional as F

import rect

S = rect.PX_PER_STRING


class Refiner(nn.Module):
    """Patch (RGB + guide) -> where the finger presses, in patch pixels."""

    def __init__(self):
        super().__init__()
        chans = [6, 24, 32, 48, 64, 96]
        self.convs = nn.ModuleList(nn.Sequential(nn.Conv2d(a, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU(), nn.Conv2d(b, b, 3, padding=1), nn.BatchNorm2d(b), nn.ReLU()) for a, b in zip(chans, chans[1:]))
        self.head = nn.Sequential(nn.Flatten(), nn.Linear(96 * 5 * 6, 128), nn.ReLU(), nn.Linear(128, 2))

    def forward(self, x):  # x: N,4,H,W in 0..1
        n, _, h, w = x.shape
        ys = torch.linspace(-1, 1, h, device=x.device).view(1, 1, h, 1).expand(n, 1, h, w)
        xs = torch.linspace(-1, 1, w, device=x.device).view(1, 1, 1, w).expand(n, 1, h, w)
        x = torch.cat([x, xs, ys], 1)
        for i, conv in enumerate(self.convs):
            x = conv(x)
            if i < 4:
                x = F.max_pool2d(x, 2)
        # Offset from the patch centre, in string spacings.
        return self.head(x) * S + torch.tensor([rect.W / 2, rect.H / 2], device=x.device)
