import openai, { getEmbedding } from '@/lib/openai';
import { createClient } from '@/lib/supabase';
import { 
  preFilter, 
  postValidate, 
  SAFE_FALLBACK, 
  AGENT_SYSTEM_PROMPT 
} from './guardrails';

export interface ChatSource {
  reviewId: string;
  excerpt: string;
  rating: number | null;
  reviewerName: string | null;
}

export interface ChatResponse {
  response: string;
  sources: ChatSource[];
  guardrailTriggered: boolean;
  guardrailCategory?: string;
}

interface RetrievedChunk {
  reviewId: string;
  body: string;
  reviewerName: string | null;
  rating: number | null;
  date: string | null;
  similarity: number;
}

async function retrieveChunks(
  question: string,
  projectId: string,
  similarityThreshold = 0.2
): Promise<RetrievedChunk[]> {
  const supabase = createClient();
  
  // Get embedding for the question
  const embedding = await getEmbedding(question);
  if (!embedding) return [];

  // Call the match_reviews RPC function
  const { data, error } = await supabase.rpc('match_reviews', {
    query_embedding: embedding,
    match_threshold: similarityThreshold,
    match_count: 8,
    filter_project_id: projectId,
  });

  if (error) {
    console.error('Error retrieving chunks:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    reviewId: row.id,
    body: row.body,
    reviewerName: row.author,
    rating: row.rating,
    date: row.created_date ? new Date(row.created_date).toISOString().split('T')[0] : null,
    similarity: row.similarity,
  }));
}

function formatChunks(chunks: RetrievedChunk[]): string {
  return chunks.map((c, i) => {
    const ratingStr = c.rating != null ? `★${Math.round(c.rating)}` : '';
    const dateStr = c.date || '';
    const nameStr = c.reviewerName || 'Anonymous';
    return `[${i + 1}] ${nameStr} ${ratingStr} ${dateStr}\n${c.body}`;
  }).join('\n\n');
}

function getDateRange(chunks: RetrievedChunk[]): string {
  const dates = chunks.filter(c => c.date).map(c => c.date!);
  if (dates.length === 0) return 'unknown';
  dates.sort();
  return `${dates[0]} – ${dates[dates.length - 1]}`;
}

export async function answer(
  question: string,
  project: { id: string; product_name: string | null; total_reviews: number; platform: string },
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<ChatResponse> {
  // Layer 1: Retrieve first to check relevance
  const chunks = await retrieveChunks(question, project.id);
  const hasChunks = chunks.length > 0;

  const guard = preFilter(question, hasChunks);
  if (!guard.allowed) {
    return {
      response: SAFE_FALLBACK,
      sources: [],
      guardrailTriggered: true,
      guardrailCategory: guard.category,
    };
  }

  // Layer 2: Build system prompt + call OpenAI
  const systemPrompt = AGENT_SYSTEM_PROMPT
    .replace('{productName}', project.product_name || 'Unknown')
    .replace('{reviewCount}', String(project.total_reviews))
    .replace('{platform}', project.platform)
    .replace('{dateRange}', getDateRange(chunks))
    .replace('{retrievedChunks}', formatChunks(chunks));

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: question },
  ];

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    max_tokens: 800,
    messages,
  });

  const reply = response.choices[0].message.content || SAFE_FALLBACK;

  // Layer 3: Post-validate
  const chunkBodies = chunks.map(c => c.body);
  const postGuard = postValidate(reply, chunkBodies);
  if (!postGuard.allowed) {
    return {
      response: SAFE_FALLBACK,
      sources: [],
      guardrailTriggered: true,
      guardrailCategory: postGuard.category,
    };
  }

  const sources: ChatSource[] = chunks.slice(0, 3).map(c => ({
    reviewId: c.reviewId,
    excerpt: c.body.slice(0, 200),
    rating: c.rating,
    reviewerName: c.reviewerName,
  }));

  return {
    response: reply,
    sources,
    guardrailTriggered: false,
  };
}
