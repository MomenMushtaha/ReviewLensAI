import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { scrapeTrustpilot, parseCSV, hashReviewBody, ScraperError } from '@/lib/pipeline/scraper';
import { getEmbedding } from '@/lib/openai';
import { analyze } from '@/lib/pipeline/analyzer';
import { summarize } from '@/lib/pipeline/summarizer';

export const maxDuration = 60; // 60 seconds for scraping

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, csvData, productName: providedName } = body;

    if (!url && !csvData) {
      return NextResponse.json(
        { error: 'Either url or csvData is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // Step 1: Scrape or parse reviews
    let reviews;
    let productName = providedName;
    let platform = 'csv';
    let trustpilotUrl = null;

    if (url) {
      try {
        const result = await scrapeTrustpilot(url);
        reviews = result.reviews;
        productName = productName || result.productName || 'Unknown Product';
        platform = 'trustpilot';
        trustpilotUrl = url;
      } catch (e) {
        if (e instanceof ScraperError) {
          return NextResponse.json({ error: e.message }, { status: 400 });
        }
        throw e;
      }
    } else {
      reviews = parseCSV(csvData);
      productName = productName || 'CSV Import';
    }

    if (reviews.length === 0) {
      return NextResponse.json(
        { error: 'No valid reviews found' },
        { status: 400 }
      );
    }

    // Step 2: Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        product_name: productName,
        platform,
        trustpilot_url: trustpilotUrl,
        total_reviews: reviews.length,
      })
      .select()
      .single();

    if (projectError) {
      return NextResponse.json(
        { error: `Failed to create project: ${projectError.message}` },
        { status: 500 }
      );
    }

    // Step 3: Insert reviews with deduplication
    const reviewsToInsert = [];
    const seenHashes = new Set<string>();

    for (const review of reviews) {
      const bodyHash = hashReviewBody(review.body);
      if (seenHashes.has(bodyHash)) continue;
      seenHashes.add(bodyHash);

      // Get embedding for the review
      const embedding = await getEmbedding(review.body);

      reviewsToInsert.push({
        project_id: project.id,
        body: review.body,
        title: review.title,
        rating: review.rating,
        author: review.reviewerName,
        created_date: review.date?.toISOString(),
        body_hash: bodyHash,
        embedding,
      });
    }

    // Insert in batches
    const batchSize = 100;
    for (let i = 0; i < reviewsToInsert.length; i += batchSize) {
      const batch = reviewsToInsert.slice(i, i + batchSize);
      const { error: insertError } = await supabase
        .from('reviews')
        .insert(batch);

      if (insertError) {
        console.error('Error inserting reviews:', insertError);
        // Continue with partial insert
      }
    }

    // Update project with actual count
    await supabase
      .from('projects')
      .update({ total_reviews: reviewsToInsert.length })
      .eq('id', project.id);

    return NextResponse.json({
      projectId: project.id,
      productName,
      reviewCount: reviewsToInsert.length,
      platform,
    });
  } catch (error) {
    console.error('Ingest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
