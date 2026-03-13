import { openai, SUMMARIZER_TOOL, truncate } from '@/lib/openai';
import { createClient } from '@/lib/supabase';
import type { AnalysisResult, ThemeCluster } from './analyzer';

export interface SummaryResult {
  executiveSummary: string;
  painPoints: Array<{
    title: string;
    description: string;
    frequency: 'high' | 'medium' | 'low';
  }>;
  highlights: Array<{
    title: string;
    description: string;
    frequency: 'high' | 'medium' | 'low';
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    action: string;
    rationale: string;
  }>;
  themeLabels: Record<string, string>;
}

export async function summarize(
  analysisData: AnalysisResult,
  projectId: string,
  productName: string | null,
  progressCb?: (stage: string, percent: number, message: string) => Promise<void>
): Promise<SummaryResult> {
  const supabase = createClient();

  if (progressCb) await progressCb('summarizing', 10, 'Preparing review sample for AI...');

  // Sample reviews: top positive, top negative, and some from rest
  const allReviews = analysisData.sampledReviews || [];
  const positive = allReviews.filter(r => r.sentiment === 'positive');
  const negative = allReviews.filter(r => r.sentiment === 'negative');
  const rest = allReviews.filter(r => r.sentiment === 'neutral');

  // Take top 5 from each sentiment, plus up to 20 neutral
  const sample = [
    ...positive.slice(0, 5),
    ...negative.slice(0, 5),
    ...rest.slice(0, Math.min(20, rest.length)),
  ];

  const reviewLines = sample.map((r, i) => {
    const ratingStr = r.rating != null ? `★${Math.round(r.rating)}` : '';
    const body = truncate(r.body, 300);
    return `${i + 1}. ${ratingStr} [${r.sentiment}] ${body}`;
  });

  const themes = analysisData.themes || [];
  const themeSummary = themes
    .map((t: ThemeCluster) => `- Cluster ${t.index} keywords: ${t.keywords.slice(0, 5).join(', ')}`)
    .join('\n');

  const sentiment = analysisData.sentimentDistribution || {};
  const ratingDist = analysisData.ratingDistribution || {};

  const userPrompt = `Product: ${productName || 'Unknown'}
Total reviews: ${allReviews.length}
Sentiment: ${JSON.stringify(sentiment)}
Rating distribution: ${JSON.stringify(ratingDist)}

Theme clusters:
${themeSummary}

Sample reviews:
${reviewLines.join('\n')}

Please produce a structured summary using the produce_summary tool.`;

  const systemPrompt = `You are a product intelligence analyst. Analyze the provided review data and produce a structured executive brief. Be specific, cite patterns from the data. Do not invent information not present in the reviews.`;

  if (progressCb) await progressCb('summarizing', 40, 'Calling OpenAI...');

  // Call OpenAI with tool use
  let result: SummaryResult;
  let retries = 3;
  
  while (retries > 0) {
    try {
      const response = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: 1500,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [SUMMARIZER_TOOL],
        tool_choice: { type: 'function', function: { name: 'produce_summary' } },
      });

      const msg = response.choices[0].message;
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          if (tc.function.name === 'produce_summary') {
            const parsed = JSON.parse(tc.function.arguments);
            result = {
              executiveSummary: parsed.executive_summary,
              painPoints: parsed.pain_points || [],
              highlights: parsed.highlights || [],
              recommendations: parsed.recommendations || [],
              themeLabels: parsed.theme_labels || {},
            };
            break;
          }
        }
      }

      if (result!) break;
      throw new Error('OpenAI did not call produce_summary tool');
    } catch (e) {
      retries--;
      if (retries === 0) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, 3 - retries) * 1000));
    }
  }

  if (progressCb) await progressCb('summarizing', 80, 'Saving summary...');

  // Update project with summary
  await supabase
    .from('projects')
    .update({
      summary_generated: true,
      summary_text: result!.executiveSummary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId);

  if (progressCb) await progressCb('summarizing', 100, 'Summary complete');

  return result!;
}
