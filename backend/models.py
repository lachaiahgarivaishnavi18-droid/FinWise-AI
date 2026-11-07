from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint, UniqueConstraint

db = SQLAlchemy()


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Timestamp:
    created_at = db.Column(db.DateTime, default=now, nullable=False)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now, nullable=False)


class User(Timestamp, db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(254), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    token_version = db.Column(db.Integer, default=0, nullable=False)


class Owned:
    user_id = db.Column(db.Integer, db.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)


class UserProfile(Timestamp, Owned, db.Model):
    __tablename__ = 'user_profiles'
    id = db.Column(db.Integer, primary_key=True)
    currency = db.Column(db.String(3), default='INR', nullable=False)
    monthly_income = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    fixed_expenses = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    variable_expenses = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    savings = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    debt = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    preferred_savings = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    income_source = db.Column(db.String(100), default='Salary')
    risk_preference = db.Column(db.String(20), default='Conservative')
    responsibilities = db.Column(db.Text, default='')
    preferences = db.Column(db.Text, default='')
    short_term_goals = db.Column(db.Text, default='')
    long_term_goals = db.Column(db.Text, default='')
    __table_args__ = (UniqueConstraint('user_id'),)


class ExpenseCategory(db.Model):
    __tablename__ = 'expense_categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(40), unique=True, nullable=False)


class Transaction(Timestamp, Owned):
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    description = db.Column(db.String(250), nullable=False)
    date = db.Column(db.Date, nullable=False, index=True)
    recurring = db.Column(db.Boolean, default=False, nullable=False)


class IncomeRecord(Transaction, db.Model):
    __tablename__ = 'income_records'
    source = db.Column(db.String(40), default='Salary', nullable=False)
    __table_args__ = (CheckConstraint('amount > 0'),)


class ExpenseRecord(Transaction, db.Model):
    __tablename__ = 'expense_records'
    category_id = db.Column(db.Integer, db.ForeignKey('expense_categories.id'), nullable=False)
    category = db.relationship('ExpenseCategory')
    __table_args__ = (CheckConstraint('amount > 0'),)


class Budget(Timestamp, Owned, db.Model):
    __tablename__ = 'budgets'
    id = db.Column(db.Integer, primary_key=True)
    month = db.Column(db.String(7), nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('expense_categories.id'), nullable=False)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    status = db.Column(db.String(20), default='accepted', nullable=False)
    __table_args__ = (UniqueConstraint('user_id', 'month', 'category_id'), CheckConstraint('amount >= 0'))


class FinancialGoal(Timestamp, Owned, db.Model):
    __tablename__ = 'financial_goals'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    target_amount = db.Column(db.Numeric(14, 2), nullable=False)
    initial_saved = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    target_date = db.Column(db.Date, nullable=False)
    priority = db.Column(db.String(20), default='Medium')
    monthly_contribution = db.Column(db.Numeric(14, 2), default=0, nullable=False)
    contributions = db.relationship('GoalContribution', cascade='all, delete-orphan', lazy='select')
    __table_args__ = (CheckConstraint('target_amount > 0'), CheckConstraint('initial_saved >= 0'), CheckConstraint('monthly_contribution >= 0'))


class GoalContribution(Timestamp, Owned, db.Model):
    __tablename__ = 'goal_contributions'
    id = db.Column(db.Integer, primary_key=True)
    goal_id = db.Column(db.Integer, db.ForeignKey('financial_goals.id', ondelete='CASCADE'), nullable=False, index=True)
    amount = db.Column(db.Numeric(14, 2), nullable=False)
    date = db.Column(db.Date, nullable=False)
    __table_args__ = (CheckConstraint('amount > 0'),)


class Conversation(Timestamp, Owned, db.Model):
    __tablename__ = 'conversations'
    id = db.Column(db.Integer, primary_key=True)
    messages = db.relationship('Message', cascade='all, delete-orphan')


class Message(Timestamp, Owned, db.Model):
    __tablename__ = 'messages'
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False, index=True)
    role = db.Column(db.String(20), nullable=False)
    content = db.Column(db.Text, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)


class UserMemory(Timestamp, Owned, db.Model):
    __tablename__ = 'user_memories'
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.String(2000), nullable=False)
    kind = db.Column(db.String(20), nullable=False, default='long_term')
    status = db.Column(db.String(20), nullable=False, default='approved')
    expires_at = db.Column(db.DateTime, nullable=False)
    embedding = db.relationship('MemoryEmbedding', uselist=False, cascade='all, delete-orphan')
    __table_args__ = (UniqueConstraint('user_id', 'content'),)


class MemoryEmbedding(Owned, db.Model):
    __tablename__ = 'memory_embeddings'
    id = db.Column(db.Integer, primary_key=True)
    memory_id = db.Column(db.Integer, db.ForeignKey('user_memories.id', ondelete='CASCADE'), unique=True, nullable=False)
    vector = db.Column(db.JSON, nullable=False)
    model = db.Column(db.String(150), nullable=False)
    # PostgreSQL migration adds native vector(384) and an HNSW index.


class Recommendation(Timestamp, Owned, db.Model):
    __tablename__ = 'recommendations'
    id = db.Column(db.Integer, primary_key=True)
    fingerprint = db.Column(db.String(150), nullable=False)
    title = db.Column(db.String(150), nullable=False)
    explanation = db.Column(db.Text, nullable=False)
    impact = db.Column(db.Numeric(14, 2), default=0)
    priority = db.Column(db.String(20), default='Medium')
    action = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default='pending')
    __table_args__ = (UniqueConstraint('user_id', 'fingerprint'),)


class MLPrediction(Timestamp, Owned, db.Model):
    __tablename__ = 'ml_predictions'
    id = db.Column(db.Integer, primary_key=True)
    model = db.Column(db.String(50), nullable=False)
    result = db.Column(db.JSON, nullable=False)


class NotificationPreference(Timestamp, Owned, db.Model):
    __tablename__ = 'notification_preferences'
    id = db.Column(db.Integer, primary_key=True)
    memory_enabled = db.Column(db.Boolean, default=True, nullable=False)
    chat_history = db.Column(db.Boolean, default=False, nullable=False)
    budget_alerts = db.Column(db.Boolean, default=True, nullable=False)
    __table_args__ = (UniqueConstraint('user_id'),)
