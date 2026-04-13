from pydantic import BaseModel


class ThemeCluster(BaseModel):
    index: int
    label: str | None = None
    keywords: list[str]
    review_count: int
    avg_rating: float | None
    sentiment: str


class TrendPoint(BaseModel):
    month: str
    avg_rating: float
    count: int


class PainPoint(BaseModel):
    title: str
    description: str
    frequency: str  # "high" | "medium" | "low"


class Highlight(BaseModel):
    title: str
    description: str
    frequency: str


class Recommendation(BaseModel):
    priority: str  # "high" | "medium" | "low"
    action: str
    rationale: str


class BiasSignal(BaseModel):
    bias_type: str
    label: str
    detected: bool
    strength: str | None = None
    evidence: str
    adjustment_note: str


class AdjustmentReason(BaseModel):
    label: str
    adjustment: float
    explanation: str


class BiasAnalysis(BaseModel):
    signals: list[BiasSignal]
    overall_bias_level: str  # "high" | "moderate" | "low" | "minimal"
    summary: str
    raw_rating: float
    adjusted_rating: float
    rating_adjustment: float
    adjustment_reasons: list[AdjustmentReason]


class AnalysisOut(BaseModel):
    project_id: str
    sentiment_distribution: dict[str, int]
    rating_distribution: dict[str, int]
    themes: list[ThemeCluster]
    trend_data: list[TrendPoint]
    top_positive_reviews: list[str]
    top_negative_reviews: list[str]
    executive_summary: str | None
    pain_points: list[PainPoint] | None
    highlights: list[Highlight] | None
    recommendations: list[Recommendation] | None
    bias_analysis: BiasAnalysis | None = None
