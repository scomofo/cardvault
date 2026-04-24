"""CardVault CV service for card detection, perspective correction, and centering."""

import base64
import os
import time

import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from card_detector import detect_card, perspective_warp
from centering import calculate_centering

app = FastAPI(title="CardVault CV Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_origin_regex=r"^https?://(?:localhost|127\.0\.0\.1|(?:[a-z0-9-]+\.)*local|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "cardvault-cv", "version": "1.0.0"}


@app.post("/analyze")
async def analyze_image(file: UploadFile = File(None), image_b64: str = None):
    """
    Analyze a card image: detect card, warp perspective, calculate centering.

    Accepts either:
    - multipart file upload (file param)
    - JSON body with base64 image (image_b64 param)
    """
    start = time.time()

    try:
        if file:
            contents = await file.read()
        elif image_b64:
            if "," in image_b64:
                image_b64 = image_b64.split(",", 1)[1]
            contents = base64.b64decode(image_b64)
        else:
            return JSONResponse(status_code=400, content={"error": "No image provided"})

        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image data"})
    except Exception as error:
        return JSONResponse(status_code=400, content={"error": f"Image decode failed: {str(error)}"})

    detection = detect_card(img)

    if not detection["found"]:
        return {
            "card_detected": False,
            "error": "Card edges not found - try a darker background or better lighting",
            "processing_ms": int((time.time() - start) * 1000),
        }

    warped, warp_quality = perspective_warp(img, detection["corners"])
    centering = calculate_centering(warped)

    _, buffer = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    warped_b64 = base64.b64encode(buffer).decode("utf-8")
    processing_ms = int((time.time() - start) * 1000)

    return {
        "card_detected": True,
        "detection_confidence": detection["confidence"],
        "warp_quality": warp_quality,
        "centering": {
            "lr": centering["lr"],
            "tb": centering["tb"],
            "left": centering["left"],
            "right": centering["right"],
            "top": centering["top"],
            "bottom": centering["bottom"],
            "is_gem": centering["is_gem"],
            "score": centering["score"],
        },
        "warped_image": f"data:image/jpeg;base64,{warped_b64}",
        "processing_ms": processing_ms,
    }


@app.post("/analyze-json")
async def analyze_json(body: dict):
    """Accept JSON body with image_b64 field for proxied requests from Express."""
    image_b64 = body.get("image_b64", body.get("image", ""))
    if not image_b64:
        return JSONResponse(status_code=400, content={"error": "No image_b64 in body"})

    start = time.time()

    try:
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        contents = base64.b64decode(image_b64)
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return JSONResponse(status_code=400, content={"error": "Invalid image data"})
    except Exception as error:
        return JSONResponse(status_code=400, content={"error": f"Image decode failed: {str(error)}"})

    detection = detect_card(img)
    if not detection["found"]:
        return {
            "card_detected": False,
            "error": "Card edges not found",
            "processing_ms": int((time.time() - start) * 1000),
        }

    warped, warp_quality = perspective_warp(img, detection["corners"])
    centering = calculate_centering(warped)

    _, buffer = cv2.imencode(".jpg", warped, [cv2.IMWRITE_JPEG_QUALITY, 90])
    warped_b64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "card_detected": True,
        "detection_confidence": detection["confidence"],
        "warp_quality": warp_quality,
        "centering": {
            "lr": centering["lr"],
            "tb": centering["tb"],
            "left": centering["left"],
            "right": centering["right"],
            "top": centering["top"],
            "bottom": centering["bottom"],
            "is_gem": centering["is_gem"],
            "score": centering["score"],
        },
        "warped_image": f"data:image/jpeg;base64,{warped_b64}",
        "processing_ms": int((time.time() - start) * 1000),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("CV_HOST", "0.0.0.0"),
        port=int(os.getenv("CV_PORT", "8000")),
    )
