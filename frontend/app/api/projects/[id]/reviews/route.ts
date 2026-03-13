import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const sentiment = searchParams.get('sentiment');
    const rating = searchParams.get('rating');

    const supabase = createClient();

    let query = supabase
      .from('reviews')
      .select('*', { count: 'exact' })
      .eq('project_id', id)
      .order('created_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (sentiment) {
      query = query.eq('sentiment_label', sentiment);
    }

    if (rating) {
      query = query.eq('rating', parseInt(rating));
    }

    const { data: reviews, error, count } = await query;

    if (error) {
      return NextResponse.json(
        { error: `Failed to fetch reviews: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      reviews: reviews || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Reviews fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch reviews' },
      { status: 500 }
    );
  }
}
