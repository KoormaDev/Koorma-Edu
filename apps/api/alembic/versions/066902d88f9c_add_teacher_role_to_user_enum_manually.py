"""Add teacher role to user enum manually

Revision ID: 066902d88f9c
Revises: a8acc7bf8934
Create Date: 2025-08-25 12:25:05.584696

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '066902d88f9c'
down_revision = 'a8acc7bf8934'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add teacher value to user_role enum
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'teacher'")


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values
    # This would require recreating the enum and updating all references
    pass