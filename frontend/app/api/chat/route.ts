import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { answer } from '@/lib/agents/rag-agent';

// In-memory chat histories (in production, use Redis or DB)
const chatHistories: Map<string, Array<{ role: 'user' | 'assistant'; content: string }>> = new Map();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, message, sessionId } = body;

    if (!projectId || !message) {
      return NextResponse.json(
        { error: 'projectId and message are required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get or create chat history
    const historyKey = sessionId || `${projectId}-default`;
    let history = chatHistories.get(historyKey) || [];

    // Call RAG agent
    const response = await answer(
      message,
      {
        id: project.id,
        product_name: project.product_name,
        total_reviews: project.total_reviews,
        platform: project.platform,
      },
      history
    );

    // Update history (keep last 12 messages = 6 turns)
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: response.response });
    chatHistories.set(historyKey, history.slice(-12));

    return NextResponse.json({
      response: response.response,
      sources: response.sources,
      guardrailTriggered: response.guardrailTriggered,
      guardrailCategory: response.guardrailCategory,
      sessionId: historyKey,
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 }
    );
  }
}
