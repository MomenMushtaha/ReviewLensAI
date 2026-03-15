from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.agents.rag_agent import answer

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
    sentiment: str | None = None
    similarity: float | None = None


class ChatResponse(BaseModel):
    response: str
    sources: list[SourceCitation]
    guardrail_triggered: bool
    guardrail_category: str | None
    session_id: str
    follow_ups: list[str] = []


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

    # Update history (keep last 10 turns = 5 user + 5 assistant)
    history.append({"role": "user", "content": req.message})
    history.append({"role": "assistant", "content": response_data["response"]})
    _chat_histories[req.session_id] = history[-20:]  # 10 turns × 2

    return ChatResponse(
        response=response_data["response"],
        sources=[SourceCitation(**s) for s in response_data["sources"]],
        guardrail_triggered=response_data["guardrail_triggered"],
        guardrail_category=response_data.get("guardrail_category"),
        session_id=req.session_id,
        follow_ups=response_data.get("follow_ups", []),
    )
