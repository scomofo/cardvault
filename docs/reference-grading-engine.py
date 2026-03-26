import math

class GradingEngine:
    """
    Core logic for CardVault grading assessments.
    Implements the 'Weakest Link' grading philosophy used by PSA/BGS.
    """
    
    @staticmethod
    def calculate_projection(centering, corners, edges, surface):
        """
        Calculates a realistic grade projection.
        The final grade is capped at (Lowest Sub-grade + 1.0).
        """
        scores = [centering, corners, edges, surface]
        avg = sum(scores) / len(scores)
        floor = min(scores)
        
        # Capping logic: Average is limited by the weakest attribute
        projected = min(avg, floor + 1.0)
        
        # Round to nearest 0.5 for hobby standard
        return math.floor(projected * 2) / 2

    @staticmethod
    def assign_vault_status(projected_grade):
        """Categorizes cards into physical workflow piles (Traffic Light System)."""
        if projected_grade >= 9.5:
            return "GREEN"  # High-Value Grading Candidate
        elif projected_grade >= 8.5:
            return "YELLOW" # Solid Raw Sale
        else:
            return "RED"    # Bulk / Discount Bin

    @staticmethod
    def generate_condition_report(centering, corners, edges, surface):
        """Generates automated transparency notes for marketplace descriptions."""
        flaws = []
        if centering < 9: flaws.append("Centering shows visible offset.")
        if corners < 9:   flaws.append("Minor corner softening or whitening.")
        if edges < 9:     flaws.append("Slight edge chipping or silvering.")
        if surface < 9:   flaws.append("Surface shows light scuffs/dimples under light.")
        
        report = (
            "📋 **CardVault Condition Report** 📋\n"
            f"- Centering: {centering}/10\n"
            f"- Corners: {corners}/10\n"
            f"- Edges: {edges}/10\n"
            f"- Surface: {surface}/10\n\n"
            "**Detailed Observation:** "
        )
        
        report += " ".join(flaws) if flaws else "Card appears extremely sharp and well-preserved."
        return report