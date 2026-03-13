export const SAFE_FALLBACK = 
  "I can only answer questions about the reviews in this session. " +
  "That question goes beyond the available review data. " +
  "Try asking something like: 'What are the most common complaints?' " +
  "or 'How has sentiment changed over time?'";

export const OFF_TOPIC_PATTERNS = [
  /\b(amazon|google|apple|yelp|tripadvisor|g2|capterra|glassdoor)\b/i,
  /\bcompetitor\b/i,
  /\bvs\.?\s+\w+\b/i,
  /\bversus\b/i,
  /\bother\s+platform\b/i,
  /\bweather\b/i,
  /\bstock\s+price\b/i,
  /\bwhat\s+is\s+[a-z]+\s+company\b/i,
  /\btell\s+me\s+about\s+yourself\b/i,
];

export const HALLUCINATION_MARKERS = [
  'generally speaking',
  'in general',
  'typically',
  'most products like this',
  "it's common for",
  'industry standard',
  'based on my knowledge',
  'from my experience',
  'in my opinion',
  'research shows',
];

export interface GuardrailResult {
  allowed: boolean;
  rejectionReason?: string;
  category?: 'off_topic' | 'no_relevant_reviews' | 'harmful_content' | 'hallucination_detected';
}

export function preFilter(question: string, hasRelevantChunks: boolean): GuardrailResult {
  const q = question.toLowerCase();

  // Check off-topic patterns
  for (const pattern of OFF_TOPIC_PATTERNS) {
    if (pattern.test(q)) {
      return {
        allowed: false,
        rejectionReason: `Pattern matched: ${pattern.source}`,
        category: 'off_topic',
      };
    }
  }

  // Check if no relevant reviews were retrieved
  if (!hasRelevantChunks) {
    return {
      allowed: false,
      rejectionReason: 'No relevant reviews found for this question',
      category: 'no_relevant_reviews',
    };
  }

  return { allowed: true };
}

export function postValidate(response: string, retrievedBodies: string[]): GuardrailResult {
  const lower = response.toLowerCase();

  // Check hallucination markers
  for (const marker of HALLUCINATION_MARKERS) {
    if (lower.includes(marker)) {
      return {
        allowed: false,
        rejectionReason: `Hallucination marker detected: '${marker}'`,
        category: 'hallucination_detected',
      };
    }
  }

  // Flag external URLs not in retrieved reviews
  const urlPattern = /https?:\/\/\S+/g;
  const responseUrls = new Set(response.match(urlPattern) || []);
  const sourceUrls = new Set<string>();
  
  for (const body of retrievedBodies) {
    const matches = body.match(urlPattern) || [];
    for (const url of matches) {
      sourceUrls.add(url);
    }
  }

  const externalUrls = [...responseUrls].filter(url => !sourceUrls.has(url));
  if (externalUrls.length > 0) {
    return {
      allowed: false,
      rejectionReason: `Response contained external URLs: ${externalUrls.join(', ')}`,
      category: 'hallucination_detected',
    };
  }

  return { allowed: true };
}

export const AGENT_SYSTEM_PROMPT = `You are ReviewLens, an AI assistant that answers questions EXCLUSIVELY about the product reviews loaded in this analysis session.

STRICT RULES:
1. You may ONLY answer questions that can be answered from the provided review excerpts below.
2. If a question cannot be answered from the reviews, respond with exactly:
   "I can only answer questions about the reviews in this session. That question goes beyond the available review data."
3. Never provide general knowledge, opinions, or information about other products or platforms.
4. Never compare this product to competitors unless the reviews themselves mention comparisons.
5. Always cite which reviews support your answer (use reviewer name or date if available).
6. If asked about your own capabilities or nature, respond:
   "I'm ReviewLens, focused only on analyzing the reviews you've provided."

PROJECT CONTEXT:
- Product: {productName}
- Total reviews: {reviewCount}
- Platform: {platform}
- Date range: {dateRange}

AVAILABLE REVIEW EXCERPTS (use these as your sole source of truth):
{retrievedChunks}
`;
