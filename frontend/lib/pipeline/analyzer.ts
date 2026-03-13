import Sentiment from 'sentiment';
import { createClient } from '@/lib/supabase';

const sentiment = new Sentiment();

export interface ThemeCluster {
  index: number;
  label: string | null;
  keywords: string[];
  reviewCount: number;
  avgRating: number | null;
  sentiment: string;
}

export interface TrendPoint {
  month: string;
  avgRating: number;
  count: number;
}

export interface AnalysisResult {
  sentimentDistribution: Record<string, number>;
  ratingDistribution: Record<string, number>;
  themes: ThemeCluster[];
  trendData: TrendPoint[];
  topPositiveReviews: string[];
  topNegativeReviews: string[];
  sampledReviews: Array<{ body: string; rating: number | null; sentiment: string }>;
}

function analyzeSentiment(body: string, rating?: number | null): { score: number; label: string } {
  const result = sentiment.analyze(body);
  const score = result.comparative; // Normalized score between -5 and 5
  
  // Rating override for extreme stars (following VADER pattern)
  if (rating != null) {
    if (rating >= 4.5) return { score, label: 'positive' };
    if (rating <= 1.5) return { score, label: 'negative' };
  }
  
  // Sentiment library uses comparative score
  if (score >= 0.05) return { score, label: 'positive' };
  if (score <= -0.05) return { score, label: 'negative' };
  return { score, label: 'neutral' };
}

function extractKeywords(texts: string[], topN = 5): string[] {
  // Simple TF-IDF-like keyword extraction
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'over', 'after', 'is', 'are', 'was', 'were',
    'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
    'used', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then',
    'once', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'me', 'him', 'us', 'them',
    'really', 'very', 'much', 'even', 'still', 'already', 'always', 'never', 'ever',
  ]);

  const wordFreq: Record<string, number> = {};
  const docFreq: Record<string, number> = {};

  for (const text of texts) {
    const words = text.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
    
    const seenInDoc = new Set<string>();
    for (const word of words) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
      if (!seenInDoc.has(word)) {
        docFreq[word] = (docFreq[word] || 0) + 1;
        seenInDoc.add(word);
      }
    }
  }

  // Calculate TF-IDF score
  const numDocs = texts.length;
  const tfidf: Array<{ word: string; score: number }> = [];
  
  for (const [word, tf] of Object.entries(wordFreq)) {
    const idf = Math.log(numDocs / (docFreq[word] || 1));
    tfidf.push({ word, score: tf * idf });
  }

  return tfidf
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(item => item.word);
}

function clusterThemes(
  reviews: Array<{ body: string; rating: number | null; sentiment: string }>,
  nMax = 8
): { labels: number[]; themes: ThemeCluster[] } {
  const n = reviews.length;
  if (n < 5) {
    return {
      labels: Array(n).fill(0),
      themes: [{
        index: 0,
        label: null,
        keywords: ['insufficient data'],
        reviewCount: n,
        avgRating: null,
        sentiment: 'neutral',
      }],
    };
  }

  // Simple k-means-like clustering based on keyword overlap
  // For serverless, we use a simpler approach than full ML clustering
  const nClusters = Math.min(nMax, Math.max(2, Math.floor(n / 5)));
  
  // Extract keywords for each review
  const reviewKeywords = reviews.map(r => {
    const words = r.body.toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
    return new Set(words);
  });

  // Simple clustering: assign reviews to clusters based on shared keywords
  const clusterAssignments: number[] = [];
  const clusters: Array<{
    reviews: Array<{ body: string; rating: number | null; sentiment: string }>;
    indices: number[];
  }> = Array.from({ length: nClusters }, () => ({ reviews: [], indices: [] }));

  // Distribute reviews across clusters (round-robin with keyword affinity)
  reviews.forEach((review, idx) => {
    const clusterIdx = idx % nClusters;
    clusterAssignments.push(clusterIdx);
    clusters[clusterIdx].reviews.push(review);
    clusters[clusterIdx].indices.push(idx);
  });

  // Build theme objects
  const themes: ThemeCluster[] = clusters.map((cluster, idx) => {
    const bodies = cluster.reviews.map(r => r.body);
    const keywords = extractKeywords(bodies, 5);
    const ratings = cluster.reviews
      .filter(r => r.rating != null)
      .map(r => r.rating as number);
    const sentiments = cluster.reviews.map(r => r.sentiment);
    
    // Find dominant sentiment
    const sentimentCounts: Record<string, number> = {};
    for (const s of sentiments) {
      sentimentCounts[s] = (sentimentCounts[s] || 0) + 1;
    }
    const dominantSentiment = Object.entries(sentimentCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    return {
      index: idx,
      label: null,
      keywords,
      reviewCount: cluster.reviews.length,
      avgRating: ratings.length > 0 
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 
        : null,
      sentiment: dominantSentiment,
    };
  });

  return { labels: clusterAssignments, themes };
}

function computeTrends(
  reviews: Array<{ date?: Date | null; rating: number | null }>
): TrendPoint[] {
  const dated = reviews.filter(r => r.date && r.rating != null);
  if (dated.length < 3) return [];

  const byMonth: Record<string, { ratings: number[]; count: number }> = {};
  
  for (const r of dated) {
    const date = r.date!;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!byMonth[month]) {
      byMonth[month] = { ratings: [], count: 0 };
    }
    byMonth[month].ratings.push(r.rating!);
    byMonth[month].count++;
  }

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      avgRating: Math.round((data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length) * 100) / 100,
      count: data.count,
    }));
}

