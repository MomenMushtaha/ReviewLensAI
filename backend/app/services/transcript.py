"""
Transcript Service - Auto-saves chat sessions to /ai-transcripts/ directory.

Each transcript includes:
- Project ID and name
- Session ID
- Timestamp
- Model info
- Full conversation history
- Retrieved sources for each exchange
"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any

from app.config import settings

# Transcript directory at project root
TRANSCRIPT_DIR = Path(__file__).parent.parent.parent.parent / "ai-transcripts"


def ensure_transcript_dir():
    """Create the ai-transcripts directory if it doesn't exist."""
    TRANSCRIPT_DIR.mkdir(parents=True, exist_ok=True)


def _get_transcript_path(session_id: str) -> Path:
    """Get the file path for a session's transcript."""
    return TRANSCRIPT_DIR / f"{session_id}.json"


def save_transcript(
    session_id: str,
    project_id: str,
    project_name: str,
    platform: str,
    user_message: str,
    assistant_response: str,
    sources: list[dict],
    guardrail_triggered: bool,
    guardrail_category: str | None,
    history: list[dict],
) -> None:
    """
    Save or update a chat transcript after each exchange.
    
    Creates a new transcript file if session doesn't exist,
    or appends the new exchange to existing transcript.
    """
    ensure_transcript_dir()
    
    transcript_path = _get_transcript_path(session_id)
    
    # Load existing transcript or create new one
    if transcript_path.exists():
        with open(transcript_path, "r") as f:
            transcript = json.load(f)
    else:
        transcript = {
            "session_id": session_id,
            "project_id": project_id,
            "project_name": project_name,
            "platform": platform,
            "model": settings.openai_model,
            "created_at": datetime.utcnow().isoformat() + "Z",
            "updated_at": None,
            "exchanges": [],
        }
    
    # Create the new exchange record
    exchange = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "user_message": user_message,
        "assistant_response": assistant_response,
        "sources": [
            {
                "review_id": s.get("review_id"),
                "excerpt": s.get("excerpt"),
                "rating": s.get("rating"),
                "reviewer_name": s.get("reviewer_name"),
            }
            for s in sources
        ],
        "guardrail_triggered": guardrail_triggered,
        "guardrail_category": guardrail_category,
    }
    
    transcript["exchanges"].append(exchange)
    transcript["updated_at"] = datetime.utcnow().isoformat() + "Z"
    transcript["total_exchanges"] = len(transcript["exchanges"])
    
    # Save the updated transcript
    with open(transcript_path, "w") as f:
        json.dump(transcript, f, indent=2, default=str)


def get_transcript(session_id: str) -> dict | None:
    """Retrieve a transcript by session ID."""
    transcript_path = _get_transcript_path(session_id)
    if not transcript_path.exists():
        return None
    
    with open(transcript_path, "r") as f:
        return json.load(f)


def list_transcripts(project_id: str | None = None) -> list[dict]:
    """
    List all transcripts, optionally filtered by project_id.
    Returns metadata only (not full conversation history).
    """
    ensure_transcript_dir()
    
    transcripts = []
    for file in TRANSCRIPT_DIR.glob("*.json"):
        try:
            with open(file, "r") as f:
                data = json.load(f)
                
            if project_id and data.get("project_id") != project_id:
                continue
                
            transcripts.append({
                "session_id": data.get("session_id"),
                "project_id": data.get("project_id"),
                "project_name": data.get("project_name"),
                "created_at": data.get("created_at"),
                "updated_at": data.get("updated_at"),
                "total_exchanges": data.get("total_exchanges", 0),
            })
        except (json.JSONDecodeError, IOError):
            continue
    
    # Sort by updated_at descending
    transcripts.sort(key=lambda x: x.get("updated_at") or "", reverse=True)
    return transcripts
