"""
Centralised structured logging for Google Hub backend.

Usage:
    from .logger import get_logger
    log = get_logger(__name__)
    log.info("user logged in", extra={"google_id": "...", "email": "..."})

All log lines are emitted as JSON to stdout so they work with any
log aggregator (CloudWatch, Datadog, plain journald, etc.).
"""
import json
import logging
import sys
import time
from typing import Any


class _JsonFormatter(logging.Formatter):
    """Format every log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts":      self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level":   record.levelname,
            "logger":  record.name,
            "msg":     record.getMessage(),
        }
        # Merge any extra= kwargs the caller passed in
        for key, val in record.__dict__.items():
            if key not in {
                "name", "msg", "args", "levelname", "levelno", "pathname",
                "filename", "module", "exc_info", "exc_text", "stack_info",
                "lineno", "funcName", "created", "msecs", "relativeCreated",
                "thread", "threadName", "processName", "process", "message",
                "taskName", "logger", "ts", "level",   # also block our own keys
            }:
                payload[key] = val

        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)

        return json.dumps(payload, default=str)


def _build_handler() -> logging.StreamHandler:
    h = logging.StreamHandler(sys.stdout)
    h.setFormatter(_JsonFormatter())
    return h


# Root logger — configure once
_root = logging.getLogger("google_hub")
_root.setLevel(logging.DEBUG)
if not _root.handlers:
    _root.addHandler(_build_handler())
_root.propagate = False


def get_logger(name: str) -> logging.Logger:
    """Return a child logger namespaced under google_hub.<name>."""
    return _root.getChild(name.replace("google_hub.", ""))
