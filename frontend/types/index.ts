export interface Project {
  id: string;
  product_name: string | null;
  platform: string;
  trustpilot_url: string | null;
  review_count: number;
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
  created_at: string;
}

export interface Theme {
  cluster_id: number;
  label: string;
  keywords: string[];
  review_count: number;
  avg_sentiment: number;
  sample_reviews: string[];
}

export interface Analysis {
  executive_summary?: string;
  sentiment_distribution: Record<string, number>;
  trend_data: Array<{ date: string; avgRating: number; count: number }>;
  themes: Theme[];
  pain_points: (PainPoint | string)[];
  highlights: (Highlight | string)[];
  recommendations: (Recommendation | string)[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    id: string;
    snippet: string;
    rating: number | null;
  }>;
  guardrail_triggered?: boolean;
  guardrail_category?: string;
}

export interface PainPoint {
  title: string;
  description: string;
  frequency: string;
}

export interface Highlight {
  title: string;
  description: string;
  frequency: string;
}

export interface Recommendation {
  priority: "high" | "medium" | "low";
  action: string;
  rationale: string;
}
