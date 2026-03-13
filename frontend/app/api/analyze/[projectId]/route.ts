import { NextRequest, NextResponse } from 'next/server';
import { analyze } from '@/lib/pipeline/analyzer';
import { summarize } from '@/lib/pipeline/summarizer';
import { createClient } from '@/lib/supabase';

export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const supabase = createClient();

    // Get project info
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // Run analysis
    const analysisResult = await analyze(projectId);

    // Run summarization
    const summaryResult = await summarize(
      analysisResult,
      projectId,
      project.product_name
    );

    return NextResponse.json({
      analysis: analysisResult,
      summary: summaryResult,
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
