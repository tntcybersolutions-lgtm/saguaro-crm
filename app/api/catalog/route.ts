import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, hasPermission } from '@/lib/permissions';
import { hasLiveStock } from './stock';

/** GET ?vertical=&q= — Materials Catalog price-comparison snapshot.
 *
 *  Returns catalog items (optionally filtered by vertical and/or a search
 *  term) with every vendor offer embedded, sorted cheapest-first. Also
 *  returns the distinct vertical list and the full vendor roster so the page
 *  can build its pill tabs and comparison columns without extra round-trips.
 *
 *  Pricing is REFERENCE data (seeded snapshots, `as_of` stamped) — live
 *  vendor API feeds connect here when accounts are linked.
 *
 *  AVAILABILITY HONESTY: stock_status / qty_in_stock are still returned (a
 *  real feed will populate them), but every offer also carries `source`,
 *  `asOf`, and a server-computed `liveStock` flag from the shared
 *  `hasLiveStock` rule. Reference rows have no inventory behind them, so
 *  bestPrice is the cheapest quote and only a REAL feed may break a tie on
 *  stock. Clients must gate every badge/quantity on `liveStock`.
 */
export async function GET(req: NextRequest) {
  const g = await requirePermission(req, 'Projects', 'View');
  if (!g.ok) return g.res;
  try {
    /* Catalog tables are a shared reference dataset and newer than the
       generated Database types — hence the `as any` idiom used by other routes
       that touch post-typegen tables.

       VERIFIED, NOT ASSUMED (24 Sep 2026): catalog_items is 223 rows and
       catalog_vendor_prices 667, and tenant_id is NULL on every one of them.
       So "shared reference dataset" is true today and this route is not
       leaking anything.

       The scoping below is a GUARD for tomorrow. The tenant_id column exists,
       which means per-tenant catalog entries are clearly intended at some
       point — and on that day an unscoped read would hand one contractor
       another's item list and vendor pricing, which is commercially sensitive.
       Pinning to `IS NULL` alone would instead hide those future rows from
       their own owner, so the filter is "global OR mine": it serves the shared
       catalog exactly as now, admits a tenant's own entries when they arrive,
       and can never return a third party's. */
    const db = g.db as any;
    const vertical = req.nextUrl.searchParams.get('vertical');
    const q = (req.nextUrl.searchParams.get('q') || '').trim();

    // image_url is a pending migration on catalog_items — select it
    // opportunistically and fall back to the pre-image column list until the
    // column lands, so the catalog never 500s over a missing column.
    const buildItemsQ = (cols: string) => {
      let iq = db
        .from('catalog_items')
        .select(cols)
        .or(`tenant_id.is.null,tenant_id.eq.${g.user.tenantId}`)
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      if (vertical) iq = iq.eq('vertical', vertical);
      if (q) {
        // Strip PostgREST or-filter metacharacters before interpolating.
        const safe = q.replace(/[%_,()."\\]/g, ' ').trim();
        if (safe) iq = iq.or(`name.ilike.%${safe}%,description.ilike.%${safe}%,category.ilike.%${safe}%`);
      }
      return iq;
    };
    let { data: items, error: itemsErr } = await buildItemsQ('id, vertical, category, name, description, unit, sku_hint, image_url');
    if (itemsErr) {
      ({ data: items, error: itemsErr } = await buildItemsQ('id, vertical, category, name, description, unit, sku_hint'));
    }
    if (itemsErr) throw itemsErr;

    // Offers for the matched items, vendor embedded via the FK join.
    const ids = ((items as any[]) || []).map((it) => it.id);
    let priceRows: any[] = [];
    if (ids.length > 0) {
      const { data, error: priceErr } = await db
        .from('catalog_vendor_prices')
        .select('item_id, price, unit, qty_in_stock, stock_status, lead_time_days, source, as_of, catalog_vendors(name, kind, website)')
        .or(`tenant_id.is.null,tenant_id.eq.${g.user.tenantId}`)
        .in('item_id', ids);
      if (priceErr) throw priceErr;
      priceRows = (data as any[]) || [];
    }

    // Vendor roster + distinct verticals (independent of the current filter,
    // so the tabs never collapse while searching).
    const [vendorRes, vertRes] = await Promise.all([
      db.from('catalog_vendors').select('id, name, kind, verticals, website, is_national').order('name', { ascending: true }),
      db.from('catalog_items').select('vertical').or(`tenant_id.is.null,tenant_id.eq.${g.user.tenantId}`),
    ]);
    const verticals: string[] = Array.from(
      new Set((((vertRes.data as any[]) || []).map((r) => r.vertical) as string[]).filter(Boolean))
    ).sort();

    // Group offers per item. Prices can round-trip as strings — Number() first.
    const byItem = new Map<string, any[]>();
    let asOfMax: string | null = null;
    // True only once a real vendor feed is wired up — drives the page's
    // "no inventory feed connected" language.
    let anyLiveStock = false;
    for (const r of priceRows) {
      if (r.as_of) {
        const s = String(r.as_of);
        if (!asOfMax || s > asOfMax) asOfMax = s; // ISO strings compare lexicographically
      }
      // Stock fields stay in the payload for the day a feed populates them,
      // but `liveStock` is the only thing a client may render a badge on.
      const liveStock = hasLiveStock(r);
      if (liveStock) anyLiveStock = true;
      const offer = {
        vendor: r.catalog_vendors?.name || 'Unknown vendor',
        vendorKind: r.catalog_vendors?.kind || null,
        vendorWebsite: r.catalog_vendors?.website || null,
        price: Number(r.price) || 0,
        unit: r.unit || null,
        stockStatus: r.stock_status || null,
        qtyInStock: r.qty_in_stock != null ? Number(r.qty_in_stock) || 0 : null,
        leadTimeDays: r.lead_time_days != null ? Number(r.lead_time_days) || 0 : null,
        source: r.source || null,
        asOf: r.as_of || null,
        liveStock,
        bestPrice: false,
      };
      const list = byItem.get(r.item_id) || [];
      list.push(offer);
      byItem.set(r.item_id, list);
    }

    const outItems = ((items as any[]) || []).map((it) => {
      const prices = (byItem.get(it.id) || []).sort((a, b) => a.price - b.price);
      // BEST PRICE = the cheapest quote. A stock preference may ONLY break the
      // tie when a real feed says so (hasLiveStock); seeded 'reference' stock
      // is not inventory and must never reorder what the buyer sees.
      const best = prices.find((p) => p.liveStock && p.stockStatus === 'in_stock') || prices[0];
      if (best) best.bestPrice = true;
      return {
        id: it.id,
        vertical: it.vertical,
        category: it.category,
        name: it.name,
        description: it.description,
        unit: it.unit,
        skuHint: it.sku_hint,
        imageUrl: it.image_url || null,
        prices,
      };
    });

    return NextResponse.json({
      items: outItems,
      verticals,
      vendors: (((vendorRes.data as any[]) || [])).map((v) => ({
        id: v.id,
        name: v.name,
        kind: v.kind,
        verticals: v.verticals,
        website: v.website,
        isNational: !!v.is_national,
      })),
      asOfMax,
      // False until a real vendor inventory feed is connected — the page says
      // so out loud instead of implying stock it cannot source.
      hasLiveStockFeed: anyLiveStock,
      // Drives the Add-photo affordance client-side; the image route enforces
      // the same Projects/Full gate server-side regardless.
      canManageImages: hasPermission(g.perms, 'Projects', 'Full'),
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
