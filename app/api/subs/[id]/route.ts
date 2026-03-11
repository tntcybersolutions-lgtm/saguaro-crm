import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const db = createServerClient();
    const { data, error } = await db.from('subcontractors').select('*').eq('id', id).single();
    if (error) throw error;
    return NextResponse.json({ sub: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await req.json();
    const db = createServerClient();
    const { data, error } = await db.from('subcontractors').update(body).eq('id', id).select().single();
    if (error) throw error;
    return NextResponse.json({ sub: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
