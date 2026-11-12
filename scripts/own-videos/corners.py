"""
Marks the neck in each recording: the same four clicks the app's calibration
asks for (where the two outer strings cross the nut, then the 12th fret wire),
on one frame per video. scripts/own-videos/evaluate.mjs reads them.

  mpenv/Scripts/python scripts/own-videos/corners.py <videos dir> <corners.json>

Click the four points in any order (the app sorts them). Right-click or
Backspace = undo the last point, R = redo the video, A / D = half a second
back / forward (when the hand covers the nut), Enter = next video,
Esc = stop (progress is kept; videos already marked are skipped).
"""
import json
import sys
from pathlib import Path

import cv2

VIDEOS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
# Late enough for the camera's exposure to settle, early enough that the guitar hasn't moved.
# A / D move it when the hand hides the nut; the frame chosen is also where the frets are measured.
AT_SECONDS = 1.0
STEP_SECONDS = 0.5
SHOW_WIDTH = 1280

done = json.loads(OUT.read_text()) if OUT.exists() else {}
videos = sorted(VIDEOS.glob("*.mp4"))
for number, video in enumerate(videos, 1):
    if video.stem in done:
        continue
    capture = cv2.VideoCapture(str(video))
    length = capture.get(cv2.CAP_PROP_FRAME_COUNT) / capture.get(cv2.CAP_PROP_FPS)

    def frame_at(seconds):
        capture.set(cv2.CAP_PROP_POS_MSEC, seconds * 1000)
        ok, frame = capture.read()
        return frame if ok else None

    seconds = AT_SECONDS
    frame = frame_at(seconds)
    if frame is None:
        print(f"no frame: {video.name}")
        continue
    h, w = frame.shape[:2]
    scale = SHOW_WIDTH / w
    base = cv2.resize(frame, (SHOW_WIDTH, round(h * scale)))
    clicks = []

    def on_mouse(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN and len(clicks) < 4:
            clicks.append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN and clicks:
            clicks.pop()

    title = "PlainChord: marcar mastil"
    cv2.namedWindow(title)
    cv2.setMouseCallback(title, on_mouse)
    while True:
        view = base.copy()
        cv2.rectangle(view, (0, 0), (SHOW_WIDTH, 62), (30, 30, 30), -1)
        lines = [
            f"video {number}/{len(videos)}: {video.stem}   {seconds:.1f} s   puntos {len(clicks)}/4: cejuela y traste 12, en la 6a y la 1a cuerda",
            "clic derecho / Retroceso = quitar ultimo   R = rehacer   A / D = -0,5 s / +0,5 s   Enter = siguiente   Esc = salir",
        ]
        for row, text in enumerate(lines):
            cv2.putText(view, text, (10, 24 + row * 26), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        for x, y in clicks:
            cv2.circle(view, (x, y), 6, (0, 0, 255), 2)
            cv2.drawMarker(view, (x, y), (0, 255, 255), cv2.MARKER_CROSS, 10, 1)
        cv2.imshow(title, view)
        key = cv2.waitKey(30) & 0xFF
        if key in (ord("r"), ord("R")):
            clicks.clear()
        elif key == 8 and clicks:
            clicks.pop()
        elif key in (ord("a"), ord("A"), ord("d"), ord("D")):
            step = STEP_SECONDS if key in (ord("d"), ord("D")) else -STEP_SECONDS
            target = min(max(0.0, seconds + step), max(0.0, length - STEP_SECONDS))
            moved = frame_at(target)
            if moved is not None:
                seconds = target
                base = cv2.resize(moved, (SHOW_WIDTH, round(h * scale)))
        elif key == 13 and len(clicks) == 4:
            break
        elif key == 27:
            cv2.destroyAllWindows()
            sys.exit(0)
    capture.release()
    done[video.stem] = {
        "seconds": seconds,
        # Normalized 0-1, unmirrored: the app's calibration coordinates.
        "clicks": [[round(x / SHOW_WIDTH, 5), round(y / (h * scale), 5)] for x, y in clicks],
    }
    OUT.write_text(json.dumps(done, indent=1))
cv2.destroyAllWindows()
print(f"{len(done)} videos marcados -> {OUT}")
