import json
import uuid
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

from app.models.analysis import Analysis
from app.models.review import Review
from app.schemas.analysis import ThemeCluster, TrendPoint

_vader = SentimentIntensityAnalyzer()


def _vader_sentiment(body: str, rating: float | None) -> str:
    score = _vader.polarity_scores(body)["compound"]
    # Rating override for extreme stars
    if rating is not None:
        if rating >= 4.5:
            return "positive"
        if rating <= 1.5:
            return "negative"
    if score >= 0.05:
        return "positive"
    if score <= -0.05:
        return "negative"
    return "neutral"


def _cluster_themes(bodies: list[str], n_max: int = 8) -> tuple[list[int], list[list[str]]]:
    """Returns (cluster_labels, top_keywords_per_cluster)."""
    n = len(bodies)
    if n < 5:
        return [0] * n, [["insufficient data"]]

    n_clusters = min(n_max, max(2, n // 5))
    vectorizer = TfidfVectorizer(max_features=500, ngram_range=(1, 2), stop_words="english")
    try:
        X = vectorizer.fit_transform(bodies)
    except ValueError:
        return [0] * n, [["no themes"]]

    km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = km.fit_predict(X).tolist()

    feature_names = vectorizer.get_feature_names_out()
    cluster_keywords = []
    for centroid in km.cluster_centers_:
        top_idx = centroid.argsort()[-5:][::-1]
        cluster_keywords.append([feature_names[i] for i in top_idx])

    return labels, cluster_keywords


async def analyze(
    project_id: str,
    db: AsyncSession,
    progress_cb=None,
) -> dict:
    if progress_cb:
        await progress_cb("analyzing", 10, "Loading reviews…")

    result = await db.execute(select(Review).where(Review.project_id == project_id))
    reviews = result.scalars().all()

    if not reviews:
        raise ValueError(f"No reviews found for project {project_id}")

    if progress_cb:
        await progress_cb("analyzing", 25, f"Running sentiment analysis on {len(reviews)} reviews…")

    # 1. Sentiment per review
    for review in reviews:
        sentiment = _vader_sentiment(review.body, review.rating)
        review.sentiment = sentiment
    await db.commit()

    # 2. Aggregate sentiment distribution
    sentiment_counts: dict[str, int] = defaultdict(int)
    for r in reviews:
        sentiment_counts[r.sentiment or "neutral"] += 1
    sentiment_distribution = dict(sentiment_counts)

    # 3. Rating distribution
    rating_counts: dict[str, int] = defaultdict(int)
    for r in reviews:
        if r.rating is not None:
            key = str(int(round(r.rating)))
            rating_counts[key] += 1
    rating_distribution = {str(i): rating_counts.get(str(i), 0) for i in range(1, 6)}

    if progress_cb:
        await progress_cb("analyzing", 50, "Clustering themes…")

    # 4. Theme clustering
    bodies = [r.body for r in reviews]
    labels, keywords_per_cluster = _cluster_themes(bodies)

    cluster_stats: dict[int, dict] = defaultdict(lambda: {
        "count": 0, "ratings": [], "sentiments": []
    })
    for r, label in zip(reviews, labels):
        cluster_stats[label]["count"] += 1
        if r.rating is not None:
            cluster_stats[label]["ratings"].append(r.rating)
        cluster_stats[label]["sentiments"].append(r.sentiment or "neutral")

    themes = []
    for idx, kws in enumerate(keywords_per_cluster):
        stats = cluster_stats[idx]
        ratings = stats["ratings"]
        sents = stats["sentiments"]
        dominant = max(set(sents), key=sents.count) if sents else "neutral"
        themes.append(ThemeCluster(
            index=idx,
            label=None,  # filled by Summarizer
            keywords=kws,
            review_count=stats["count"],
            avg_rating=round(float(np.mean(ratings)), 2) if ratings else None,
            sentiment=dominant,
        ))

    if progress_cb:
        await progress_cb("analyzing", 70, "Computing trends…")

    # 5. Trend over time
    trend_data: list[TrendPoint] = []
    dated = [(r.date, r.rating) for r in reviews if r.date and r.rating is not None]
    if dated:
        df = pd.DataFrame(dated, columns=["date", "rating"])
        df["month"] = df["date"].dt.to_period("M").astype(str)
        grouped = df.groupby("month").agg(avg_rating=("rating", "mean"), count=("rating", "count")).reset_index()
        if len(grouped) >= 3:
            trend_data = [
                TrendPoint(month=row["month"], avg_rating=round(row["avg_rating"], 2), count=int(row["count"]))
                for _, row in grouped.iterrows()
            ]

    # 6. Top/bottom reviews
    sorted_reviews = sorted(reviews, key=lambda r: (r.rating or 0), reverse=True)
    top_positive = [r.id for r in sorted_reviews[:5] if (r.rating or 0) >= 3]
    top_negative = [r.id for r in reversed(sorted_reviews) if (r.rating or 0) <= 3][:5]

    if progress_cb:
        await progress_cb("analyzing", 90, "Saving analysis…")

    # 7. Persist
    analysis_id = str(uuid.uuid4())
    existing = await db.execute(select(Analysis).where(Analysis.project_id == project_id))
    existing_row = existing.scalar_one_or_none()

    analysis_data = dict(
        sentiment_distribution=json.dumps(sentiment_distribution),
        rating_distribution=json.dumps(rating_distribution),
        themes=json.dumps([t.model_dump() for t in themes]),
        trend_data=json.dumps([t.model_dump() for t in trend_data]),
        top_positive_reviews=json.dumps(top_positive),
        top_negative_reviews=json.dumps(top_negative),
    )

    if existing_row:
        await db.execute(
            update(Analysis).where(Analysis.project_id == project_id).values(**analysis_data)
        )
    else:
        db.add(Analysis(id=analysis_id, project_id=project_id, **analysis_data))
    await db.commit()

    if progress_cb:
        await progress_cb("analyzing", 100, "Analysis complete")

    return {
        "sentiment_distribution": sentiment_distribution,
        "rating_distribution": rating_distribution,
        "themes": [t.model_dump() for t in themes],
        "trend_data": [t.model_dump() for t in trend_data],
        "top_positive_reviews": top_positive,
        "top_negative_reviews": top_negative,
        "sampled_reviews": [{"body": r.body, "rating": r.rating, "sentiment": r.sentiment} for r in reviews],
    }
