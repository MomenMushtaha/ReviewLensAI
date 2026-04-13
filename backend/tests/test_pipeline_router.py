"""Tests for pipeline router endpoints."""
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)


# ── POST /api/pipeline/run ───────────────────────────────────────────────────

@patch("app.routers.pipeline.asyncio.create_task")
@patch("app.routers.pipeline.get_db")
def test_run_pipeline_url_returns_202(mock_db, mock_task):
    """Starting a pipeline with a valid URL returns 202 + project_id."""
    mock_session = AsyncMock()
    mock_db.return_value = mock_session

    resp = client.post(
        "/api/pipeline/run",
        data={"source_type": "url", "url": "https://www.trustpilot.com/review/example.com"},
    )
    assert resp.status_code == 202
    body = resp.json()
    assert "project_id" in body
    assert len(body["project_id"]) == 36  # UUID format


def test_run_pipeline_url_missing_returns_422():
    """source_type=url without a URL should fail validation."""
    resp = client.post(
        "/api/pipeline/run",
        data={"source_type": "url"},
    )
    assert resp.status_code == 422


def test_run_pipeline_csv_missing_returns_422():
    """source_type=csv without a file should fail validation."""
    resp = client.post(
        "/api/pipeline/run",
        data={"source_type": "csv"},
    )
    assert resp.status_code == 422


# ── POST /api/pipeline/cancel ────────────────────────────────────────────────

@patch("app.routers.pipeline.cancel_pipeline", return_value=True)
def test_cancel_pipeline_success(mock_cancel):
    resp = client.post("/api/pipeline/cancel/test-project-id")
    assert resp.status_code == 200
    assert resp.json() == {"status": "cancelled"}
    mock_cancel.assert_called_once_with("test-project-id")


@patch("app.routers.pipeline.cancel_pipeline", return_value=False)
def test_cancel_pipeline_not_found(mock_cancel):
    resp = client.post("/api/pipeline/cancel/nonexistent-id")
    assert resp.status_code == 404


# ── GET /api/pipeline/stream ─────────────────────────────────────────────────

@patch("app.routers.pipeline.get_or_create_queue")
@patch("app.routers.pipeline.pop_queue")
def test_stream_returns_sse(mock_pop, mock_queue):
    """SSE endpoint should return event-stream content type."""
    queue = asyncio.Queue()
    queue.put_nowait({"type": "progress", "stage": "scraping", "progress": 50, "message": "Scraping..."})
    queue.put_nowait({"type": "complete", "project_id": "test-id", "review_count": 10})
    mock_queue.return_value = queue

    resp = client.get("/api/pipeline/stream/test-id")
    assert resp.status_code == 200
    assert "text/event-stream" in resp.headers["content-type"]
    assert "event: progress" in resp.text
    assert "event: complete" in resp.text


# ── Health endpoint ──────────────────────────────────────────────────────────

def test_health_endpoint():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
