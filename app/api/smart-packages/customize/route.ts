import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, getUser } from '@/lib/supabase-server';

/**
 * POST /api/smart-packages/customize
 * Takes { customer_id, tier }. Loads the package items + customer's roi_configs
 * for their state. Calculates personalized ROI adjusted for local utility/labor rates.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { customer_id, tier } = body;

    if (!customer_id || tier === undefined) {
      return NextResponse.json({ error: 'customer_id and tier are required' }, { status: 400 });
    }

    const db = createServerClient();

    // Load customer profile for location
    const { data: customer, error: custErr } = await db
      .from('customer_profiles')
      .select('state, city, climate_zone, utility_cost_kwh, utility_cost_gas')
      .eq('id', customer_id)
      .eq('tenant_id', user.tenantId)
      .single();

    if (custErr || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Load the package
    const { data: pkg, error: pkgErr } = await db
      .from('smart_packages')
      .select('*')
      .eq('tier', tier)
      .eq('is_active', true)
      .single();

    if (pkgErr || !pkg) {
      return NextResponse.json({ error: 'Package not found for this tier' }, { status: 404 });
    }

    // Load roi_configs for customer's state
    let roiConfig: Record<string, unknown> | null = null;
    if (customer.state) {
      const { data } = await db
        .from('roi_configs')
        .select('*')
        .eq('state', customer.state)
        .limit(1)
        .single();
      roiConfig = data;
    }

    // Calculate personalized numbers
    // Base: AZ rates. If customer is in a different state, adjust proportionally.
    const baseElectricity = 0.128; // AZ baseline $/kWh
    const baseGas = 1.05;          // AZ baseline $/therm

    const customerElectricity = roiConfig
      ? parseFloat(String(roiConfig.electricity_kwh))
      : baseElectricity;
    const customerGas = roiConfig
      ? parseFloat(String(roiConfig.gas_therm))
      : baseGas;

    const electricityMultiplier = customerElectricity / baseElectricity;
    const gasMultiplier = customerGas / baseGas;
    // Average the two for general cost adjustment
    const costMultiplier = (electricityMultiplier + gasMultiplier) / 2;

    // Adjust each item
    const items = (pkg.items as Array<{
      name: string;
      cost_low: number;
      cost_high: number;
      annual_savings: number;
    }>).map((item) => {
      const adjustedSavings = Math.round(item.annual_savings * electricityMultiplier);
      const adjustedCostLow = Math.round(item.cost_low * costMultiplier);
      const adjustedCostHigh = Math.round(item.cost_high * costMultiplier);

      return {
        ...item,
        original_cost_low: item.cost_low,
        original_cost_high: item.cost_high,
        original_annual_savings: item.annual_savings,
        cost_low: adjustedCostLow,
        cost_high: adjustedCostHigh,
        annual_savings: adjustedSavings,
      };
    });

    const totalCostLow = items.reduce((s, i) => s + i.cost_low, 0);
    const totalCostHigh = items.reduce((s, i) => s + i.cost_high, 0);
    const totalAnnualSavings = items.reduce((s, i) => s + i.annual_savings, 0);
    const avgCost = (totalCostLow + totalCostHigh) / 2;
    const roiYears = totalAnnualSavings > 0
      ? parseFloat((avgCost / totalAnnualSavings).toFixed(1))
      : 0;
    const tenYearNetSavings = totalAnnualSavings * 10 - avgCost;

    // Home value increase
    const avgHomePrice = roiConfig ? Number(roiConfig.avg_home_price) || 400000 : 400000;
    const smartHomePct = roiConfig ? parseFloat(String(roiConfig.smart_home_value_pct)) || 5 : 5;
    const homeValueIncrease = Math.round(avgHomePrice * (smartHomePct / 100));

    return NextResponse.json({
      package: {
        ...pkg,
        items,
      },
      personalized: {
        state: customer.state,
        electricity_rate: customerElectricity,
        gas_rate: customerGas,
        cost_multiplier: parseFloat(costMultiplier.toFixed(2)),
        total_cost_low: totalCostLow,
        total_cost_high: totalCostHigh,
        total_annual_savings: totalAnnualSavings,
        monthly_savings: Math.round(totalAnnualSavings / 12),
        roi_years: roiYears,
        home_value_increase: homeValueIncrease,
        ten_year_net_savings: Math.round(tenYearNetSavings),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
