"""Private JSON-lines worker. No network images, DB credentials, or web server."""
import contextlib
import json
import math
import os
from pathlib import Path
import sys

PIPELINE = json.loads(Path(__file__).with_name("pipeline.json").read_text(encoding="utf-8"))
SETTINGS = PIPELINE["settings"]
PIPELINE_VERSION = PIPELINE["pipelineVersion"]
TILE_HEIGHT = SETTINGS["tileHeight"]
OVERLAP = SETTINGS["overlap"]


def tile_starts(height):
    starts = [0]
    while starts[-1] + TILE_HEIGHT < height:
        starts.append(starts[-1] + TILE_HEIGHT - OVERLAP)
    return starts


def normalize_detections(raw, y_offset, width, height):
    detections = []
    for box, text, score in raw:
        confidence = float(score)
        if not isinstance(text, str) or not math.isfinite(confidence) or not 0 <= confidence <= 1:
            raise ValueError("invalid detection")
        bbox = [[float(point[0]), float(point[1]) + y_offset] for point in box]
        if len(bbox) != 4 or any(not math.isfinite(x) or not math.isfinite(y) for x, y in bbox):
            raise ValueError("invalid bounding box")
        # The detector can extend a pixel outside the crop; clamp to the image.
        bbox = [[max(0, min(width, x)), max(0, min(height, y))] for x, y in bbox]
        detections.append({"text": text, "confidence": confidence, "bbox": bbox})
    return detections


def deduplicate(detections):
    """Remove the same text region detected in adjacent overlapping tiles."""
    result = []
    for item in detections:
        xs, ys = zip(*item["bbox"])
        bounds = (min(xs), min(ys), max(xs), max(ys))
        duplicate = None
        for index, previous in enumerate(result):
            if previous["text"].strip() != item["text"].strip():
                continue
            px, py = zip(*previous["bbox"])
            other = (min(px), min(py), max(px), max(py))
            intersection = max(0, min(bounds[2], other[2]) - max(bounds[0], other[0])) * max(0, min(bounds[3], other[3]) - max(bounds[1], other[1]))
            smaller = min((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]), (other[2] - other[0]) * (other[3] - other[1]))
            if smaller > 0 and intersection / smaller > 0.5:
                duplicate = index
                break
        if duplicate is None:
            result.append(item)
        elif item["confidence"] > result[duplicate]["confidence"]:
            result[duplicate] = item
    return sorted(result, key=lambda item: (min(p[1] for p in item["bbox"]), min(p[0] for p in item["bbox"])))


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    root = Path(os.environ["EASYOCR_TEMP_DIR"]).resolve()
    reader = None
    for line in sys.stdin:
        request_id = None
        stage = "input"
        try:
            request = json.loads(line)
            request_id = request["id"]
            path = Path(request["path"]).resolve()
            if path.parent != root or path.suffix.lower() != ".png":
                raise ValueError("invalid image path")
            # Keep stdout exclusively for the bounded JSON protocol.
            with contextlib.redirect_stdout(sys.stderr):
                stage = "dependencies"
                import easyocr
                import numpy as np
                import torch
                from PIL import Image
                if easyocr.__version__ != PIPELINE["engineVersion"]:
                    raise ValueError("unsupported EasyOCR version")
                if reader is None:
                    stage = "models"
                    torch.set_num_threads(PIPELINE["torchThreads"])
                    reader = easyocr.Reader(SETTINGS["languages"], gpu=SETTINGS["gpu"],
                        model_storage_directory=os.environ["EASYOCR_MODEL_DIR"],
                        user_network_directory=os.environ["EASYOCR_USER_DIR"], verbose=False)
                with Image.open(path) as image:
                    stage = "input"
                    width, height = image.size
                    if width * height > int(os.environ["EASYOCR_MAX_PIXELS"]) or image.format != "PNG":
                        raise ValueError("invalid image")
                    image = image.convert("RGB")
                    detections = []
                    stage = "recognize"
                    for top in tile_starts(height):
                        # EasyOCR's ndarray input follows OpenCV's BGR convention.
                        pixels = np.array(image.crop((0, top, width, min(top + TILE_HEIGHT, height))))[:, :, ::-1].copy()
                        raw = reader.readtext(pixels, detail=1, paragraph=SETTINGS["paragraph"], decoder=SETTINGS["decoder"],
                            workers=SETTINGS["workers"], batch_size=SETTINGS["batchSize"], canvas_size=SETTINGS["canvasSize"])
                        detections.extend(normalize_detections(raw, top, width, height))
                detections = deduplicate(detections)
            result = {"id": request_id, "ok": True, "pipelineVersion": PIPELINE_VERSION,
                "engineVersion": easyocr.__version__, "torchVersion": torch.__version__,
                "width": width, "height": height, "detections": detections,
                "text": "\n".join(item["text"] for item in detections),
                "meanConfidence": sum(item["confidence"] for item in detections) / len(detections) if detections else None}
        except Exception:
            # Exception strings can contain local paths or download URLs.
            code = {"input": "EASYOCR_INPUT_INVALID", "dependencies": "EASYOCR_DEPENDENCY_FAILED",
                "models": "EASYOCR_MODEL_INIT_FAILED", "recognize": "EASYOCR_RECOGNITION_FAILED"}[stage]
            result = {"id": request_id, "ok": False, "code": code}
        print(json.dumps(result, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
