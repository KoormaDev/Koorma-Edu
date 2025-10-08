"""Remove teacher role and add super_admin role

Revision ID: 1efe8b83f299
Revises: 066902d88f9c
Create Date: 2025-08-25 13:03:56.073956

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1efe8b83f299'
down_revision = '066902d88f9c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add super_admin role to enum
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin'")
    
    # Update any existing teacher users to admin (if any)
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'teacher'")


def downgrade() -> None:
    # Convert super_admin back to admin
    op.execute("UPDATE users SET role = 'admin' WHERE role = 'super_admin'")
    
    # Note: Cannot remove enum values in PostgreSQL, so we leave super_admin in enum