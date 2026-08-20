import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helper';

const CSI_DIVISIONS = [
  { num: '00', title: 'Procurement and Contracting Requirements' },
  { num: '01', title: 'General Requirements' },
  { num: '02', title: 'Existing Conditions' },
  { num: '03', title: 'Concrete' },
  { num: '04', title: 'Masonry' },
  { num: '05', title: 'Metals' },
  { num: '06', title: 'Wood, Plastics, and Composites' },
  { num: '07', title: 'Thermal and Moisture Protection' },
  { num: '08', title: 'Openings' },
  { num: '09', title: 'Finishes' },
  { num: '10', title: 'Specialties' },
  { num: '11', title: 'Equipment' },
  { num: '12', title: 'Furnishings' },
  { num: '13', title: 'Special Construction' },
  { num: '14', title: 'Conveying Equipment' },
  { num: '21', title: 'Fire Suppression' },
  { num: '22', title: 'Plumbing' },
  { num: '23', title: 'Heating, Ventilating, and Air Conditioning' },
  { num: '25', title: 'Integrated Automation' },
  { num: '26', title: 'Electrical' },
  { num: '27', title: 'Communications' },
  { num: '28', title: 'Electronic Safety and Security' },
  { num: '31', title: 'Earthwork' },
  { num: '32', title: 'Exterior Improvements' },
  { num: '33', title: 'Utilities' },
];

/**
 * GET /api/specs/[id]
 * When called with a project UUID, returns spec sections for that project.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { supabase, tenantId } = auth;
  const { id: projectId } = await params;

  const { data, error } = await supabase
    .from('spec_sections')
    .select('*')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .order('section_number');

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ specs: data || [], divisions: CSI_DIVISIONS });
}

/**
 * POST /api/specs/[id]
 * Create a new spec section for the given project.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { supabase, tenantId, userId } = auth;
  const { id: projectId } = await params;

  const body = await req.json();

  if (!body.section_number || !body.section_title) {
    return NextResponse.json(
      { error: 'section_number and section_title are required' },
      { status: 400 },
    );
  }

  // Auto-derive division from section number
  const division = body.section_number?.slice(0, 2) || '01';
  const divTitle = CSI_DIVISIONS.find((d) => d.num === division)?.title || '';

  const { data, error } = await supabase
    .from('spec_sections')
    .insert({
      tenant_id: tenantId,
      project_id: projectId,
      section_number: body.section_number,
      section_title: body.section_title,
      division,
      division_title: divTitle,
      doc_url: body.doc_url || null,
      part_1_general: body.part_1_general || null,
      part_2_products: body.part_2_products || null,
      part_3_execution: body.part_3_execution || null,
      revision: body.revision || '0',
      issued_date: body.issued_date || null,
      notes: body.notes || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
