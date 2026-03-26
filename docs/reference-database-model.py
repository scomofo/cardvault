from sqlalchemy import Column, Integer, Float, String, Text, Index
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Card(Base):
    """
    SQLAlchemy model extension for CardVault.
    Add these fields to your existing Card class.
    """
    __tablename__ = 'cards'

    # Existing primary keys and card info (player, set, etc.) would go here
    id = Column(Integer, primary_key=True)
    
    # --- GRADING ATTRIBUTES ---
    # Store individual sub-grades for transparency
    centering = Column(Integer, default=10, nullable=False)
    corners = Column(Integer, default=10, nullable=False)
    edges = Column(Integer, default=10, nullable=False)
    surface = Column(Integer, default=10, nullable=False)
    
    # Store calculated values to avoid expensive compute on UI renders
    projected_grade = Column(Float)
    
    # Index vault_status for high-speed filtering (Green/Yellow/Red)
    vault_status = Column(String(10), index=True)
    
    # The full text generated for eBay listings
    condition_report = Column(Text)

    def refresh_grading(self, engine):
        """
        Updates all grading metadata using the GradingEngine logic.
        Call this in your save() method or via a background task.
        """
        self.projected_grade = engine.calculate_projection(
            self.centering, self.corners, self.edges, self.surface
        )
        self.vault_status = engine.assign_vault_status(self.projected_grade)
        self.condition_report = engine.generate_condition_report(
            self.centering, self.corners, self.edges, self.surface
        )

# Database Index for the 'Quick-Log' status
# Critical for when the vault scales to thousands of cards.
Index('idx_vault_pile_status', Card.vault_status)