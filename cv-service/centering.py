"""Card centering analysis using OpenCV contour detection."""

import cv2
import numpy as np


def calculate_centering(warped_image: np.ndarray) -> dict:
    """
    Calculate centering ratios from a perspective-corrected card image.

    Finds the inner art frame (second-largest contour) and measures
    the border widths on all four sides.

    Returns:
        {
            "lr": "48/52",       # left/right ratio
            "tb": "50/50",       # top/bottom ratio
            "left": 48, "right": 52, "top": 50, "bottom": 50,
            "is_gem": true,      # both ratios within 45-55%
            "score": 9.5,        # 1-10 score for grading slider
        }
    """
    h, w = warped_image.shape[:2]
    gray = cv2.cvtColor(warped_image, cv2.COLOR_BGR2GRAY)

    # Try Otsu first, then adaptive threshold
    results = []
    for thresh_img in _get_thresholds(gray):
        result = _measure_from_threshold(thresh_img, w, h)
        if result:
            results.append(result)

    if not results:
        return _default_centering()

    # Pick the result closest to center (most likely correct detection)
    best = min(results, key=lambda r: abs(r["left"] - 50) + abs(r["top"] - 50))
    return best


def _get_thresholds(gray):
    """Generate multiple threshold images for robust detection."""
    # Otsu
    _, t1 = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    yield t1

    # Adaptive
    t2 = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 21, 5)
    yield t2

    # Fixed threshold (works well on white-bordered cards)
    _, t3 = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
    yield t3


def _measure_from_threshold(thresh, img_w, img_h):
    """Attempt to find inner art frame from a threshold image."""
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)

    if len(contours) < 2:
        return None

    # Sort by area, skip the largest (card border), take the next
    sorted_contours = sorted(contours, key=cv2.contourArea, reverse=True)

    for cnt in sorted_contours[1:5]:
        area = cv2.contourArea(cnt)
        # Inner frame should be 30-90% of total area
        area_ratio = area / (img_w * img_h)
        if area_ratio < 0.3 or area_ratio > 0.9:
            continue

        x, y, w, h = cv2.boundingRect(cnt)

        left = x
        right = img_w - (x + w)
        top = y
        bottom = img_h - (y + h)

        # Sanity check: borders should be reasonable (2-20% of dimension)
        min_border_h = img_w * 0.02
        max_border_h = img_w * 0.20
        min_border_v = img_h * 0.02
        max_border_v = img_h * 0.20

        if not (min_border_h <= left <= max_border_h and min_border_h <= right <= max_border_h):
            continue
        if not (min_border_v <= top <= max_border_v and min_border_v <= bottom <= max_border_v):
            continue

        lr_total = left + right
        tb_total = top + bottom

        if lr_total == 0 or tb_total == 0:
            continue

        left_pct = int(round(left / lr_total * 100))
        right_pct = 100 - left_pct
        top_pct = int(round(top / tb_total * 100))
        bottom_pct = 100 - top_pct

        score = _ratios_to_score(left_pct, top_pct)
        is_gem = (45 <= left_pct <= 55) and (45 <= top_pct <= 55)

        return {
            "lr": f"{left_pct}/{right_pct}",
            "tb": f"{top_pct}/{bottom_pct}",
            "left": left_pct,
            "right": right_pct,
            "top": top_pct,
            "bottom": bottom_pct,
            "is_gem": is_gem,
            "score": score,
        }

    return None


def _ratios_to_score(left_pct: int, top_pct: int) -> float:
    """
    Convert centering ratios to a 1-10 score.

    50/50 = 10.0 (perfect)
    45/55 or 55/45 = 9.5 (gem range)
    40/60 = 8.5
    35/65 = 7.0
    30/70 = 5.0
    <30/70 = 1-4
    """
    h_deviation = abs(left_pct - 50)
    v_deviation = abs(top_pct - 50)
    worst_deviation = max(h_deviation, v_deviation)

    if worst_deviation <= 2:
        return 10.0
    elif worst_deviation <= 5:
        return 9.5
    elif worst_deviation <= 8:
        return 9.0
    elif worst_deviation <= 10:
        return 8.5
    elif worst_deviation <= 13:
        return 8.0
    elif worst_deviation <= 15:
        return 7.0
    elif worst_deviation <= 20:
        return 5.0
    else:
        return max(1.0, 5.0 - (worst_deviation - 20) * 0.2)


def _default_centering():
    """Return a safe default when detection fails."""
    return {
        "lr": "50/50",
        "tb": "50/50",
        "left": 50, "right": 50,
        "top": 50, "bottom": 50,
        "is_gem": True,
        "score": 10.0,
        "detected": False,
    }


def ratios_to_score(lr: str, tb: str) -> float:
    """Convert ratio strings like '48/52' to a 1-10 score. Used by JS bridge."""
    try:
        left = int(lr.split("/")[0])
        top = int(tb.split("/")[0])
        return _ratios_to_score(left, top)
    except (ValueError, IndexError):
        return 10.0
