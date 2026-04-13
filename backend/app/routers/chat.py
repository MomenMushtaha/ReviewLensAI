from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.project import Project
from app.models.analysis import Analysis
from app.models.chat_message import ChatMessage
from app.agents.rag_agent import answer

router = APIRouter()

MAX_HISTORY_MESSAGES = 16  # 8 turns × 2 messages


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
    follow_ups: list[str]


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == req.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.status != "ready":
        raise HTTPException(status_code=400, detail=f"Project pipeline not complete (status: {project.status})")

    # Fetch analysis data for richer chat context
    analysis_result = await db.execute(
        select(Analysis).where(Analysis.project_id == req.project_id)
    )
    analysis = analysis_result.scalar_one_or_none()

    # Load chat history from DB (last 8 turns = 16 messages)
    history_result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.project_id == req.project_id, ChatMessage.session_id == req.session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(MAX_HISTORY_MESSAGES)
    )
    history_rows = list(reversed(history_result.scalars().all()))
    history = [{"role": row.role, "content": row.content} for row in history_rows]

    response_data = await answer(
        question=req.message,
        project=project,
        history=history,
        db=db,
        analysis=analysis,
    )

    # Persist both messages
    db.add(ChatMessage(project_id=req.project_id, session_id=req.session_id, role="user", content=req.message))
    db.add(ChatMessage(project_id=req.project_id, session_id=req.session_id, role="assistant", content=response_data["response"]))
    await db.commit()

    return ChatResponse(
        response=response_data["response"],
        sources=[SourceCitation(**s) for s in response_data["sources"]],
        guardrail_triggered=response_data["guardrail_triggered"],
        guardrail_category=response_data.get("guardrail_category"),
        session_id=req.session_id,
        follow_ups=response_data.get("follow_ups", []),
    )
