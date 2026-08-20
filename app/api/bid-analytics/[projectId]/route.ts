import { createServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 403 })

  // Load all bid analytics for this tenant
  const { data: analytics } = await supabase
    .from('bid_analytics')
    .select('*')
    .eq('tenant_id', profile.tenant_id)
    .order('created_at', { ascending: false })

  if (!analytics || analytics.length === 0) {
    return NextResponse.json({ data: [], summary: null })
  }

  // Aggregate by CSI division
  const divisionMap: Record<string, {
    division: string; description: string;
    count: number; totalVariance: number; vendors: Set<string>
    overBidCount: number; underBidCount: number
  }> = {}

  for (const row of analytics) {
    const div = row.csi_division || 'XX'
    if (!divisionMap[div]) {
      divisionMap[div] = {
        division: div,
        description: row.csi_description || div,
        count: 0, totalVariance: 0,
        vendors: new Set(), overBidCount: 0, underBidCount: 0,
      }
    }
    const entry = divisionMap[div]
    entry.count++
    const variance = row.bid_accuracy_pct ? Number(row.bid_accuracy_pct) : 0
    entry.totalVariance += variance
    if (variance > 0) entry.overBidCount++
    else if (variance < 0) entry.underBidCount++
    if (row.vendor_name) entry.vendors.add(row.vendor_name)
  }

  const insights = Object.values(divisionMap).map(d => ({
    csi_division: d.division,
    csi_description: d.description,
    sample_size: d.count,
    avg_variance_pct: d.count > 0 ? Math.round((d.totalVariance / d.count) * 10) / 10 : 0,
    over_bid_count: d.overBidCount,
    under_bid_count: d.underBidCount,
    vendor_count: d.vendors.size,
    recommendation: d.count > 0
      ? (d.totalVariance / d.count > 5 ? 'over_bid'
        : d.totalVariance / d.count < -5 ? 'under_bid' : 'accurate')
      : 'no_data',
    suggested_contingency_pct: d.count > 0 && d.totalVariance / d.count > 0
      ? Math.ceil((d.totalVariance / d.count) * 1.5)
      : 5,
  })).sort((a, b) => Math.abs(b.avg_variance_pct) - Math.abs(a.avg_variance_pct))

  const totalProjects = new Set(analytics.map((a: any) => a.project_id)).size
  const avgVariance = analytics.length > 0
    ? analytics.reduce((s: number, a: any) => s + (Number(a.bid_accuracy_pct) || 0), 0) / analytics.length
    : 0

  return NextResponse.json({
    data: analytics,
    insights,
    summary: {
      total_historical_projects: totalProjects,
      total_bid_packages: analytics.length,
      overall_accuracy_pct: Math.round(avgVariance * 10) / 10,
      most_over_bid: insights.find(i => i.recommendation === 'over_bid')?.csi_division || null,
      most_under_bid: insights.find(i => i.recommendation === 'under_bid')?.csi_division || null,
    },
  })
}
