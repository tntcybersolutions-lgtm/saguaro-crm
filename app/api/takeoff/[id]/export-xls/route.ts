import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

const LABOR_RATE = 65; // $/hr blended field labor rate
const MARKUP     = 0.15; // 15% sell price markup

const CSI_DIVISION_NAMES: Record<string, string> = {
  '01': 'General Requirements', '02': 'Existing Conditions', '03': 'Concrete',
  '04': 'Masonry', '05': 'Metals', '06': 'Wood, Plastics, Composites',
  '07': 'Thermal and Moisture Protection', '08': 'Openings', '09': 'Finishes',
  '10': 'Specialties', '11': 'Equipment', '12': 'Furnishings',
  '21': 'Fire Suppression', '22': 'Plumbing', '23': 'HVAC',
  '26': 'Electrical', '27': 'Communications', '28': 'Electronic Safety',
  '31': 'Earthwork', '32': 'Exterior Improvements', '33': 'Utilities',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: takeoffId } = await params;
  const supabase = createServerClient();

  // 1. Load takeoff summary
  const { data: takeoff, error: tErr } = await supabase
    .from('takeoffs')
    .select('*')
    .eq('id', takeoffId)
    .single();

  if (tErr || !takeoff) {
    return NextResponse.json({ error: 'Takeoff not found' }, { status: 404 });
  }

  // 2. Load materials ordered by sort_order
  const { data: materials } = await supabase
    .from('takeoff_materials')
    .select('*')
    .eq('takeoff_id', takeoffId)
    .order('sort_order', { ascending: true });

  const mats = (materials || []) as Array<{
    csi_code: string; csi_name: string; description: string;
    quantity: number; unit: string; unit_cost: number;
    total_cost: number; labor_hours: number; notes: string;
  }>;

  // 3. Enrich with sell price & job cost
  const rows = mats.map((m) => {
    const totalCost   = Number(m.total_cost)  || 0;
    const unitCost    = Number(m.unit_cost)   || 0;
    const laborHours  = Number(m.labor_hours) || 0;
    const laborCost   = laborHours * LABOR_RATE;
    const sellPrice   = totalCost * (1 + MARKUP);
    const jobCost     = totalCost + laborCost;
    return {
      csiCode:    m.csi_code || '',
      div:        (m.csi_code || '').slice(0, 2),
      csiName:    m.csi_name || '',
      description: m.description || '',
      quantity:   Number(m.quantity) || 0,
      unit:       m.unit || '',
      unitCost,
      totalCost,
      laborHours,
      laborCost,
      sellPrice,
      jobCost,
    };
  });

  // 4. Build workbook
  const wb = XLSX.utils.book_new();

  // ── SHEET 1: SUMMARY ──────────────────────────────────────────────────────────
  {
    const grandTotal    = rows.reduce((s, r) => s + r.totalCost, 0);
    const grandLabor    = rows.reduce((s, r) => s + r.laborCost, 0);
    const grandSell     = rows.reduce((s, r) => s + r.sellPrice, 0);
    const grandJob      = rows.reduce((s, r) => s + r.jobCost, 0);
    const contingencyPct = Number((takeoff as Record<string, unknown>).contingency_pct) || 10;
    const contingency   = grandTotal * (contingencyPct / 100);

    const summaryData = [
      ['SAGUARO CRM — MATERIAL TAKEOFF SUMMARY'],
      [],
      ['Project',        (takeoff as Record<string, unknown>).project_name_detected as string || 'N/A'],
      ['Building Type',  (takeoff as Record<string, unknown>).building_type as string || 'N/A'],
      ['Square Feet',    Number((takeoff as Record<string, unknown>).building_area) || 0],
      ['Floors',         Number((takeoff as Record<string, unknown>).floor_count)  || 1],
      ['Confidence',     `${Number((takeoff as Record<string, unknown>).confidence) || 0}%`],
      ['Analyzed',       (takeoff as Record<string, unknown>).analyzed_at ? new Date((takeoff as Record<string, unknown>).analyzed_at as string).toLocaleDateString() : ''],
      ['Generated',      new Date().toLocaleDateString()],
      [],
      ['COST SUMMARY', '', '', ''],
      ['Category', 'Amount', 'Per SF', ''],
      ['Material Cost',   Number((takeoff as Record<string, unknown>).material_cost) || 0,
        Number((takeoff as Record<string, unknown>).building_area) > 0
          ? ((Number((takeoff as Record<string, unknown>).material_cost) || 0) / Number((takeoff as Record<string, unknown>).building_area))
          : 0,
      ''],
      ['Labor Cost',      Number((takeoff as Record<string, unknown>).labor_cost) || 0,
        Number((takeoff as Record<string, unknown>).building_area) > 0
          ? ((Number((takeoff as Record<string, unknown>).labor_cost) || 0) / Number((takeoff as Record<string, unknown>).building_area))
          : 0,
      ''],
      [`Contingency (${contingencyPct}%)`, contingency,
        Number((takeoff as Record<string, unknown>).building_area) > 0
          ? contingency / Number((takeoff as Record<string, unknown>).building_area)
          : 0,
      ''],
      ['TOTAL PROJECT COST', Number((takeoff as Record<string, unknown>).total_cost) || 0, '', ''],
      [],
      ['SELL ANALYSIS', '', '', ''],
      ['Total Material Cost (Cost)',  grandTotal,  '', ''],
      ['Total Labor (Burdened @$65/hr)', grandLabor, '', ''],
      ['Total Job Cost',             grandJob,    '', ''],
      [`Sell Price (Cost + ${(MARKUP * 100).toFixed(0)}% markup)`, grandSell, '', ''],
      ['Gross Margin',               grandSell - grandJob, '', ''],
      [],
      ['LINE ITEM SUMMARY', '', '', ''],
      ['Total Line Items', rows.length, '', ''],
      ['Divisions', [...new Set(rows.map(r => r.div))].length, '', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(summaryData);
    ws['!cols'] = [{ wch: 36 }, { wch: 18 }, { wch: 14 }, { wch: 10 }];

    // Apply currency format to B column for cost rows (rows 12-20)
    const currFmt = '$#,##0';
    const perSfFmt = '$#,##0.00';
    for (let r = 11; r <= 22; r++) {
      const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
      if (cellB && cellB.t === 'n') cellB.z = currFmt;
      const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })];
      if (cellC && cellC.t === 'n') cellC.z = perSfFmt;
    }

    // Recommendations sub-sheet embedded at bottom
    const recs = Array.isArray((takeoff as Record<string, unknown>).recommendations)
      ? (takeoff as Record<string, unknown>).recommendations as string[]
      : [];
    if (recs.length > 0) {
      const startRow = summaryData.length + 2;
      XLSX.utils.sheet_add_aoa(ws, [
        ['AI RECOMMENDATIONS'],
        ...recs.map((r, i) => [`${i + 1}. ${r}`]),
      ], { origin: { r: startRow, c: 0 } });
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  }

  // ── SHEET 2: FULL MATERIAL TAKEOFF ───────────────────────────────────────────
  {
    const headers = [
      'CSI Code', 'CSI Name', 'Description',
      'Qty', 'Unit', 'Unit Cost', 'Total Cost',
      'Labor Hrs', 'Labor Cost ($65/hr)',
      'Job Cost', 'Sell Price (+15%)', 'Notes',
    ];

    const data: unknown[][] = [headers];

    // Group by division
    const divs = [...new Set(rows.map(r => r.div))].sort();
    for (const div of divs) {
      const divRows = rows.filter(r => r.div === div);
      const divName = CSI_DIVISION_NAMES[div] || `Division ${div}`;
      const divTotal = divRows.reduce((s, r) => s + r.totalCost, 0);

      // Division header row
      data.push([
        `DIV ${div} — ${divName.toUpperCase()}`,
        '', '', '', '', '', divTotal, '', '', '', '', '',
      ]);

      for (const r of divRows) {
        data.push([
          r.csiCode, r.csiName, r.description,
          r.quantity, r.unit,
          r.unitCost, r.totalCost,
          r.laborHours, r.laborCost,
          r.jobCost, r.sellPrice,
          '',
        ]);
      }
    }

    // Grand total row
    const totals = rows.reduce((acc, r) => ({
      cost:   acc.cost  + r.totalCost,
      labor:  acc.labor + r.laborCost,
      job:    acc.job   + r.jobCost,
      sell:   acc.sell  + r.sellPrice,
      hours:  acc.hours + r.laborHours,
    }), { cost: 0, labor: 0, job: 0, sell: 0, hours: 0 });

    data.push([
      'GRAND TOTAL', '', `${rows.length} line items`,
      '', '', '', totals.cost,
      totals.hours, totals.labor,
      totals.job, totals.sell, '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 12 }, { wch: 28 }, { wch: 45 },
      { wch: 10 }, { wch: 7 }, { wch: 12 }, { wch: 14 },
      { wch: 11 }, { wch: 20 },
      { wch: 14 }, { wch: 16 }, { wch: 20 },
    ];
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Apply currency format ($#,##0.00) to columns F (unitCost=5), G (totalCost=6),
    // I (laborCost=8), J (jobCost=9), K (sellPrice=10)
    const currencyFmt = '$#,##0.00';
    const numRows = data.length;
    for (let r = 1; r < numRows; r++) {
      for (const c of [5, 6, 8, 9, 10]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.t === 'n') cell.z = currencyFmt;
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Full Takeoff');
  }

  // ── SHEET 3: BY DIVISION ─────────────────────────────────────────────────────
  {
    const headers = [
      'Division', 'Name', 'Items',
      'Material Cost', 'Labor Cost', 'Job Cost', 'Sell Price', '% of Total',
    ];
    const grandTotal = rows.reduce((s, r) => s + r.totalCost, 0);
    const divs = [...new Set(rows.map(r => r.div))].sort();

    const data: unknown[][] = [headers];
    for (const div of divs) {
      const divRows = rows.filter(r => r.div === div);
      const cost  = divRows.reduce((s, r) => s + r.totalCost, 0);
      const labor = divRows.reduce((s, r) => s + r.laborCost, 0);
      const job   = divRows.reduce((s, r) => s + r.jobCost,   0);
      const sell  = divRows.reduce((s, r) => s + r.sellPrice, 0);
      data.push([
        `${div}`,
        CSI_DIVISION_NAMES[div] || `Division ${div}`,
        divRows.length,
        cost, labor, job, sell,
        grandTotal > 0 ? cost / grandTotal : 0,
      ]);
    }
    // Total row
    data.push([
      'ALL', 'TOTAL', rows.length,
      grandTotal,
      rows.reduce((s, r) => s + r.laborCost, 0),
      rows.reduce((s, r) => s + r.jobCost,   0),
      rows.reduce((s, r) => s + r.sellPrice, 0),
      1,
    ]);

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 8 }, { wch: 32 }, { wch: 7 },
      { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 },
    ];

    // Currency format for cost columns (D, E, F, G = cols 3,4,5,6)
    const divRows2 = data.length;
    for (let r = 1; r < divRows2; r++) {
      for (const c of [3, 4, 5, 6]) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (cell && cell.t === 'n') cell.z = '$#,##0';
      }
    }

    // Format % column
    const lastRow = data.length;
    for (let r = 2; r <= lastRow; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c: 7 })];
      if (cell) {
        cell.t = 'n';
        cell.z = '0.0%';
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, 'By Division');
  }

  // ── SHEET 4: RECOMMENDATIONS ─────────────────────────────────────────────────
  {
    const recs = Array.isArray((takeoff as Record<string, unknown>).recommendations)
      ? (takeoff as Record<string, unknown>).recommendations as string[]
      : [];

    const data: unknown[][] = [
      ['#', 'Sage AI Recommendation'],
      ...recs.map((r, i) => [i + 1, r]),
    ];

    if (data.length === 1) {
      data.push(['—', 'No recommendations generated for this takeoff.']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 5 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Recommendations');
  }

  // 5. Write to buffer and return
  const rawBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Uint8Array;
  const uint8 = new Uint8Array(rawBuf);

  const fileName = `takeoff-${(takeoff as Record<string, unknown>).project_name_detected
    ? String((takeoff as Record<string, unknown>).project_name_detected).replace(/[^a-z0-9]/gi, '-').toLowerCase()
    : takeoffId
  }-${new Date().toISOString().split('T')[0]}.xlsx`;

  return new NextResponse(uint8, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(uint8.length),
    },
  });
}
