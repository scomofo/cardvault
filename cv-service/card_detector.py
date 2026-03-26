"""Card detection and perspective correction using OpenCV."""

import cv2
import numpy as np

# Standard card dimensions in pixels for warped output
CARD_W, CARD_H = 1000, 1400


def detect_card(image: np.ndarray) -> dict:
    """
    Detect the largest quadrilateral (card) in the image.
    Returns dict with 'found', 'corners', and 'confidence'.
    """
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    # Try multiple threshold methods for robustness
    methods = [
        lambda: cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
        lambda: cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2),
        lambda: cv2.Canny(blurred, 50, 150),
    ]

    best_approx = None
    best_area = 0

    for method in methods:
        thresh = method()
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            continue

        # Sort by area, take largest
        for cnt in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
            area = cv2.contourArea(cnt)
            if area < image.shape[0] * image.shape[1] * 0.05:
                continue  # Skip tiny contours (<5% of image)

            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.02 * peri, True)

            if len(approx) == 4 and area > best_area:
                best_approx = approx
                best_area = area

    if best_approx is None:
        return {"found": False, "corners": None, "confidence": 0}

    # Calculate confidence based on area ratio and rectangularity
    img_area = image.shape[0] * image.shape[1]
    area_ratio = best_area / img_area
    confidence = min(area_ratio * 2, 1.0)  # >50% of image = high confidence

    return {
        "found": True,
        "corners": best_approx.reshape(4, 2),
        "confidence": round(confidence, 2),
    }


def perspective_warp(image: np.ndarray, corners: np.ndarray) -> np.ndarray:
    """Warp a detected card into a perfect CARD_W x CARD_H rectangle."""
    rect = np.zeros((4, 2), dtype="float32")

    # Order points: top-left, top-right, bottom-right, bottom-left
    s = corners.sum(axis=1)
    rect[0] = corners[np.argmin(s)]
    rect[2] = corners[np.argmax(s)]
    diff = np.diff(corners, axis=1)
    rect[1] = corners[np.argmin(diff)]
    rect[3] = corners[np.argmax(diff)]

    dst = np.array([
        [0, 0],
        [CARD_W - 1, 0],
        [CARD_W - 1, CARD_H - 1],
        [0, CARD_H - 1],
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    warped = cv2.warpPerspective(image, M, (CARD_W, CARD_H))

    # Calculate warp quality (how rectangular the source quad was)
    angles = _quad_angles(rect)
    angle_deviation = max(abs(a - 90) for a in angles)
    warp_quality = max(0, 1.0 - angle_deviation / 45)

    return warped, round(warp_quality, 2)


def _quad_angles(pts):
    """Calculate the 4 interior angles of a quadrilateral."""
    angles = []
    for i in range(4):
        p1 = pts[i]
        p2 = pts[(i + 1) % 4]
        p3 = pts[(i - 1) % 4]
        v1 = p2 - p1
        v2 = p3 - p1
        cos_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-8)
        angle = np.degrees(np.arccos(np.clip(cos_angle, -1, 1)))
        angles.append(angle)
    return angles
