// All API calls now use Next.js API routes (no external backend needed)

export async function ingestReviews(data: {
  url?: string;
  csvData?: string;
  productName?: string;
}): Promise<{ projectId: string; productName: string; reviewCount: number; platform: string }> {
  console.log("[v0] ingestReviews called with data:", { url: data.url, hasCsvData: !!data.csvData, productName: data.productName });
  
  const res = await fetch('/api/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  
  console.log("[v0] ingestReviews response status:", res.status);
  
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    console.log("[v0] ingestReviews error:", error);
    throw new Error(error.error || 'Failed to ingest reviews');
  }
  return res.json();
}

export async function getProject(id: string) {
  const res = await fetch(`/api/projects/${id}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Failed to fetch project');
  }
  return res.json();
}

export async function getProjectReviews(
  id: string,
  params: {
    limit?: number;
    offset?: number;
    sentiment?: string;
    rating?: number;
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.offset) qs.set('offset', String(params.offset));
  if (params.sentiment) qs.set('sentiment', params.sentiment);
  if (params.rating) qs.set('rating', String(params.rating));
  
  const res = await fetch(`/api/projects/${id}/reviews?${qs}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Failed to fetch reviews');
  }
  return res.json();
}

export async function runAnalysis(projectId: string) {
  const res = await fetch(`/api/analyze/${projectId}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Failed to run analysis');
  }
  return res.json();
}

export async function sendChat(data: {
  projectId: string;
  sessionId?: string;
  message: string;
}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Failed to send message');
  }
  return res.json();
}

// Legacy functions for backwards compatibility
export async function createProject(data: {
  source_url?: string;
  platform: string;
}): Promise<{ id: string }> {
  const result = await ingestReviews({ url: data.source_url });
  return { id: result.projectId };
}

export async function runPipeline(formData: FormData): Promise<{ project_id: string }> {
  const url = formData.get('url') as string | null;
  const file = formData.get('file') as File | null;
  const productName = formData.get('product_name') as string | null;

  console.log("[v0] runPipeline called with:", { url, file: file?.name, productName });

  let csvData: string | undefined;
  if (file) {
    csvData = await file.text();
  }

  console.log("[v0] Calling ingestReviews...");
  const result = await ingestReviews({
    url: url || undefined,
    csvData,
    productName: productName || undefined,
  });
  console.log("[v0] ingestReviews result:", result);

  // Also run analysis after ingestion
  console.log("[v0] Calling runAnalysis...");
  await runAnalysis(result.projectId);
  console.log("[v0] runAnalysis complete");

  return { project_id: result.projectId };
}

export function getProjectAnalysis(id: string) {
  return runAnalysis(id);
}
