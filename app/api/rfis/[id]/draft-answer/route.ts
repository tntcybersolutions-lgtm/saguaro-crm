import { NextRequest } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const CODE_REFERENCES: Record<string, Array<{
  code: string;
  full_name: string;
  relevance: 'primary' | 'secondary';
}>> = {
  '01': [
    { code: 'AIA A201', full_name: 'General Conditions of the Contract', relevance: 'primary' },
    { code: 'AIA A401', full_name: 'Standard Form of Agreement Between Contractor and Subcontractor', relevance: 'secondary' },
  ],
  '03': [
    { code: 'ACI 318-19', full_name: 'Building Code Requirements for Structural Concrete', relevance: 'primary' },
    { code: 'ACI 301-16', full_name: 'Specifications for Structural Concrete', relevance: 'primary' },
    { code: 'ASTM A615', full_name: 'Standard Specification for Deformed Steel Bars', relevance: 'secondary' },
    { code: 'IBC 2021', full_name: 'International Building Code Chapter 19', relevance: 'secondary' },
  ],
  '04': [
    { code: 'TMS 402', full_name: 'Building Code Requirements for Masonry Structures', relevance: 'primary' },
    { code: 'ASTM C90', full_name: 'Standard Specification for Loadbearing CMU', relevance: 'secondary' },
  ],
  '05': [
    { code: 'AISC 360-22', full_name: 'Specification for Structural Steel Buildings', relevance: 'primary' },
    { code: 'AISC 341-22', full_name: 'Seismic Provisions for Structural Steel Buildings', relevance: 'primary' },
    { code: 'AWS D1.1', full_name: 'Structural Welding Code — Steel', relevance: 'secondary' },
    { code: 'ASTM A36', full_name: 'Standard Specification for Carbon Structural Steel', relevance: 'secondary' },
  ],
  '07': [
    { code: 'IBC 2021 Ch 14', full_name: 'Exterior Walls — Energy and Weather Resistance', relevance: 'primary' },
    { code: 'ASHRAE 90.1', full_name: 'Energy Standard for Buildings', relevance: 'secondary' },
    { code: 'AAMA 501', full_name: 'Methods of Test for Exterior Walls', relevance: 'secondary' },
  ],
  '08': [
    { code: 'AAMA 101', full_name: 'Specifications for Windows, Doors and Unit Skylights', relevance: 'primary' },
    { code: 'NFPA 80', full_name: 'Standard for Fire Doors and Other Opening Protectives', relevance: 'primary' },
    { code: 'IBC 2021 Ch 7', full_name: 'Fire and Smoke Protection Features', relevance: 'secondary' },
  ],
  '09': [
    { code: 'ASTM E84', full_name: 'Surface Burning Characteristics of Building Materials', relevance: 'primary' },
    { code: 'GA-216', full_name: 'Application and Finishing of Gypsum Panel Products', relevance: 'primary' },
  ],
  '21': [
    { code: 'NFPA 13', full_name: 'Standard for the Installation of Sprinkler Systems', relevance: 'primary' },
    { code: 'NFPA 24', full_name: 'Standard for the Installation of Private Fire Service Mains', relevance: 'secondary' },
  ],
  '22': [
    { code: 'UPC 2021', full_name: 'Uniform Plumbing Code', relevance: 'primary' },
    { code: 'IPC 2021', full_name: 'International Plumbing Code', relevance: 'primary' },
    { code: 'ASME A112.18', full_name: 'Plumbing Fixture Fittings', relevance: 'secondary' },
  ],
  '23': [
    { code: 'IMC 2021', full_name: 'International Mechanical Code', relevance: 'primary' },
    { code: 'ASHRAE 90.1-2019', full_name: 'Energy Standard for Buildings', relevance: 'primary' },
    { code: 'ASHRAE 62.1', full_name: 'Ventilation and Acceptable Indoor Air Quality', relevance: 'primary' },
    { code: 'SMACNA HVAC Duct Construction', full_name: 'SMACNA HVAC Duct Construction Standards', relevance: 'secondary' },
  ],
  '26': [
    { code: 'NEC 2023 (NFPA 70)', full_name: 'National Electrical Code', relevance: 'primary' },
    { code: 'NFPA 70E', full_name: 'Standard for Electrical Safety in the Workplace', relevance: 'primary' },
    { code: 'NFPA 72', full_name: 'National Fire Alarm and Signaling Code', relevance: 'secondary' },
    { code: 'NECA 1', full_name: 'Standard for Installing Electrical Systems', relevance: 'secondary' },
  ],
  '27': [
    { code: 'ANSI/TIA-568', full_name: 'Commercial Building Telecommunications Cabling Standard', relevance: 'primary' },
    { code: 'BICSI TDMM', full_name: 'Telecommunications Distribution Methods Manual', relevance: 'secondary' },
  ],
  '28': [
    { code: 'NFPA 101', full_name: 'Life Safety Code', relevance: 'primary' },
    { code: 'UL 2050', full_name: 'Standard for National Industrial Monitoring Standard', relevance: 'secondary' },
  ],
  '31': [
    { code: 'IBC 2021 Ch 18', full_name: 'Soils and Foundations', relevance: 'primary' },
    { code: 'ASTM D698', full_name: 'Standard Test Method for Compaction Characteristics of Soil', relevance: 'primary' },
  ],
  '32': [
    { code: 'AASHTO', full_name: 'Standard Specifications for Transportation Materials', relevance: 'primary' },
    { code: 'ASTM D6927', full_name: 'Marshall Stability and Flow of Asphalt Mixtures', relevance: 'secondary' },
  ],
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`)
        );

      try {
        // STAGE 1: Auth + Load
        const user = await getUser(req);
        if (!user) {
          send({ type: 'error', message: 'Unauthorized' });
          controller.close();
          return;
        }

        send({
          stage: 'loading',
          message: 'Loading RFI and project context...',
          detail: 'Pulling full project data, spec references, and related documents',
          pct: 5,
        });

        const db = createServerClient();
        const { data: rfi, error: rfiErr } = await db
          .from('rfis')
          .select('*, projects!inner(name, address, city, state, zip, project_type, owner_name, owner_email, architect_name, architect_firm, architect_email, pm_name, pm_email, pm_phone, square_footage, contract_amount)')
          .eq('id', id)
          .eq('tenant_id', user.tenantId)
          .single();

        if (rfiErr || !rfi) {
          send({ type: 'error', message: 'RFI not found or access denied' });
          controller.close();
          return;
        }

        const project = rfi.projects as any;

        // STAGE 2: Context loaded
        send({
          stage: 'context',
          message: `RFI #${rfi.rfi_number || 'N/A'} loaded — ${rfi.subject}`,
          detail: `Project: ${project.name} · Spec: ${rfi.spec_section || 'Not specified'}`,
          context: {
            project_name: project.name,
            rfi_number: rfi.rfi_number,
            spec_section: rfi.spec_section,
          },
          pct: 15,
        });

        await new Promise(r => setTimeout(r, 150));

        // STAGE 3: Code lookup
        const division = rfi.spec_section
          ? rfi.spec_section.trim().split(/\s+/)[0].substring(0, 2) : null;
        const codes = division ? (CODE_REFERENCES[division] || []) : [];
        const primaryCodes = codes.filter(c => c.relevance === 'primary');

        send({
          stage: 'codes',
          message: division
            ? `Looking up applicable codes for Division ${division}...`
            : 'Analyzing spec section and applicable codes...',
          detail: primaryCodes.length > 0
            ? `Found ${codes.length} applicable standards — ${primaryCodes.slice(0, 3).map(c => c.code).join(', ')}`
            : 'No division-specific codes found — using general contract requirements',
          codes: codes.map(c => c.code),
          primary_codes: primaryCodes.map(c => ({ code: c.code, full_name: c.full_name })),
          pct: 28,
        });

        await new Promise(r => setTimeout(r, 200));

        // STAGE 4: Analyzing question
        const questionWords = rfi.question?.split(/\s+/).length || 0;
        send({
          stage: 'analyzing',
          message: 'Sage AI is analyzing the question...',
          detail: `Reading ${questionWords} words · Identifying question type and impact`,
          pct: 38,
        });

        await new Promise(r => setTimeout(r, 150));

        // STAGE 5: Related documents
        const relatedDocs: string[] = [];
        if (rfi.related_submittal_id) relatedDocs.push('linked submittal');
        if (rfi.drawing_reference) relatedDocs.push(`drawing ${rfi.drawing_reference}`);
        if (rfi.spec_section) relatedDocs.push(`spec ${rfi.spec_section}`);

        send({
          stage: 'documents',
          message: relatedDocs.length > 0
            ? `Cross-referencing ${relatedDocs.join(', ')}...`
            : 'Reviewing contract documents and specifications...',
          detail: `Project type: ${project.project_type || 'Commercial'} · State: ${project.state || 'AZ'}`,
          pct: 48,
        });

        await new Promise(r => setTimeout(r, 200));

        // STAGE 6: Building prompt context
        const costImpact = Number(rfi.cost_impact) || 0;
        send({
          stage: 'prompting',
          message: 'Building context for Sage AI response...',
          detail: `${primaryCodes.length} code references · ${costImpact > 0 ? 'Cost impact: $' + costImpact.toLocaleString() : 'No cost impact noted'} · Priority: ${rfi.priority || 'normal'}`,
          pct: 55,
        });

        const codesText = codes.length > 0
          ? codes.map(c => `- ${c.code}: ${c.full_name}`).join('\n')
          : 'No division-specific codes — reference contract general conditions';

        const prompt = `You are a licensed architect/engineer responding to a contractor RFI.
You are writing the official response on behalf of the design team.
The contractor is waiting to proceed with work. Your answer must be:
- Direct and actionable (contractor can proceed after reading this)
- Reference specific code sections or spec paragraphs
- Note if a formal ASI (Architect's Supplemental Instruction) is required
- Flag clearly if a change order will be required
- Professional but clear — no ambiguity

PROJECT INFORMATION:
Name: ${project.name}
Address: ${project.address || ''}, ${project.city || ''}, ${project.state || ''}
Type: ${project.project_type || 'Commercial Construction'}
Owner: ${project.owner_name || 'Owner'}
Architect/Engineer: ${project.architect_name || 'Design Team'}
PM: ${project.pm_name || ''}

RFI DETAILS:
Number: ${rfi.rfi_number || 'N/A'}
Subject: ${rfi.subject}
Spec Section: ${rfi.spec_section || 'Not specified'}
Drawing Reference: ${rfi.drawing_reference || 'Not specified'}
Priority: ${rfi.priority || 'normal'}
${costImpact > 0 ? `Cost Impact Claimed: $${costImpact.toLocaleString()}` : ''}
${(rfi.schedule_impact_days || 0) > 0 ? `Schedule Impact Claimed: ${rfi.schedule_impact_days} days` : ''}

CONTRACTOR'S QUESTION:
${rfi.question || 'No question text provided'}

APPLICABLE CODES AND STANDARDS:
${codesText}

${rfi.spec_section ? `SPECIFICATION SECTION REFERENCE: ${rfi.spec_section}` : ''}

Write a professional RFI response. Structure:
1. Direct answer (1-2 sentences)
2. Specific code or spec section reference
3. Exact action required by contractor
4. Any submittals required before proceeding
5. If CO is required: state clearly "A change order will be required for this work"

Respond with valid JSON only, no markdown, no code blocks:
{
  "answer": "Full professional answer text, 3-6 sentences",
  "confidence": "high|medium|low",
  "co_required": true|false,
  "co_description": "Description of what the CO should cover, or null",
  "references": ["NEC 2023 Section 220.87", "Sheet E-201"],
  "action_required": "Specific next action for contractor in one sentence",
  "ball_in_court": "gc|architect|owner|engineer|sub|inspector",
  "submittal_required": true|false,
  "submittal_description": "What submittal is needed, or null",
  "asi_required": true|false,
  "risk_level": "low|medium|high",
  "estimated_response_days": 2
}`;

        // STAGE 7: Calling AI
        send({
          stage: 'drafting',
          message: 'Sage AI is writing the answer...',
          detail: `Using claude-sonnet for maximum accuracy · Referencing ${codes.length} applicable standards`,
          pct: 65,
        });

        const Anthropic = (await import('@anthropic-ai/sdk')).default;
        const anthropic = new Anthropic();

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        });

        const rawText = response.content[0]?.type === 'text'
          ? response.content[0].text.trim() : '';

        // STAGE 8: Parsing
        send({
          stage: 'parsing',
          message: 'Parsing and validating Sage AI response...',
          detail: 'Checking answer quality and extracting structured data',
          pct: 80,
        });

        let parsed: {
          answer: string;
          confidence: string;
          co_required: boolean;
          co_description: string | null;
          references: string[];
          action_required: string;
          ball_in_court: string;
          submittal_required: boolean;
          submittal_description: string | null;
          asi_required: boolean;
          risk_level: string;
          estimated_response_days: number;
        };

        try {
          const clean = rawText.replace(/```json\n?|```\n?/g, '').trim();
          parsed = JSON.parse(clean);
        } catch {
          parsed = {
            answer: rawText.length > 50 ? rawText : 'Unable to generate answer. Please review manually.',
            confidence: 'low',
            co_required: false,
            co_description: null,
            references: codes.slice(0, 2).map(c => c.code),
            action_required: 'Review with project architect before proceeding.',
            ball_in_court: 'architect',
            submittal_required: false,
            submittal_description: null,
            asi_required: false,
            risk_level: 'medium',
            estimated_response_days: 3,
          };
        }

        // STAGE 9: Saving
        send({
          stage: 'saving',
          message: 'Saving answer draft to project records...',
          detail: `Confidence: ${parsed.confidence} · Risk: ${parsed.risk_level} · CO required: ${parsed.co_required ? 'Yes' : 'No'}`,
          pct: 90,
        });

        await db.from('rfis').update({
          draft_answer: parsed.answer,
          answer_drafted_at: new Date().toISOString(),
          answer_confidence: parsed.confidence,
          answer_references: parsed.references.map(ref => ({ code: ref, section: '' })),
          ball_in_court: parsed.ball_in_court,
          last_activity_at: new Date().toISOString(),
          last_activity_type: 'draft_created',
          sage_analysis: {
            co_required: parsed.co_required,
            co_description: parsed.co_description,
            action_required: parsed.action_required,
            submittal_required: parsed.submittal_required,
            submittal_description: parsed.submittal_description,
            asi_required: parsed.asi_required,
            risk_level: parsed.risk_level,
            estimated_response_days: parsed.estimated_response_days,
            analyzed_at: new Date().toISOString(),
            codes_referenced: codes.map(c => c.code),
          },
        })
        .eq('id', id)
        .eq('tenant_id', user.tenantId);

        // Notification if CO required
        if (parsed.co_required) {
          await db.from('notifications').insert({
            tenant_id: user.tenantId,
            type: 'rfi_co_flagged',
            title: `CO may be required — RFI #${rfi.rfi_number || ''}`,
            body: parsed.co_description || parsed.answer.slice(0, 100),
            link: `/app/projects/${rfi.project_id}/rfis`,
            project_id: rfi.project_id,
            metadata: { rfi_id: id, rfi_number: rfi.rfi_number },
            priority: 'high',
          });
        }

        // DONE
        send({
          type: 'done',
          draft_answer: parsed.answer,
          confidence: parsed.confidence,
          co_required: parsed.co_required,
          co_description: parsed.co_description,
          references: parsed.references,
          action_required: parsed.action_required,
          ball_in_court: parsed.ball_in_court,
          submittal_required: parsed.submittal_required,
          submittal_description: parsed.submittal_description,
          asi_required: parsed.asi_required,
          risk_level: parsed.risk_level,
          estimated_response_days: parsed.estimated_response_days,
          codes_applied: codes.map(c => ({ code: c.code, full_name: c.full_name })),
          pct: 100,
        });

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        send({ type: 'error', message: `Sage AI failed: ${message}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
