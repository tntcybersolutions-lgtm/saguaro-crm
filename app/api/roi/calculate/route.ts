import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

/**
 * Upgrade cost defaults (install cost range) when not specified in roi_configs.
 * These are national averages. roi_configs stores the annual SAVINGS per upgrade.
 */
const UPGRADE_COSTS: Record<string, { cost_low: number; cost_high: number; label: string }> = {
  smart_thermostat:       { cost_low: 250,   cost_high: 500,    label: 'Smart Thermostat' },
  smart_lighting:         { cost_low: 400,   cost_high: 800,    label: 'Smart Lighting (20 bulbs + 4 switches)' },
  solar:                  { cost_low: 15000, cost_high: 30000,  label: 'Solar Panel System (per kW specified in quantity)' },
  smart_irrigation:       { cost_low: 800,   cost_high: 2000,   label: 'Smart Irrigation System' },
  ev_charger:             { cost_low: 1500,  cost_high: 3000,   label: 'EV Charger (Level 2)' },
  insulation_upgrade:     { cost_low: 3000,  cost_high: 8000,   label: 'Insulation Upgrade' },
  heat_pump:              { cost_low: 5000,  cost_high: 12000,  label: 'Heat Pump System' },
  smart_water_heater:     { cost_low: 1200,  cost_high: 3000,   label: 'Smart Water Heater' },
  pool:                   { cost_low: 25000, cost_high: 65000,  label: 'Swimming Pool' },
  adu:                    { cost_low: 80000, cost_high: 200000, label: 'Accessory Dwelling Unit (ADU)' },
  smart_locks:            { cost_low: 300,   cost_high: 600,    label: 'Smart Locks (2)' },
  video_doorbell:         { cost_low: 200,   cost_high: 400,    label: 'Video Doorbell' },
  whole_house_audio:      { cost_low: 2000,  cost_high: 5000,   label: 'Whole-House Audio' },
  smart_blinds:           { cost_low: 1500,  cost_high: 4000,   label: 'Smart Blinds' },
  wifi_mesh:              { cost_low: 500,   cost_high: 1500,   label: 'WiFi Mesh Network' },
};

/**
 * Map upgrade keys to the roi_configs savings column name.
 */
const SAVINGS_MAP: Record<string, string> = {
  smart_thermostat:   'smart_thermostat_savings',
  smart_lighting:     'smart_lighting_savings',
  solar:              'solar_savings_per_kw',
  smart_irrigation:   'smart_irrigation_savings',
  ev_charger:         'ev_charger_savings',
  insulation_upgrade: 'insulation_upgrade_savings',
  heat_pump:          'heat_pump_savings',
  smart_water_heater: 'smart_water_heater_savings',
};

/**
 * Map upgrade keys to the roi_configs home value column.
 */
const VALUE_MAP: Record<string, string> = {
  solar: 'solar_value_per_kw',
  pool:  'pool_value_add',
  adu:   'adu_value_per_sqft',
};

/**
 * POST /api/roi/calculate
 * Pure calculation — no AI.
 * Takes: { state, upgrades: [{ key, quantity? }] }
 * Returns: total_upgrade_cost, annual_savings, monthly_savings, roi_years,
 *          home_value_increase, ten_year_net_savings, breakdown per upgrade.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { state, upgrades } = body;

    if (!state || !upgrades || !Array.isArray(upgrades) || upgrades.length === 0) {
      return NextResponse.json(
        { error: 'state and upgrades array are required' },
        { status: 400 },
      );
    }

    // Load roi_configs for the state
    const db = createServerClient();
    const { data: config } = await db
      .from('roi_configs')
      .select('*')
      .eq('state', state.toUpperCase())
      .limit(1)
      .single();

    if (!config) {
      return NextResponse.json(
        { error: `No ROI configuration found for state: ${state}` },
        { status: 404 },
      );
    }

    let totalCostLow = 0;
    let totalCostHigh = 0;
    let totalAnnualSavings = 0;
    let totalHomeValueIncrease = 0;

    const breakdown: Array<{
      key: string;
      label: string;
      quantity: number;
      cost_low: number;
      cost_high: number;
      annual_savings: number;
      home_value_increase: number;
    }> = [];

    for (const upgrade of upgrades) {
      const key = upgrade.key as string;
      const quantity = (upgrade.quantity as number) || 1;

      const costInfo = UPGRADE_COSTS[key];
      if (!costInfo) continue; // skip unknown upgrade keys

      const costLow = costInfo.cost_low * quantity;
      const costHigh = costInfo.cost_high * quantity;

      // Look up annual savings from config
      let annualSavings = 0;
      const savingsCol = SAVINGS_MAP[key];
      if (savingsCol && config[savingsCol] !== undefined) {
        // For solar, savings is per kW * quantity
        annualSavings = Number(config[savingsCol]) * (key === 'solar' ? quantity : 1);
      }

      // Look up home value increase
      let homeValue = 0;
      const valueCol = VALUE_MAP[key];
      if (valueCol && config[valueCol] !== undefined) {
        if (key === 'solar') {
          homeValue = Number(config[valueCol]) * quantity;
        } else if (key === 'adu') {
          homeValue = Number(config[valueCol]) * quantity; // quantity = sqft
        } else {
          homeValue = Number(config[valueCol]);
        }
      }

      // Smart home general value increase (5% of home price)
      if (!valueCol && ['smart_thermostat', 'smart_lighting', 'smart_locks', 'smart_blinds'].includes(key)) {
        const pct = parseFloat(String(config.smart_home_value_pct)) || 5;
        const homePrice = Number(config.avg_home_price) || 400000;
        // Distribute the smart home value bump across the 4 typical items
        homeValue = Math.round((homePrice * pct / 100) / 4);
      }

      totalCostLow += costLow;
      totalCostHigh += costHigh;
      totalAnnualSavings += annualSavings;
      totalHomeValueIncrease += homeValue;

      breakdown.push({
        key,
        label: costInfo.label,
        quantity,
        cost_low: costLow,
        cost_high: costHigh,
        annual_savings: annualSavings,
        home_value_increase: homeValue,
      });
    }

    const avgCost = (totalCostLow + totalCostHigh) / 2;
    const roiYears = totalAnnualSavings > 0
      ? parseFloat((avgCost / totalAnnualSavings).toFixed(1))
      : 0;
    const tenYearNetSavings = totalAnnualSavings * 10 - avgCost;

    return NextResponse.json({
      state: state.toUpperCase(),
      utility_rates: {
        electricity_kwh: config.electricity_kwh,
        gas_therm: config.gas_therm,
        water_gallon: config.water_gallon,
      },
      total_upgrade_cost: {
        low: totalCostLow,
        high: totalCostHigh,
        average: Math.round(avgCost),
      },
      annual_savings: totalAnnualSavings,
      monthly_savings: Math.round(totalAnnualSavings / 12),
      roi_years: roiYears,
      home_value_increase: totalHomeValueIncrease,
      ten_year_net_savings: Math.round(tenYearNetSavings),
      breakdown,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
