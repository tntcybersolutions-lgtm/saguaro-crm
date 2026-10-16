import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, hasPermission } from '@/lib/permissions';
import { isPlatformAdmin } from '@/lib/platform-admin';
import { signStoredUrl } from '@/lib/storage-signing';
import { hasLiveStock } from './stock';
import { apiError } from '@/lib/api-error';

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
    let { data: items, error: itemsErr } = await buildItemsQ('id, tenant_id, vertical, category, name, description, unit, sku_hint, image_url');
    if (itemsErr) {
      ({ data: items, error: itemsErr } = await buildItemsQ('id, tenant_id, vertical, category, name, description, unit, sku_hint'));
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
      /* The vendor roster needed the same scope as the items and the prices.
         It was missed on the first pass — two of three catalog tables scoped
         is not "the catalog is scoped". */
      db.from('catalog_vendors').select('id, name, kind, verticals, website, is_national')
        .or(`tenant_id.is.null,tenant_id.eq.${g.user.tenantId}`)
        .order('name', { ascending: true }),
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

    /* WHO MAY EDIT THIS ROW'S PHOTO — computed per row, not once for the page.
       A global row (tenant_id IS NULL) is the shared catalog every tenant
       reads, so only a platform admin may touch it; a tenant's own row belongs
       to that tenant. This is the same rule /api/catalog/image enforces on the
       write, so the camera button appears exactly where it will work rather
       than on every row and 403-ing on most of them. */
    const platformAdmin = isPlatformAdmin(g.user.email);
    const fullOnProjects = hasPermission(g.perms, 'Projects', 'Full');
    const mayEdit = (row: { tenant_id?: string | null }) =>
      row.tenant_id == null ? platformAdmin : fullOnProjects && row.tenant_id === g.user.tenantId;

    /* image_url holds a bucket PATH for uploaded photos and a foreign http(s)
       URL for pasted manufacturer images. signStoredUrl signs the first and
       passes the second through untouched, so one column serves both. Only
       rows that actually carry an image are signed — the shared catalog is 223
       rows and none of them should cost a storage round-trip for a null. */
    const signedById = new Map<string, string>();
    await Promise.all(
      ((items as any[]) || [])
        .filter((it) => typeof it.image_url === 'string' && it.image_url)
        .map(async (it) => {
          const url = await signStoredUrl('project-files', it.image_url as string);
          if (url) signedById.set(it.id, url);
        })
    );

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
        imageUrl: signedById.get(it.id) || null,
        canEditImage: mayEdit(it),
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
      /* The page-wide canManageImages flag is gone. It was a bare Projects/Full
         check that put the camera button on all 223 shared rows for every
         tenant admin, and the write behind it is now platform-admin only — a
         page-wide answer to a per-row question. item.canEditImage replaces it. */
    });
  } catch (e) {
    return apiError('catalog GET', e);
  }
}
