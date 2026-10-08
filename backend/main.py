"""
Passport Photo Maker — backend (Step 8c)
FastAPI + background removal (rembg) + even studio relighting (OpenCV)

Run:   uvicorn main:app --reload --port 8000
Docs:  http://localhost:8000/docs
"""

import cv2
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from rembg import new_session, remove


DEFAULT_MODEL = "isnet-general-use"

ALLOWED_MODELS = {
    "isnet-general-use",
    "u2net",
    "u2net_human_seg",
    "silueta",
    "u2netp",
}

app = FastAPI(title="Passport Photo Maker API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

_sessions: dict = {}


def get_session(model_name: str):
    if model_name not in _sessions:
        _sessions[model_name] = new_session(model_name)
    return _sessions[model_name]


@app.get("/health")
def health():
    return {"status": "ok", "default_model": DEFAULT_MODEL}


@app.post("/removebg")
async def removebg(
    file: UploadFile = File(...),
    model: str = Query(DEFAULT_MODEL, description="rembg model to use"),
    post_process: bool = Query(True, description="clean up mask edges"),
):
    """Upload a photo → transparent PNG (person only)."""

    if model not in ALLOWED_MODELS:
        raise HTTPException(
            400, f"Unknown model '{model}'. Choose one of: {sorted(ALLOWED_MODELS)}"
        )

    data = await file.read()
    if not data:
        raise HTTPException(400, "Uploaded file is empty")

    try:
        session = get_session(model)
        png_bytes = remove(data, session=session, post_process_mask=post_process)
    except Exception as exc:
        raise HTTPException(500, f"Background removal failed: {exc}")

    return Response(content=png_bytes, media_type="image/png")


# =========================================================
# RELIGHTING — EVEN studio light layer
# =========================================================

def relight_person(bgr: np.ndarray, alpha: np.ndarray,
                   flatten: float, target: float) -> np.ndarray:
    """
    Makes the lighting EVEN across the whole person:

    1) luminance channel (LAB L) is extracted
    2) lighting layer = very large blur of L
       → contains the side-to-side gradient + shadows,
         but NOT the facial detail
    3) correction = (target / lighting layer) ^ flatten
       → dark side gets a big boost, bright side gets little/none
    4) detail + flat light are merged back

    flatten: 0 = keep original light · 1 = perfectly even studio light
    Only tonal values change — face structure is untouched.
    """
    mask = alpha > 16

    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    L = lab[:, :, 0].astype(np.float32)

    person_L = L[mask]
    if person_L.size == 0:
        return bgr

    # fill outside-mask with person average so the blur
    # is not dragged down by transparent (black) borders
    fill = float(person_L.mean())
    L_filled = np.where(mask, L, fill)

    # 1) LIGHTING LAYER
    h, w = bgr.shape[:2]
    sigma = max(h, w) / 6.0
    illum = cv2.GaussianBlur(L_filled, (0, 0), sigmaX=sigma)
    illum = np.maximum(illum, 1.0)

    # 2) CORRECTION toward flat studio light
    ratio = target / illum
    ratio = np.clip(ratio, 0.45, 2.2)      # keep corrections sane

    # 3) flatten controls HOW MUCH of the difference is removed
    if flatten < 1.0:
        ratio = np.power(ratio, flatten)

    # 4) APPLY (same gain to all channels → colors preserved)
    L_new = np.clip(L * ratio, 0, 255).astype(np.uint8)

    # gentle local contrast so skin/clothes texture stays natural
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    L_new = clahe.apply(L_new)

    lab[:, :, 0] = L_new
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


@app.post("/relight")
async def relight_endpoint(
    file: UploadFile = File(...),
    flatten: float = Query(0.8, ge=0.0, le=1.0,
                           description="0 = keep original light, 1 = perfectly even studio light"),
    target: float = Query(185.0, ge=80.0, le=245.0,
                          description="overall studio brightness (LAB L 0-255)"),
):
    """Upload a (preferably transparent) PNG → evenly relit PNG.
    Dark sides are lifted, bright sides are balanced, shadows flattened.
    Alpha channel is preserved exactly."""

    data = await file.read()
    if not data:
        raise HTTPException(400, "Uploaded file is empty")

    arr = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise HTTPException(400, "Could not decode image")

    if img.ndim == 3 and img.shape[2] == 4:
        bgr, alpha = img[:, :, :3], img[:, :, 3]
    elif img.ndim == 3 and img.shape[2] == 3:
        bgr = img
        alpha = np.full(img.shape[:2], 255, dtype=np.uint8)
    else:
        raise HTTPException(400, "Unsupported image format")

    try:
        out_bgr = relight_person(bgr, alpha, flatten, target)
    except Exception as exc:
        raise HTTPException(500, f"Relight failed: {exc}")

    out = np.dstack([out_bgr, alpha])
    ok, buf = cv2.imencode(".png", out)
    if not ok:
        raise HTTPException(500, "Could not encode output PNG")

    return Response(content=buf.tobytes(), media_type="image/png")