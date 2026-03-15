const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function createProject(data: {
  source_url?: string;
  platform: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProject(id: string) {
  const res = await fetch(`${API_BASE}/api/projects/${id}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProjectReviews(
  id: string,
  params: {
    page?: number;
    limit?: number;
    sentiment?: string;
    rating_min?: number;
    rating_max?: number;
    sort_by?: string;
    sort_dir?: "asc" | "desc";
  } = {}
) {
  const qs = new URLSearchParams();
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.sentiment) qs.set("sentiment", params.sentiment);
  if (params.rating_min) qs.set("rating_min", String(params.rating_min));
  if (params.rating_max) qs.set("rating_max", String(params.rating_max));
  if (params.sort_by) qs.set("sort_by", params.sort_by);
  if (params.sort_dir) qs.set("sort_dir", params.sort_dir);
  const res = await fetch(`${API_BASE}/api/projects/${id}/reviews?${qs}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getProjectAnalysis(id: string) {
  const res = await fetch(`${API_BASE}/api/projects/${id}/analysis`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function runPipeline(formData: FormData): Promise<{ project_id: string }> {
  const res = await fetch(`${API_BASE}/api/pipeline/run`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendChat(data: {
  project_id: string;
  session_id: string;
  message: string;
}) {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export async function cancelPipeline(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pipeline/cancel/${id}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
}

export function getPipelineSSEUrl(projectId: string): string {
  return `${API_BASE}/api/pipeline/stream/${projectId}`;
}