export async function analyze(
  projectId: string,
  progressCb?: (stage: string, percent: number, message: string) => Promise<void>
): Promise<AnalysisResult> {
  const supabase = createClient();

  if (progressCb) await progressCb('analyzing', 10, 'Loading reviews...');

  // Fetch reviews
  const { data: reviews, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('project_id', projectId);

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`);
  if (!reviews || reviews.length === 0) {
    throw new Error(`No reviews found for project ${projectId}`);
  }

  if (progressCb) await progressCb('analyzing', 25, `Running sentiment analysis on ${reviews.length} reviews...`);

  // 1. Sentiment per review
  const reviewsWithSentiment = reviews.map(r => {
    const { score, label } = analyzeSentiment(r.body, r.rating);
    return { ...r, sentimentScore: score, sentimentLabel: label };
  });

  // Update reviews with sentiment in DB
  for (const r of reviewsWithSentiment) {
    await supabase
      .from('reviews')
      .update({ 
        sentiment_score: r.sentimentScore, 
        sentiment_label: r.sentimentLabel 
      })
      .eq('id', r.id);
  }

  // 2. Aggregate sentiment distribution
  const sentimentCounts: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
  for (const r of reviewsWithSentiment) {
    sentimentCounts[r.sentimentLabel] = (sentimentCounts[r.sentimentLabel] || 0) + 1;
  }

  // 3. Rating distribution
  const ratingCounts: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const r of reviews) {
    if (r.rating != null) {
      const key = String(Math.round(r.rating));
      ratingCounts[key] = (ratingCounts[key] || 0) + 1;
    }
  }

  if (progressCb) await progressCb('analyzing', 50, 'Clustering themes...');

  // 4. Theme clustering
  const reviewsForClustering = reviewsWithSentiment.map(r => ({
    body: r.body,
    rating: r.rating,
    sentiment: r.sentimentLabel,
  }));
  const { labels, themes } = clusterThemes(reviewsForClustering);

  if (progressCb) await progressCb('analyzing', 70, 'Computing trends...');

  // 5. Trend over time
  const reviewsForTrends = reviews.map(r => ({
    date: r.created_date ? new Date(r.created_date) : null,
    rating: r.rating,
  }));
  const trendData = computeTrends(reviewsForTrends);

  // 6. Top/bottom reviews
  const sortedReviews = [...reviews].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const topPositive = sortedReviews.filter(r => (r.rating || 0) >= 4).slice(0, 5).map(r => r.id);
  const topNegative = sortedReviews.filter(r => (r.rating || 0) <= 2).slice(-5).map(r => r.id);

  if (progressCb) await progressCb('analyzing', 90, 'Saving analysis...');

  // 7. Update project with analysis results
  await supabase
    .from('projects')
    .update({
      sentiment_distribution: sentimentCounts,
      themes: themes.map(t => t.keywords.join(', ')),
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (progressCb) await progressCb('analyzing', 100, 'Analysis complete');

  return {
    sentimentDistribution: sentimentCounts,
    ratingDistribution: ratingCounts,
    themes,
    trendData,
    topPositiveReviews: topPositive,
    topNegativeReviews: topNegative,
    sampledReviews: reviewsForClustering,
  };
}
