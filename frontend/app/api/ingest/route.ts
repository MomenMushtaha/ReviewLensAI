import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';
import { scrapeTrustpilot, parseCSV, hashReviewBody, ScraperError } from '@/lib/pipeline/scraper';
import { getBatchEmbeddings } from '@/lib/openai';

export const maxDuration = 300; // 5 minutes for scraping + embeddings

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

    // Step 3: Deduplicate reviews first
    const uniqueReviews = [];
    const seenHashes = new Set<string>();

    for (const review of reviews) {
      const bodyHash = hashReviewBody(review.body);
      if (seenHashes.has(bodyHash)) continue;
      seenHashes.add(bodyHash);
      uniqueReviews.push({ ...review, bodyHash });
    }

    console.log('[v0] Getting batch embeddings for', uniqueReviews.length, 'reviews...');
    
    // Get all embeddings in batch (much faster than one-by-one)
    const embeddings = await getBatchEmbeddings(uniqueReviews.map(r => r.body));
    
    console.log('[v0] Got', embeddings.length, 'embeddings');

    // Prepare reviews with embeddings
    const reviewsToInsert = uniqueReviews.map((review, i) => ({
      project_id: project.id,
      body: review.body,
      title: review.title,
      rating: review.rating,
      author: review.reviewerName,
      created_date: review.date?.toISOString(),
      body_hash: review.bodyHash,
      embedding: embeddings[i] || null,
    }));

    // Insert reviews in batches with proper upsert
    console.log('[v0] Inserting', reviewsToInsert.length, 'reviews in batches...');
    let insertedCount = 0;
    const batchSize = 50;
    
    for (let i = 0; i < reviewsToInsert.length; i += batchSize) {
      const batch = reviewsToInsert.slice(i, i + batchSize);
      try {
        // Use insert with on_conflict in SQL instead of Supabase upsert which has issues
        const { data, error: insertError } = await supabase
          .from('reviews')
          .insert(batch)
          .select('id');

        if (insertError) {
          // If it's a conflict error (23505), try without that review
          if (insertError.code === '23505') {
            console.log('[v0] Batch', Math.floor(i / batchSize) + 1, 'has duplicates, inserting individually...');
            for (const review of batch) {
              const { data: inserted, error } = await supabase
                .from('reviews')
                .insert([review])
                .select('id');
              if (!error && inserted) {
                insertedCount += 1;
              }
            }
          } else {
            console.error('[v0] Batch insert error:', insertError);
          }
        } else {
          insertedCount += data?.length || 0;
          console.log('[v0] Batch', Math.floor(i / batchSize) + 1, 'inserted', data?.length || 0, 'reviews');
        }
      } catch (batchError) {
        console.error('[v0] Batch processing error:', batchError);
      }
    }
    
    console.log('[v0] Total inserted:', insertedCount, 'reviews');

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
