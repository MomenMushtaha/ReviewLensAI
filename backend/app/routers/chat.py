from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.agents.rag_agent import answer
from app.services.transcript import save_transcript, get_transcript, list_transcripts

router = APIRouter()

# In-memory chat history: session_id → list of {role, content}
_chat_histories: dict[str, list[dict]] = {}


class ChatRequest(BaseModel):
    project_id: str
    session_id: str
    message: str


class SourceCitation(BaseModel):
    review_id: str
    excerpt: str
    rating: float | None
    reviewer_name: str | None


class ChatResponse(BaseModel):
    response: str
    sources: list[SourceCitation]
    guardrail_triggered: bool
    guardrail_category: str | None
    session_id: str


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == req.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != "ready":
        raise HTTPException(status_code=400, detail=f"Project pipeline not complete (status: {project.status})")

    history = _chat_histories.get(req.session_id, [])

    response_data = await answer(
        question=req.message,
        project=project,
        history=history,
        db=db,
    )

    # Update history (keep last 6 turns = 3 user + 3 assistant)
    history.append({"role": "user", "content": req.message})
    history.append({"role": "assistant", "content": response_data["response"]})
    _chat_histories[req.session_id] = history[-12:]  # 6 turns × 2

    # Auto-save transcript after each exchange
    save_transcript(
        session_id=req.session_id,
        project_id=req.project_id,
        project_name=project.product_name or "Unknown",
        platform=project.platform or "Unknown",
        user_message=req.message,
        assistant_response=response_data["response"],
        sources=response_data["sources"],
        guardrail_triggered=response_data["guardrail_triggered"],
        guardrail_category=response_data.get("guardrail_category"),
        history=history,
    )

    return ChatResponse(
        response=response_data["response"],
        sources=[SourceCitation(**s) for s in response_data["sources"]],
        guardrail_triggered=response_data["guardrail_triggered"],
        guardrail_category=response_data.get("guardrail_category"),
        session_id=req.session_id,
    )


@router.get("/transcripts")
async def list_all_transcripts(project_id: str | None = None):
    """List all transcripts, optionally filtered by project_id."""
    return list_transcripts(project_id)


@router.get("/transcripts/{session_id}")
async def get_session_transcript(session_id: str):
    """Get a specific transcript by session_id."""
    transcript = get_transcript(session_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return transcript
