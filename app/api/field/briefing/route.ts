import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';
import Anthropic from '@anthropic-ai/sdk';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
    }

    const db = createServerClient();
    const today = new Date().toISOString().split('T')[0];

    // Check for cached briefing from today
    const { data: cached } = await db
      .from('ai_briefings')
      .select('*')
      .eq('project_id', projectId)
      .eq('tenant_id', user.tenantId)
      .eq('briefing_date', today)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (cached) {
      return NextResponse.json({ briefing: cached, source: 'cache' });
    }

    // Gather project context data in parallel
    const [rfisRes, insuranceRes, approvalsRes, punchRes, projectRes] = await Promise.all([
      db.from('rfis').select('id, rfi_number, subject, status, due_date')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).eq('status', 'open'),
      db.from('insurance_certificates').select('id, company_name, policy_type, expiration_date')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId)
        .lte('expiration_date', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
      db.from('change_orders').select('id, title, status, amount')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).eq('status', 'pending'),
      db.from('punch_list').select('id, title, status, location')
        .eq('project_id', projectId).eq('tenant_id', user.tenantId).in('status', ['open', 'in_progress']),
      db.from('projects').select('name, address, city, state')
        .eq('id', projectId).eq('tenant_id', user.tenantId).single(),
    ]);

    const contextData = {
      openRfis: rfisRes.data || [],
      expiringInsurance: insuranceRes.data || [],
      pendingApprovals: approvalsRes.data || [],
      openPunch: punchRes.data || [],
      project: projectRes.data,
    };

    // Fetch weather if project has location
    let weatherInfo = 'Weather data unavailable';
    if (projectRes.data?.city && projectRes.data?.state) {
      try {
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(projectRes.data.city + ' ' + projectRes.data.state)}&count=1`
        );
        const geoData = await geoRes.json();
        if (geoData.results?.[0]) {
          const { latitude, longitude } = geoData.results[0];
          const wxRes = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&timezone=auto&forecast_days=1`
          );
          const wxData = await wxRes.json();
          if (wxData.daily) {
            weatherInfo = `High: ${wxData.daily.temperature_2m_max[0]}°F, Low: ${wxData.daily.temperature_2m_min[0]}°F, Precip: ${wxData.daily.precipitation_sum[0]}mm, Code: ${wxData.daily.weathercode[0]}`;
          }
        }
      } catch {
        // weather is best-effort
      }
    }

    // Generate briefing via Claude
    const client = new Anthropic();
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `Generate a concise daily field briefing for the construction project "${projectRes.data?.name || 'Unknown'}". Today is ${today}.

Context:
- Open RFIs (${contextData.openRfis.length}): ${JSON.stringify(contextData.openRfis.slice(0, 10))}
- Expiring Insurance (next 30 days): ${JSON.stringify(contextData.expiringInsurance.slice(0, 5))}
- Pending Approvals: ${JSON.stringify(contextData.pendingApprovals.slice(0, 5))}
- Open Punch List Items (${contextData.openPunch.length}): ${JSON.stringify(contextData.openPunch.slice(0, 10))}
- Weather: ${weatherInfo}

Provide a structured briefing with: 1) Weather alert if relevant, 2) Top priorities, 3) Items needing attention, 4) Safety notes. Keep it actionable and concise.`,
      }],
    });

    const briefingText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Save to ai_briefings
    const { data: saved, error: saveError } = await db
      .from('ai_briefings')
      .insert({
        tenant_id: user.tenantId,
        project_id: projectId,
        briefing_date: today,
        briefing_text: briefingText,
        context_data: contextData,
        generated_by: user.id,
      })
      .select()
      .single();

    if (saveError) {
      return NextResponse.json({ error: 'Failed to save briefing', details: saveError.message }, { status: 500 });
    }

    return NextResponse.json({ briefing: saved, source: 'generated' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
