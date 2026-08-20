import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TRADE_SYSTEM_PROMPTS: Record<string, string> = {
  electrical: `You are a master electrician and electrical engineer with 25+ years in commercial and industrial construction. You are deeply familiar with:
- NEC (National Electrical Code) latest edition
- NFPA 70E Arc Flash safety standards
- IEEE standards for power distribution
- State and local electrical codes
- Conduit fill calculations, voltage drop, ampacity tables
- Motor control circuits, VFDs, PLC integration
- Fire alarm systems (NFPA 72)
- Emergency/standby power (NEC Article 700/701/702)`,

  plumbing: `You are a master plumber with 25+ years in commercial construction. You are deeply familiar with:
- IPC (International Plumbing Code) and UPC (Uniform Plumbing Code)
- Medical gas systems (NFPA 99)
- Backflow prevention and cross-connection control
- Drainage, waste, and vent (DWV) system design
- Domestic water sizing and distribution
- Natural gas piping (NFPA 54)
- Grease interceptor sizing
- Storm water management`,

  hvac: `You are a senior HVAC engineer with 25+ years designing and installing commercial mechanical systems. You are deeply familiar with:
- ASHRAE standards (62.1 ventilation, 90.1 energy, 55 thermal comfort)
- IMC (International Mechanical Code)
- Ductwork design and sizing (SMACNA standards)
- Chiller and boiler plant design
- Variable air volume (VAV) systems
- Building automation systems (BACnet, DDC)
- Refrigerant regulations (EPA 608)
- Energy recovery ventilation`,

  'low-voltage': `You are a senior low-voltage systems engineer with 25+ years in commercial construction IT/AV/security. You are deeply familiar with:
- TIA/EIA-568 structured cabling standards
- BICSI TDMM (Telecommunications Distribution Methods Manual)
- Network design (VLANs, subnetting, firewall rules)
- IP camera and access control system design
- Audio/visual system integration
- Distributed antenna systems (DAS)
- Building automation protocol integration
- WiFi site surveys and AP placement`,

  fire_protection: `You are a fire protection engineer with 25+ years in commercial construction. You are deeply familiar with:
- NFPA 13 (Sprinkler Systems)
- NFPA 72 (Fire Alarm Systems)
- NFPA 25 (Inspection, Testing, Maintenance)
- NFPA 20 (Fire Pumps)
- Clean agent suppression systems
- Smoke control and pressurization
- Fire dampers and fire stopping
- AHJ requirements and plan review`,

  general: `You are a senior construction superintendent with 25+ years across all trades in commercial construction. You have deep knowledge of building codes (IBC, IRC), OSHA safety regulations, construction best practices, material specifications, and project coordination across trades.`,
};

/**
 * POST /api/ai/trade-assistant
 * Takes { question, trade, context } — returns structured answer.
 * Regular JSON response (not SSE).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { question, trade, context } = body;

    if (!question) {
      return NextResponse.json({ error: 'question is required' }, { status: 400 });
    }

    const tradeLower = (trade || 'general').toLowerCase();
    const systemPrompt = TRADE_SYSTEM_PROMPTS[tradeLower] || TRADE_SYSTEM_PROMPTS.general;

    // Optionally look up related knowledge articles for RAG context
    const db = createServerClient();
    let knowledgeContext = '';

    if (trade) {
      const { data: articles } = await db
        .from('trade_knowledge')
        .select('title, summary, content')
        .eq('tenant_id', user.tenantId)
        .eq('trade', trade)
        .order('view_count', { ascending: false })
        .limit(3);

      if (articles && articles.length > 0) {
        knowledgeContext = '\n\nRelevant knowledge base articles:\n' +
          articles.map((a: any) => `- ${a.title}: ${a.summary}`).join('\n');
      }
    }

    const userPrompt = `${question}
${context ? `\nAdditional context: ${context}` : ''}${knowledgeContext}

Provide a detailed, practical answer structured as:
1. Direct answer to the question
2. Step-by-step procedure (if applicable)
3. Code references (NEC, IPC, IMC, NFPA, TIA, etc. — cite specific articles/sections)
4. Tools and materials needed
5. Safety notes and PPE requirements
6. Common mistakes to avoid
7. Pro tips from field experience

Return as JSON:
{
  "answer": "Direct answer...",
  "steps": ["Step 1...", "Step 2..."],
  "code_references": [
    { "code": "NEC", "section": "Article 210.12", "description": "AFCI protection requirements" }
  ],
  "tools_needed": ["Tool 1", "Tool 2"],
  "materials_needed": ["Material 1", "Material 2"],
  "safety_notes": ["Safety note 1", "Safety note 2"],
  "common_mistakes": ["Mistake 1", "Mistake 2"],
  "pro_tips": ["Tip 1", "Tip 2"],
  "estimated_time": "2-4 hours",
  "difficulty": "intermediate",
  "requires_permit": true,
  "requires_inspection": true
}`;

    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let result: any = {};
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch {
      result = {
        answer: responseText,
        steps: [],
        code_references: [],
        tools_needed: [],
        safety_notes: [],
      };
    }

    return NextResponse.json({
      trade: tradeLower,
      question,
      result,
    }, { status: 200 });
  } catch (err: any) {
    console.error('[trade-assistant]', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
