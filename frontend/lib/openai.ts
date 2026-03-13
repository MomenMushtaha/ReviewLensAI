import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export default openai;
export { openai };

// Truncate text utility
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Generate embeddings for text
export async function getEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // Limit input length
    dimensions: 384, // Match pgvector dimension
  });
  return response.data[0].embedding;
}

// Tool definition for structured summary output
export const SUMMARIZER_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "produce_summary",
    description: "Produce a structured summary of customer reviews",
    parameters: {
      type: "object",
      properties: {
        overall_summary: {
          type: "string",
          description:
            "A 2-3 sentence executive summary of the overall customer sentiment and experience",
        },
        positive_highlights: {
          type: "array",
          items: { type: "string" },
          description: "Top 3-5 positive themes or highlights from reviews",
        },
        negative_highlights: {
          type: "array",
          items: { type: "string" },
          description: "Top 3-5 negative themes or issues from reviews",
        },
        recommendations: {
          type: "array",
          items: { type: "string" },
          description:
            "2-3 actionable recommendations based on the review analysis",
        },
      },
      required: [
        "overall_summary",
        "positive_highlights",
        "negative_highlights",
        "recommendations",
      ],
    },
  },
};

// Generate summary using tool use
export async function generateSummary(
  reviews: { body: string; rating: number | null; sentiment_label: string | null }[],
  productName: string
): Promise<{
  overall_summary: string;
  positive_highlights: string[];
  negative_highlights: string[];
  recommendations: string[];
}> {
  // Sample max 30 reviews, truncate each to 300 chars
  const sampledReviews = reviews.slice(0, 30).map((r) => ({
    text: r.body.slice(0, 300),
    rating: r.rating,
    sentiment: r.sentiment_label,
  }));

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 1500,
    tools: [SUMMARIZER_TOOL],
    tool_choice: { type: "function", function: { name: "produce_summary" } },
    messages: [
      {
        role: "system",
        content: `You are a review analyst. Analyze the following customer reviews for "${productName}" and produce a structured summary using the produce_summary tool.`,
      },
      {
        role: "user",
        content: `Here are the reviews to analyze:\n\n${sampledReviews
          .map(
            (r, i) =>
              `Review ${i + 1} (Rating: ${r.rating ?? "N/A"}, Sentiment: ${r.sentiment ?? "N/A"}):\n${r.text}`
          )
          .join("\n\n")}`,
      },
    ],
  });

  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== "produce_summary") {
    throw new Error("Failed to generate summary - no tool call response");
  }

  return JSON.parse(toolCall.function.arguments);
}

// Generate chat response with RAG context
export async function generateChatResponse(
  userMessage: string,
  context: { body: string; rating: number | null; author: string | null }[],
  productName: string,
  platform: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<string> {
  const systemPrompt = `You are a helpful assistant that answers questions about customer reviews for "${productName}" on ${platform}.

IMPORTANT RULES:
1. ONLY answer questions about the reviews provided in the context below.
2. If asked about topics unrelated to these reviews, politely decline and redirect to review-related questions.
3. Always cite specific reviews when making claims.
4. Never make up information not present in the reviews.
5. If you don't have enough information to answer, say so honestly.

REVIEW CONTEXT:
${context
  .map(
    (r, i) =>
      `[Review ${i + 1}] Rating: ${r.rating ?? "N/A"} | Author: ${r.author ?? "Anonymous"}\n${r.body}`
  )
  .join("\n\n")}`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
    { role: "user", content: userMessage },
  ];

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: 1000,
    messages,
  });

  return response.choices[0]?.message?.content ?? "I couldn't generate a response.";
}
