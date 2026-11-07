"""Vercel WSGI entrypoint. All records remain in the connected PostgreSQL DB."""
from backend.app import create_app

app = create_app()
