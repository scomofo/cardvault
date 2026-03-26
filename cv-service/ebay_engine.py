"""eBay File Exchange CSV generator with 2026 mandatory condition descriptors."""

import csv
import io
from datetime import datetime


# eBay 2026 condition descriptor mappings
def centering_descriptor(score: float) -> str:
    if score >= 9.5:
        return "Gem Mint Centering"
    elif score >= 9.0:
        return "Well Centered"
    elif score >= 7.0:
        return "Slightly Off Center"
    return "Off Center"


def corner_descriptor(score: float) -> str:
    if score >= 9.5:
        return "Sharp"
    elif score >= 8.5:
        return "Slightly Rounded"
    return "Rounded"


def edge_descriptor(score: float) -> str:
    if score >= 9.5:
        return "None"
    elif score >= 8.5:
        return "Minor"
    return "Moderate"


def condition_id_from_grade(grade: float) -> int:
    """Map overall grade to eBay ConditionID."""
    if grade >= 9.5:
        return 2750   # Like New/Near Mint
    elif grade >= 8.0:
        return 3000   # Used - Very Good
    elif grade >= 6.0:
        return 4000   # Used - Good
    return 5000        # Used - Acceptable


def generate_ebay_csv(cards: list, currency: str = "CAD") -> str:
    """
    Generate eBay File Exchange CSV from a list of card dicts.

    Args:
        cards: list of card dicts with fields:
            name, set, year, number, parallel, condition, costBasis,
            priceEstimate.mid, centering (1-10), corners (1-10),
            edges (1-10), surface (1-10), projected_grade
        currency: "CAD" or "USD"

    Returns:
        CSV string ready for eBay File Exchange upload.
    """
    site = "Country=CA|Currency=CAD" if currency == "CAD" else "Country=US|Currency=USD"
    category = "213" if currency == "CAD" else "212"  # Trading Card Singles

    output = io.StringIO()
    writer = csv.writer(output)

    # Header row
    writer.writerow([
        f"Action(SiteID=US|{site})",
        "Category",
        "Title",
        "Description",
        "ConditionID",
        "Format",
        "StartPrice",
        "Quantity",
        "Duration",
        "Location",
        "ShippingService-1:Option",
        "ShippingService-1:Cost",
        "DispatchTimeMax",
        "ReturnsAcceptedOption",
        "C:Player",
        "C:Season",
        "C:Set",
        "C:Parallel/Variety",
        "C:Graded",
        "C:Centering",
        "C:Corner_Sharpness",
        "C:Edge_Chipping",
    ])

    for card in cards:
        # Build title (max 80 chars)
        title_parts = [
            card.get("year", ""),
            card.get("set", ""),
            card.get("name", ""),
            f"#{card['number']}" if card.get("number") else "",
            card.get("parallel", ""),
        ]
        title = " ".join(p for p in title_parts if p).strip()[:80]

        # Price
        price_est = card.get("priceEstimate", {})
        if isinstance(price_est, str):
            price = price_est
        else:
            price = price_est.get("mid", "0.99") if isinstance(price_est, dict) else "0.99"

        # Grade data
        centering = float(card.get("centering", 10))
        corners = float(card.get("corners", 10))
        edges = float(card.get("edges", 10))
        grade = float(card.get("projected_grade", 9))

        cond_id = condition_id_from_grade(grade)

        # Player extraction
        name = card.get("name", "")
        player = name  # For non-sports, use full name

        # Shipping
        ship_service = "CA_StandardInternationalFlat" if currency == "CAD" else "USPSFirstClass"
        ship_cost = "4.99" if currency == "CAD" else "3.99"
        location = "Alberta, Canada" if currency == "CAD" else "Alberta, Canada"

        writer.writerow([
            "Add",
            category,
            title,
            f"Condition: {card.get('condition', 'Near Mint')}. Ships in penny sleeve + toploader from Canada.",
            str(cond_id),
            "FixedPrice",
            str(price),
            "1",
            "GTC",
            location,
            ship_service,
            ship_cost,
            "3",
            "ReturnsAccepted",
            player,
            card.get("year", ""),
            card.get("set", ""),
            card.get("parallel", card.get("rarity", "")),
            "Yes" if card.get("gradeCompany") else "No",
            centering_descriptor(centering),
            corner_descriptor(corners),
            edge_descriptor(edges),
        ])

    return output.getvalue()
