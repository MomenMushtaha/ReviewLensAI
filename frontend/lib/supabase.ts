import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client with service role key for API routes
export const supabase = createSupabaseClient(supabaseUrl, supabaseServiceKey);

// Export a createClient function for API routes
export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseServiceKey);
}

// Types for database tables
export interface Project {
  id: string;
  product_name: string;
  platform: string;
  trustpilot_url: string | null;
  total_reviews: number;
  overall_rating: number | null;
  summary_generated: boolean;
  summary_text: string | null;
  themes: string[];
  sentiment_distribution: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  project_id: string;
  body: string;
  title: string | null;
  rating: number | null;
  author: string | null;
  created_date: string | null;
  sentiment_score: number | null;
  sentiment_label: string | null;
  themes: string[];
  body_hash: string;
  embedding: number[] | null;
  created_at: string;
}

// Helper to create project
export async function createProject(data: {
  product_name: string;
  platform: string;
  trustpilot_url?: string;
}): Promise<Project> {
  const { data: project, error } = await supabase
    .from("projects")
    .insert(data)
    .select()
    .single();

  if (error) throw new Error(`Failed to create project: ${error.message}`);
  return project;
}

// Helper to get project by ID
export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

// Helper to update project
export async function updateProject(
  id: string,
  data: Partial<Project>
): Promise<Project> {
  const { data: project, error } = await supabase
    .from("projects")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update project: ${error.message}`);
  return project;
}

// Helper to insert reviews (with deduplication via body_hash)
export async function insertReviews(
  reviews: Omit<Review, "id" | "created_at">[]
): Promise<number> {
  const { data, error } = await supabase
    .from("reviews")
    .upsert(reviews, { onConflict: "body_hash", ignoreDuplicates: true })
    .select();

  if (error) throw new Error(`Failed to insert reviews: ${error.message}`);
  return data?.length ?? 0;
}

// Helper to get reviews for a project
export async function getReviews(
  projectId: string,
  limit = 100
): Promise<Review[]> {
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("project_id", projectId)
    .order("created_date", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to get reviews: ${error.message}`);
  return data ?? [];
}

// Helper for vector similarity search
export async function searchSimilarReviews(
  projectId: string,
  embedding: number[],
  limit = 5,
  threshold = 0.2
): Promise<Review[]> {
  const { data, error } = await supabase.rpc("match_reviews", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
    filter_project_id: projectId,
  });

  if (error) {
    console.error("Vector search error:", error);
    // Fallback to regular search if RPC not available
    return getReviews(projectId, limit);
  }
  return data ?? [];
}
