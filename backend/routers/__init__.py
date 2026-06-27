"""Re-export all routers so main.py has a single clean import."""
from . import calendar, docs, drive, gmail, preflight, setup, sheets, youtube

__all__ = ["calendar", "docs", "drive", "gmail", "preflight", "setup", "sheets", "youtube"]
