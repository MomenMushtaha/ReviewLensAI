export interface Project {
  id: string;
  source_url: string | null;
  platform: string;
  product_name: string | null;
  status: "pending" | "scraping" | "ingesting" | "analyzing" | "summarizing" | "ready" | "error";
  error_message: string | null;
  review_count: number;
  created_at: string;
  completed_at: string | null;
}

export interface Review {
  id: string;
  project_id: string;
  platform: string;
  external_id: string | null;
  reviewer_name: string | null;
  rating: number | null;
  title: string | null;
  body: string;
  date: string | null;
  sentiment: string | null;
  created_at: string;
}

export interface ThemeCluster {
  index: number;
  label: string | null;
  keywords: string[];
  review_count: number;
  avg_rating: number | null;
  sentiment: string;
}

export interface TrendPoint {
  month: string;
  avg_rating: number;
  count: number;
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
  priority: string;
  action: string;
  rationale: string;
}

export interface BiasSignal {
  bias_type: string;
  label: string;
  detected: boolean;
  strength: string | null;
  evidence: string;
  adjustment_note: string;
}

export interface AdjustmentReason {
  label: string;
  adjustment: number;
  explanation: string;
}

export interface BiasAnalysis {
  signals: BiasSignal[];
  overall_bias_level: string;
  summary: string;
  raw_rating: number;
  adjusted_rating: number;
  confidence_low: number;
  confidence_high: number;
  rating_adjustment: number;
  adjustment_reasons: AdjustmentReason[];
}

export interface Analysis {
  id: string;
  project_id: string;
  sentiment_distribution: Record<string, number>;
  rating_distribution: Record<string, number>;
  themes: ThemeCluster[];
  trend_data: TrendPoint[];
  executive_summary: string | null;
  pain_points: PainPoint[];
  highlights: Highlight[];
  recommendations: Recommendation[];
  bias_analysis: BiasAnalysis | null;
  created_at: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sources?: Array<{
    review_id: string;
    excerpt: string;
    rating: number | null;
    reviewer_name: string | null;
  }>;
  guardrailTriggered?: boolean;
  guardrailCategory?: string | null;
  followUps?: string[];
}
