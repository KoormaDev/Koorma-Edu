"""Add content_summaries table

Revision ID: a1b2c3d4e5f6
Revises: 1efe8b83f299
Create Date: 2025-01-17 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '1efe8b83f299'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create content_summaries table
    op.create_table('content_summaries',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('summary_text', sa.Text(), nullable=False),
        sa.Column('key_topics', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('content_type', sa.String(length=50), nullable=False),
        sa.Column('difficulty_level', sa.String(length=20), nullable=True),
        sa.Column('estimated_reading_time', sa.Integer(), nullable=True),
        sa.Column('learning_objectives', postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['content_id'], ['content.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Create index on content_id for better query performance
    op.create_index(op.f('ix_content_summaries_content_id'), 'content_summaries', ['content_id'], unique=False)


def downgrade() -> None:
    # Drop index first
    op.drop_index(op.f('ix_content_summaries_content_id'), table_name='content_summaries')

    # Drop table
    op.drop_table('content_summaries')