import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { scrapeTrustpilot, parseCSV, hashReviewBody, ScraperError } from '@/lib/pipeline/scraper';
import { getEmbedding } from '@/lib/openai';
import { analyze } from '@/lib/pipeline/analyzer';
import { summarize } from '@/lib/pipeline/summarizer';

export const maxDuration = 60; // 60 seconds for scraping

export async function POST(request: NextRequest) {
  console.log('[v0] POST /api/ingest called');
  try {
    const body = await request.json();
    console.log('[v0] Request body:', { url: body.url, hasCsvData: !!body.csvData, productName: body.productName });
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
      console.log('[v0] Scraping Trustpilot URL:', url);
      try {
        const result = await scrapeTrustpilot(url);
        console.log('[v0] Scrape result:', { reviewCount: result.reviews.length, productName: result.productName });
        reviews = result.reviews;
        productName = productName || result.productName || 'Unknown Product';
        platform = 'trustpilot';
        trustpilotUrl = url;
      } catch (e) {
        console.log('[v0] Scrape error:', e);
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

    // Step 2: Check if project with same URL exists, or create new one
    console.log('[v0] Creating project in Supabase...');
    let project;
    
    if (trustpilotUrl) {
      // Check for existing project with same URL
      const { data: existingProject } = await supabase
        .from('projects')
        .select()
        .eq('trustpilot_url', trustpilotUrl)
        .single();
      
      if (existingProject) {
        console.log('[v0] Found existing project, reusing:', existingProject.id);
        project = existingProject;
      }
    }
    
    if (!project) {
      const { data: newProject, error: projectError } = await supabase
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
        console.log('[v0] Project creation error:', projectError);
        return NextResponse.json(
          { error: `Failed to create project: ${projectError.message}` },
          { status: 500 }
        );
      }
      project = newProject;
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

    // Insert reviews one by one, skipping duplicates
    let insertedCount = 0;
    for (const review of reviewsToInsert) {
      const { error: insertError } = await supabase
        .from('reviews')
        .insert(review);

      if (insertError) {
        // Skip duplicates (code 23505 is unique violation)
        if (insertError.code === '23505') {
          console.log('[v0] Skipping duplicate review');
          continue;
        }
        console.error('Error inserting review:', insertError);
      } else {
        insertedCount++;
      }
    }
    
    console.log('[v0] Inserted', insertedCount, 'new reviews out of', reviewsToInsert.length, 'total');

    // Get total review count for this project
    const { count: totalReviews } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id);
    
    // Update project with actual count
    await supabase
      .from('projects')
      .update({ total_reviews: totalReviews || 0 })
      .eq('id', project.id);

    console.log('[v0] Ingest complete, returning response');
    return NextResponse.json({
      projectId: project.id,
      productName: project.product_name || productName,
      reviewCount: totalReviews || 0,
      platform,
    });
  } catch (error) {
    console.error('[v0] Ingest error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
