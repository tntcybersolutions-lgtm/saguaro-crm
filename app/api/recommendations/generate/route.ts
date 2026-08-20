import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * POST /api/recommendations/generate
 * Takes { customer_id }. Loads profile + answers. Queries climate_recommendations
 * for matching state/conditions. Sends data to Claude for 5 personalized AI suggestions.
 * Creates customer_recommendations for all matches + AI suggestions.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { customer_id } = body;
    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const db = createServerClient();

    // Load customer profile
    const { data: customer, error: custErr } = await db
      .from('customer_profiles')
      .select('*')
      .eq('id', customer_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Load all discovery answers
    const { data: answers } = await db
      .from('discovery_answers')
      .select('*')
      .eq('customer_id', customer_id)
      .eq('tenant_id', user.tenantId);

    // Load existing recommendations to avoid duplicates
    const { data: existingRecs } = await db
      .from('customer_recommendations')
      .select('recommendation_key')
      .eq('customer_id', customer_id)
      .eq('tenant_id', user.tenantId);

    const existingKeys = new Set((existingRecs || []).map((r) => r.recommendation_key));

    // --- Climate-based recommendations ---
    // Build conditions from customer profile
    const conditions: string[] = [];
    if (customer.avg_summer_high && customer.avg_summer_high > 95) conditions.push('extreme_heat');
    if (customer.avg_summer_high && customer.avg_summer_high > 85) conditions.push('hot_summers');
    if (customer.avg_winter_low && customer.avg_winter_low < 20) conditions.push('cold_winters');
    if (customer.avg_winter_low && customer.avg_winter_low < 0) conditions.push('extreme_cold');
    if (customer.annual_snowfall_in && customer.annual_snowfall_in > 30) conditions.push('heavy_snow');
    if (customer.annual_rainfall_in && customer.annual_rainfall_in > 50) conditions.push('high_rainfall');
    if (customer.avg_humidity_pct && customer.avg_humidity_pct > 70) conditions.push('high_humidity');
    if (customer.sun_hours_year && customer.sun_hours_year > 2500) conditions.push('high_solar');
    if (customer.wind_zone === 'high') conditions.push('high_wind');
    if (customer.seismic_zone === 'high') conditions.push('seismic');
    if (customer.flood_zone && customer.flood_zone !== 'none') conditions.push('flood_risk');

    // Query climate_recommendations matching state or conditions
    let climateRecs: Array<Record<string, unknown>> = [];
    if (customer.state || conditions.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query: any = db
        .from('climate_recommendations')
        .select('*')
        .eq('is_active', true)
        .eq('tenant_id', user.tenantId);

      if (customer.state) {
        query = query.or(`state.eq.${customer.state},state.is.null`);
      }
      if (conditions.length > 0) {
        query = query.in('condition', conditions);
      }

      const { data } = await query;
      climateRecs = data || [];
    }

    // Insert climate recommendations that don't already exist
    let climateCount = 0;
    for (const rec of climateRecs) {
      const key = rec.recommendation_key as string;
      if (!existingKeys.has(key)) {
        await db.from('customer_recommendations').insert({
          tenant_id: user.tenantId,
          customer_id,
          recommendation_key: key,
          title: rec.title,
          description: rec.description,
          category: rec.category,
          source: 'climate_match',
          estimated_cost_low: rec.estimated_cost_low,
          estimated_cost_high: rec.estimated_cost_high,
          annual_savings: rec.annual_savings,
          roi_years: rec.roi_years,
          priority: rec.priority,
        });
        existingKeys.add(key);
        climateCount++;
      }
    }

    // --- AI-powered personalized recommendations ---
    let aiCount = 0;
    try {
      const answersText = (answers || [])
        .map((a) => `Q: ${a.question_text} → A: ${a.answer_value}`)
        .join('\n');

      const prompt = `You are a home improvement and smart building advisor. Based on the following customer profile and their lifestyle answers, suggest exactly 5 personalized recommendations they would love.

CUSTOMER PROFILE:
- Location: ${customer.city || 'Unknown'}, ${customer.state || 'Unknown'}
- Climate Zone: ${customer.climate_zone || 'Unknown'}
- Summer High: ${customer.avg_summer_high || 'Unknown'}°F
- Winter Low: ${customer.avg_winter_low || 'Unknown'}°F
- Humidity: ${customer.avg_humidity_pct || 'Unknown'}%
- Sun Hours/Year: ${customer.sun_hours_year || 'Unknown'}

LIFESTYLE ANSWERS:
${answersText || 'No answers yet'}

ALREADY RECOMMENDED (do NOT repeat these):
${Array.from(existingKeys).join(', ') || 'None'}

Return ONLY valid JSON array with exactly 5 objects. Each object must have:
- recommendation_key: snake_case unique key
- title: short title
- description: 1-2 sentence description of the benefit
- category: one of "energy", "comfort", "security", "outdoor", "smart_home", "luxury"
- estimated_cost_low: integer
- estimated_cost_high: integer
- annual_savings: integer (0 if no savings)
- priority: integer 1-10

JSON only, no markdown:`;

      const client = new Anthropic();
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      // Extract JSON from response (handle possible markdown wrapping)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const aiSuggestions = JSON.parse(jsonMatch[0]);
        for (const suggestion of aiSuggestions) {
          if (!existingKeys.has(suggestion.recommendation_key)) {
            await db.from('customer_recommendations').insert({
              tenant_id: user.tenantId,
              customer_id,
              recommendation_key: suggestion.recommendation_key,
              title: suggestion.title,
              description: suggestion.description,
              category: suggestion.category,
              source: 'ai_suggested',
              estimated_cost_low: suggestion.estimated_cost_low,
              estimated_cost_high: suggestion.estimated_cost_high,
              annual_savings: suggestion.annual_savings,
              priority: suggestion.priority || 5,
            });
            existingKeys.add(suggestion.recommendation_key);
            aiCount++;
          }
        }
      }
    } catch {
      // AI suggestions are best-effort — don't fail the whole request
    }

    return NextResponse.json({
      climate_recommendations_created: climateCount,
      ai_recommendations_created: aiCount,
      total_created: climateCount + aiCount,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
