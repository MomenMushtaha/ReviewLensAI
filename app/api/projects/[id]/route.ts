import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Get reviews count by sentiment
    const { data: reviews } = await supabase
      .from('reviews')
      .select('sentiment_label, rating')
      .eq('project_id', id);

    // Calculate distributions
    const sentimentDist: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
    const ratingDist: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };

    for (const review of reviews || []) {
      if (review.sentiment_label) {
        sentimentDist[review.sentiment_label] = (sentimentDist[review.sentiment_label] || 0) + 1;
      }
      if (review.rating != null) {
        const key = String(Math.round(review.rating));
        ratingDist[key] = (ratingDist[key] || 0) + 1;
      }
    }

    return NextResponse.json({
      ...project,
      sentiment_distribution: project.sentiment_distribution || sentimentDist,
      rating_distribution: ratingDist,
    });
  } catch (error) {
    console.error('Project fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    // Delete all reviews for this project first (cascade constraint)
    const { error: reviewsError } = await supabase
      .from('reviews')
      .delete()
      .eq('project_id', id);

    if (reviewsError) {
      console.error('Error deleting reviews:', reviewsError);
      return NextResponse.json(
        { error: 'Failed to delete project reviews' },
        { status: 500 }
      );
    }

    // Delete the project
    const { error: projectError } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (projectError) {
      console.error('Error deleting project:', projectError);
      return NextResponse.json(
        { error: 'Failed to delete project' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Project deleted' });
  } catch (error) {
    console.error('Project delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete project' },
      { status: 500 }
    );
  }
}
