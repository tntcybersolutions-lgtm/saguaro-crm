'use client';
/**
 * Materials Catalog — cross-vendor price comparison per vertical, with a
 * Procore-style ordering flow: search + logical sort, select products with
 * quantities, pick a project, and issue vendor-grouped purchase orders in one
 * action (each PO commits into the CSI budget automatically).
 *
 * Pricing is HONESTLY labeled as reference data — live vendor API feeds
 * connect here when accounts are linked.
 *
 * AVAILABILITY HONESTY: this page shows a stock badge or quantity ONLY when
 * the offer came from a real vendor feed (`hasLiveStock`). Every row today is
 * a seeded 'reference' snapshot with no store, branch, account, or feed behind
 * it, so it renders "Availability not tracked" plus the real path to act —
 * check availability with the vendor, draft the PO, vendor confirms.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useProjects } from '@/lib/hooks/useProjects';
import { humanError } from '@/lib/errors';
import { VERTICAL_COST_CODE } from '@/lib/taxonomy';
import {
  Package,
  Storefront,
  MagnifyingGlass,
  Stack,
  Truck,
  Plus,
  Minus,
  Camera,
  UploadSimple,
  LinkSimple,
  Lightning,
  Drop,
  Fan,
  Wall,
  PaintRoller,
  Cube,
  HouseLine,
  Door,
  Snowflake,
  SquaresFour,
  PlugsConnected,
  Tree,
  ShoppingCartSimple,
  CheckCircle,
  X,
  Info,
  ArrowSquareOut,
  Globe,
  MagnifyingGlassPlus,
} from '@phosphor-icons/react';
import { PremiumSurface, ModuleHero, SectionCard, PremiumEmpty, IconChip, goldButtonStyle, ghostButtonStyle } from '@/components/ui/premium';
import { SortableTh, usePersistedSort, useSortedRows } from '@/app/app/_shared/table-sort';
import { moduleAccent } from '@/lib/module-identity';
import {
  hasLiveStock,
  AVAILABILITY_UNTRACKED_LABEL,
  AVAILABILITY_UNTRACKED_LINE,
  ORDER_PATH_SENTENCE,
} from '@/app/api/catalog/stock';

const GOLD = 'var(--brand-primary)', DARK = 'var(--bg-base)', BORDER = 'rgba(255,255,255,0.12)', DIM = 'var(--text-secondary)', TEXT = 'var(--text-primary)', GREEN = 'var(--success)', AMBER = 'var(--brand-primary-strong)', RED = 'var(--danger)';

const fmtMoney = (n: number) => '$' + ((Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const dt = String(d).includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const titleCase = (s: string) => s.replace(/[_-]+/g, ' ').replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

// Vertical -> CSI cost code lives in the single taxonomy module (@/lib/taxonomy
// VERTICAL_COST_CODE) so catalog POs and every vertical dropdown share one list.

interface Offer {
  vendor: string;
  vendorKind: string | null;
  /** catalog_vendors.website — the real place to price and order this. */
  vendorWebsite: string | null;
  price: number;
  unit: string | null;
  stockStatus: string | null;
  qtyInStock: number | null;
  leadTimeDays: number | null;
  source: string | null;
  asOf: string | null;
  /** Server-computed via hasLiveStock — the ONLY gate for showing stock. */
  liveStock: boolean;
  bestPrice: boolean;
}
interface CatalogItem {
  id: string;
  vertical: string;
  category: string | null;
  name: string;
  description: string | null;
  unit: string | null;
  skuHint: string | null;
  /** Real product image when one has been attached — null renders the honest monogram chip. */
  imageUrl: string | null;
  /** Server-computed per row: shared catalog rows are platform-admin only, your
   *  own catalog rows need Projects/Full. Gates the camera button so it never
   *  appears on a row the write would refuse. */
  canEditImage?: boolean;
  prices: Offer[];
}
interface CatalogData {
  items: CatalogItem[];
  verticals: string[];
  vendors: { id: string; name: string; kind: string | null; website: string | null; isNational: boolean }[];
  asOfMax: string | null;
  /** False until a real vendor inventory feed is connected — today, always false. */
  hasLiveStockFeed?: boolean;
}

type SortMode = 'name' | 'price' | 'category';

const INP: React.CSSProperties = { padding: '9px 12px 9px 34px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 9, color: TEXT, fontSize: 13, outline: 'none', width: 260, boxSizing: 'border-box' };
const SEL: React.CSSProperties = { padding: '8px 10px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 9, color: TEXT, fontSize: 12.5, outline: 'none', cursor: 'pointer' };
const TH: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: DIM, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', background: DARK };

/** Small chip marking a price as REFERENCE data — never mistakable for a live quote. */
function RefChip() {
  return (
    <span style={{ marginLeft: 5, padding: '1px 5px', borderRadius: 5, background: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)', border: '1px solid var(--brand-primary-35)', color: AMBER, fontSize: 8.5, fontWeight: 900, verticalAlign: 'middle', whiteSpace: 'nowrap' as const }}>Ref</span>
  );
}

/** Web search that checks TODAY's price and availability for a real SKU at a
 *  real vendor — the existing "Verify" action, now named for what it does. */
const checkAvailabilityUrl = (item: CatalogItem, vendor: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`${item.skuHint || item.name} ${vendor} price availability`)}`;

/** Normalize catalog_vendors.website into an href, or null when unset. */
const vendorSiteHref = (website: string | null | undefined) => {
  const s = String(website || '').trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};

/**
 * Availability for one offer.
 *
 * A stock badge or quantity renders ONLY when hasLiveStock(offer) is true —
 * i.e. the price row came from a real vendor feed, in which case it is stamped
 * with the vendor and the feed's as-of date. Reference rows (all of them
 * today) get the honest muted line instead: no color, no number, no claim.
 */
function Availability({ offer, compact = false, feedConnected = false }: { offer: Offer; compact?: boolean; feedConnected?: boolean }) {
  if (!hasLiveStock(offer)) {
    /* SAY IT ONCE, NOT NINE HUNDRED TIMES.
     *
     * Every row printed "Availability not tracked — verify with the vendor"
     * under its best offer, and every vendor cell printed the short form
     * again. At 223 items that is roughly nine hundred copies of one
     * sentence, which is most of the text on the screen — it stopped being
     * information and became texture.
     *
     * Nothing is hidden. The banner above the table states it once, and this
     * offer's provenance popover still carries the full sentence plus which
     * vendor and which as-of date. The claim is on screen and one hover away;
     * it just is not stamped on every cell.
     *
     * The exception is a tenant that HAS connected a feed: then "no stock
     * shown" and "not tracked for this vendor" are genuinely different
     * states, and blank would be ambiguous, so the label stays. */
    if (!feedConnected) return null;
    return (
      <span
        title={`${AVAILABILITY_UNTRACKED_LINE}. No inventory feed is connected for ${offer.vendor}.`}
        style={{ display: 'inline-flex', alignItems: 'center', fontSize: compact ? 9.5 : 10, fontWeight: 600, color: 'var(--c-text-2)', whiteSpace: 'nowrap' }}
      >
        {compact ? AVAILABILITY_UNTRACKED_LABEL : AVAILABILITY_UNTRACKED_LINE}
      </span>
    );
  }
  const s = String(offer.stockStatus || '').toLowerCase();
  const [label, color, bg] =
    s === 'in_stock' ? ['In Stock', GREEN, 'rgba(74,222,128,0.12)'] :
    s === 'limited' ? ['Limited', 'var(--warning)', 'color-mix(in srgb, var(--warning) 14%, transparent)'] :
    s === 'out_of_stock' ? ['Out of Stock', RED, 'rgba(192,48,48,0.14)'] :
    ['Special Order', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.06)'];
  const qty = offer.qtyInStock != null ? `${offer.qtyInStock.toLocaleString('en-US')} ` : '';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', padding: '1px 7px', borderRadius: 999, background: bg, color, fontSize: 9.5, fontWeight: 800, letterSpacing: 0.04 }}>
        {qty}{label}
      </span>
      {/* A live number is only honest when it says whose feed and when. */}
      <span style={{ fontSize: 9, color: 'var(--c-text-2)' }}>
        {offer.vendor} · {fmtDate(offer.asOf)}
      </span>
    </span>
  );
}

/**
 * Hover/tap popover for one offer — the point-of-decision panel. Carries the
 * price provenance, the honest availability state, and the REAL path to act:
 * check availability with the vendor, then draft the PO with the Add button.
 */
function ProvPop({ offer, item }: { offer: Offer; item: CatalogItem }) {
  const site = vendorSiteHref(offer.vendorWebsite);
  const live = hasLiveStock(offer);
  return (
    <span className="catProvPop" role="tooltip">
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: TEXT, marginBottom: 2 }}>{offer.vendor}</span>
      <span style={{ display: 'block', fontSize: 10, fontWeight: 900, color: AMBER, marginBottom: 3 }}>Reference Price</span>
      <span style={{ display: 'block', fontSize: 11, color: DIM, lineHeight: 1.45 }}>
        Captured {fmtDate(offer.asOf)}{offer.source ? ` · ${offer.source}` : ''} — not a live quote.
      </span>
      <span style={{ display: 'block', fontSize: 11, color: live ? DIM : 'var(--text-secondary)', lineHeight: 1.45, marginTop: 4 }}>
        {live
          ? `Availability from the ${offer.source} feed as of ${fmtDate(offer.asOf)}.`
          : `${AVAILABILITY_UNTRACKED_LINE} — no store, branch, or inventory feed is connected.`}
      </span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginTop: 8 }}>
        <a
          href={checkAvailabilityUrl(item, offer.vendor)}
          target="_blank"
          rel="noopener noreferrer"
          className="pmBtn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: AMBER, textDecoration: 'none', border: '1px solid var(--brand-primary-35)', background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', borderRadius: 6, padding: '3px 8px' }}
        >
          <MagnifyingGlassPlus size={11} weight="bold" /> Check Availability
        </a>
        {site && (
          <a
            href={site}
            target="_blank"
            rel="noopener noreferrer"
            className="pmBtn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: DIM, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px' }}
          >
            <Globe size={11} weight="bold" /> Vendor Site
          </a>
        )}
      </span>
      <span style={{ display: 'block', fontSize: 9.5, color: 'var(--c-text-2)', lineHeight: 1.45, marginTop: 7 }}>
        {ORDER_PATH_SENTENCE}
      </span>
    </span>
  );
}

/* ── Product image pipeline — real images only. The fallback is an honest,
 *    machined monogram (vertical-accent chip + category icon), never a fake
 *    photo and never a guessed hotlink. ── */

/** Vertical accent + icon for the monogram chip. Keys mirror the catalog's
 *  seeded verticals; unknown verticals fall back to gold + Package. */
const VERTICAL_VISUAL: Record<string, { icon: React.ElementType; hue: string }> = {
  'Low Voltage & Networking': { icon: PlugsConnected, hue: 'var(--warning)' },
  Electrical: { icon: Lightning, hue: 'var(--brand-primary)' },
  Plumbing: { icon: Drop, hue: 'var(--warning)' },
  HVAC: { icon: Fan, hue: 'var(--success)' },
  'Flooring & Carpet': { icon: SquaresFour, hue: 'var(--warning)' },
  Drywall: { icon: Wall, hue: 'var(--warning)' },
  Paint: { icon: PaintRoller, hue: 'var(--danger)' },
  'Framing & Lumber': { icon: Tree, hue: 'var(--success)' },
  Concrete: { icon: Cube, hue: 'var(--status-closed)' },
  Roofing: { icon: HouseLine, hue: 'var(--warning)' },
  'Doors & Windows': { icon: Door, hue: 'var(--success)' },
  Insulation: { icon: Snowflake, hue: 'var(--warning)' },
};

/** 40px image slot: the real product image when one exists (click opens the
 *  lightbox), else the vertical-accent monogram chip. */
function ItemVisual({ item, onOpen }: { item: CatalogItem; onOpen: (item: CatalogItem) => void }) {
  const vis = VERTICAL_VISUAL[item.vertical];
  const hue = vis?.hue || GOLD;
  const MonoIcon = vis?.icon || Package;
  if (item.imageUrl) {
    return (
      <button
        onClick={() => onOpen(item)}
        className="pmBtn"
        title="View product image"
        style={{ width: 40, height: 40, padding: 0, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', cursor: 'zoom-in', background: DARK, flex: 'none', display: 'block' }}
      >
        <img src={item.imageUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </button>
    );
  }
  return (
    <div
      title={`${titleCase(item.vertical)} — no product image yet`}
      style={{
        width: 40, height: 40, borderRadius: 10, position: 'relative', overflow: 'hidden', flex: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(150deg, color-mix(in srgb, ${hue} 14%, transparent), rgba(255,255,255,0.03) 70%)`,
        border: `1px solid color-mix(in srgb, ${hue} 24%, transparent)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07)',
      }}
    >
      <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: `linear-gradient(180deg, ${hue}, color-mix(in srgb, ${hue} 33%, transparent))` }} />
      <MonoIcon size={17} weight="duotone" color={hue} />
    </div>
  );
}

export default function CatalogPage() {
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /* Sixteen vendor chips on by default put a wall of buttons between the
     header and the first product. They are useful when you want them and
     noise the rest of the time, so they fold behind a count. */
  const [showVendorSites, setShowVendorSites] = useState(false);
  const [vertical, setVertical] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('name');

  // ── Order cart: item id -> qty. The visible, Procore-style add flow. ──
  const [cart, setCart] = useState<Record<string, number>>({});
  const { projects: liveProjects } = useProjects();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ pos: number; total: number } | null>(null);
  // ── Image pipeline state ──
  const [lightbox, setLightbox] = useState<CatalogItem | null>(null);
  const [imgMenu, setImgMenu] = useState<string | null>(null); // item id with the Add-photo popover open
  const [imgBusy, setImgBusy] = useState<string | null>(null); // item id with a save in flight
  const [imgErr, setImgErr] = useState('');
  const [imgUrlDraft, setImgUrlDraft] = useState('');
  const [placeErr, setPlaceErr] = useState('');
  const [pricingInfo, setPricingInfo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/catalog');
        const d = await r.json();
        if (d.error) throw new Error(d.error);
        setData(d);
      } catch {
        setError('Could not load the materials catalog. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const list = liveProjects.map((p) => ({ id: p.id, name: p.name || 'Untitled' }));
    setProjects(list);
    if (list.length === 1) setProjectId((prev) => prev || list[0].id);
  }, [liveProjects]);

  const allItems = data?.items || [];
  const verticalsSorted = useMemo(() => [...(data?.verticals || [])].sort((a, b) => a.localeCompare(b)), [data]);
  const verticalCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of allItems) m.set(it.vertical, (m.get(it.vertical) || 0) + 1);
    return m;
  }, [allItems]);

  const scoped = useMemo(
    () => (vertical === 'all' ? allItems : allItems.filter((it) => it.vertical === vertical)),
    [allItems, vertical]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = !needle ? [...scoped] : scoped.filter((it) =>
      [it.name, it.description, it.category, it.skuHint, ...it.prices.map((p) => p.vendor)]
        .some((f) => (f || '').toLowerCase().includes(needle))
    );
    const best = (it: CatalogItem) => Number(it.prices.find((p) => p.bestPrice)?.price ?? it.prices[0]?.price) || Infinity;
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'price') list.sort((a, b) => best(a) - best(b));
    else list.sort((a, b) => (a.category || 'zz').localeCompare(b.category || 'zz') || a.name.localeCompare(b.name));
    return list;
  }, [scoped, q, sort]);

  const vendorCols = useMemo(() => {
    const present = new Set<string>();
    for (const it of filtered) for (const p of it.prices) present.add(p.vendor);
    return Array.from(present).sort((a, b) => a.localeCompare(b));
  }, [filtered]);

  /** Real, clickable vendor sites for the vendors quoting in this view — the
   *  order path that exists, surfaced where a Buy button would otherwise sit.
   *  Vendors with no website on file are simply omitted (never faked). */
  const vendorLinks = useMemo(() => {
    const siteByName = new Map<string, string>();
    for (const v of data?.vendors || []) {
      const href = vendorSiteHref(v.website);
      if (href) siteByName.set(v.name, href);
    }
    for (const it of filtered) {
      for (const p of it.prices) {
        if (siteByName.has(p.vendor)) continue;
        const href = vendorSiteHref(p.vendorWebsite);
        if (href) siteByName.set(p.vendor, href);
      }
    }
    return vendorCols
      .map((name) => ({ name, href: siteByName.get(name) || null }))
      .filter((v): v is { name: string; href: string } => !!v.href);
  }, [data, filtered, vendorCols]);

  // Column-header sorting (R11 sweep) — layered over the toolbar sort: an
  // active column sort overrides it (and pauses category group headers);
  // cycling back to "none" restores the toolbar ordering. Prices sort numeric,
  // unpriced items sink to the bottom via null.
  const { sort: colSort, cycleSort } = usePersistedSort('catalog-grid');
  const sortedItems = useSortedRows(filtered, colSort, (it, key) => {
    // Stale-key guard: the per-vendor columns are gone, but a browser that
    // sorted by one still has `vendor:<name>` in localStorage under
    // 'sag_sort_catalog-grid'. Returning null for every row leaves the
    // toolbar ordering intact instead of shuffling on a key nothing renders;
    // it clears itself the first time any header is clicked.
    if (key.startsWith('vendor:')) return null;
    switch (key) {
      case 'item': return it.name;
      case 'quotes': return new Set(it.prices.map((p) => p.vendor)).size;
      case 'unit': return it.unit;
      case 'best': {
        const n = Number(it.prices.find((p) => p.bestPrice)?.price ?? it.prices[0]?.price);
        return Number.isFinite(n) ? n : null;
      }
      default: return (it as unknown as Record<string, unknown>)[key];
    }
  });

  /** Feeds the one-line card subtitle. The best-vs-highest spread used to be
   *  computed here for a "Best-Price Savings" stat card; the card is gone and
   *  nothing else read it, so the arithmetic went with it. */
  const stats = useMemo(() => {
    const vendorsQuoting = new Set<string>();
    let priced = 0;
    for (const it of scoped) {
      if (it.prices.length > 0) priced++;
      for (const p of it.prices) vendorsQuoting.add(p.vendor);
    }
    return {
      items: scoped.length,
      vendors: vendorsQuoting.size,
      coverage: scoped.length > 0 ? Math.round((priced / scoped.length) * 100) : 0,
    };
  }, [scoped]);

  // ── Cart derivations ──
  const itemById = useMemo(() => new Map(allItems.map((it) => [it.id, it])), [allItems]);
  const cartLines = useMemo(() => Object.entries(cart)
    .map(([id, qty]) => ({ item: itemById.get(id), qty }))
    .filter((l): l is { item: CatalogItem; qty: number } => !!l.item && l.qty > 0), [cart, itemById]);
  const cartTotal = cartLines.reduce((s, l) => {
    const best = l.item.prices.find((p) => p.bestPrice) || l.item.prices[0];
    return s + (Number(best?.price) || 0) * l.qty;
  }, 0);
  const cartCount = cartLines.reduce((s, l) => s + l.qty, 0);

  const setQty = (id: string, qty: number) => {
    setPlaced(null); setPlaceErr('');
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[id]; else next[id] = qty;
      return next;
    });
  };

  /** Patch one item's image locally after the server confirms the new URL. */
  const applyImage = (itemId: string, imageUrl: string | null) => {
    setData((d) => (d ? { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, imageUrl } : it)) } : d));
  };

  /** Upload a real product photo (images only, ≤5MB) via /api/catalog/image. */
  async function uploadImage(itemId: string, file: File) {
    setImgErr('');
    if (!file.type.startsWith('image/')) { setImgErr('Only image files can be attached.'); return; }
    if (file.size > 5 * 1024 * 1024) { setImgErr('Images must be 5MB or smaller.'); return; }
    setImgBusy(itemId);
    try {
      const fd = new FormData();
      fd.append('itemId', itemId);
      fd.append('file', file);
      const r = await fetch('/api/catalog/image', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Upload failed.');
      applyImage(itemId, d.imageUrl || null);
      setImgMenu(null);
    } catch (e: any) {
      setImgErr(e?.message || 'Could not upload the image. Please try again.');
    } finally {
      setImgBusy(null);
    }
  }

  /** Attach a manufacturer image URL — honest sourcing: the admin pastes a real
   *  vendor/manufacturer URL; nothing is ever guessed or generated. */
  async function attachImageUrl(itemId: string) {
    const url = imgUrlDraft.trim();
    if (!url) return;
    setImgErr('');
    setImgBusy(itemId);
    try {
      const r = await fetch('/api/catalog/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, imageUrl: url }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'Could not save the image URL.');
      applyImage(itemId, d.imageUrl || null);
      setImgMenu(null);
      setImgUrlDraft('');
    } catch (e: any) {
      setImgErr(e?.message || 'Could not save the image URL. Please try again.');
    } finally {
      setImgBusy(null);
    }
  }

  /** Issue vendor-grouped POs from the cart — each at the item's best offer. */
  async function placeOrders() {
    if (cartLines.length === 0) return;
    /* The button used to be disabled until a project was picked, with nothing
       saying so — on a phone it was a grey button that ignored taps. */
    if (!projectId) {
      setPlaceErr('Pick the project these materials are for.');
      window.setTimeout(() => document.getElementById('cat-po-project')?.focus(), 0);
      return;
    }
    setPlacing(true); setPlaceErr('');
    try {
      const byVendor = new Map<string, { line: typeof cartLines[number]; offer: Offer }[]>();
      for (const l of cartLines) {
        const offer = l.item.prices.find((p) => p.bestPrice) || l.item.prices[0];
        if (!offer) continue;
        const arr = byVendor.get(offer.vendor) || [];
        arr.push({ line: l, offer });
        byVendor.set(offer.vendor, arr);
      }
      let made = 0, grand = 0;
      for (const [vendor, rows] of Array.from(byVendor.entries())) {
        const line_items = rows.map(({ line, offer }) => ({
          description: line.item.name + (line.item.skuHint ? ` (SKU ${line.item.skuHint})` : ''),
          quantity: line.qty,
          unit: line.item.unit || offer.unit || 'EA',
          unit_price: Number(offer.price) || 0,
          total: (Number(offer.price) || 0) * line.qty,
        }));
        const subtotal = line_items.reduce((s, li) => s + li.total, 0);
        const costCounts = new Map<string, number>();
        for (const { line } of rows) {
          const cc = VERTICAL_COST_CODE[line.item.vertical] || '';
          if (cc) costCounts.set(cc, (costCounts.get(cc) || 0) + 1);
        }
        const cost_code = Array.from(costCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
        const r = await fetch('/api/purchase-orders/create', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId, vendor_name: vendor, status: 'draft',
            description: `Materials Catalog order — ${rows.length} item${rows.length === 1 ? '' : 's'} at best reference pricing`,
            line_items, subtotal, total: subtotal, cost_code,
            notes: `Created from the Materials Catalog. Prices are reference pricing captured ${fmtDate(data?.asOfMax)}; availability is not tracked (no vendor inventory feed connected). Confirm price and stock with ${vendor} before issuing.`,
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.error) throw new Error(d.error || `Could not create the purchase order for ${vendor}.`);
        made++; grand += subtotal;
      }
      setPlaced({ pos: made, total: grand });
      setCart({});
    } catch (e: any) {
      console.error(e);
      setPlaceErr(humanError(e, 'Could not create the purchase orders. Please try again.'));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <PremiumSurface maxWidth={2200}>
      <style>{`
        .catAdd:active{transform:translateY(1px)!important;filter:brightness(.94)!important;box-shadow:0 1px 4px var(--brand-primary-18),inset 0 1px 0 rgba(255,255,255,0.22)!important}
        .catStep:hover{transform:none!important;filter:none!important;background:color-mix(in srgb, var(--brand-primary) 20%, transparent)!important}
        .catStep:active{background:color-mix(in srgb, var(--brand-primary) 28%, transparent)!important}
        @media (prefers-reduced-motion: reduce){.catAdd:active{transform:none!important}}
        .catProv{position:relative;display:inline-block;outline:none}
        .catProv .catProvPop{display:none;position:absolute;right:0;bottom:calc(100% + 6px);z-index:60;width:264px;padding:10px 12px;border-radius:9px;background:var(--bg-surface);border:1px solid var(--brand-primary-35);box-shadow:0 8px 24px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.06);text-align:left;white-space:normal;cursor:default}
        .catProv:hover .catProvPop,.catProv:focus-within .catProvPop{display:block}
        .catImgBtn{opacity:0;transition:opacity .15s ease}
        tr:hover .catImgBtn,.catImgBtn:focus-visible{opacity:1}
      `}</style>
      <ModuleHero
        eyebrow="Pre-Construction"
        eyebrowIcon={<IconChip size={24} vivid={moduleAccent('catalog').vivid ?? moduleAccent('catalog').hex}><Storefront size={13} weight="fill" color="var(--text-primary)" /></IconChip>}
        accentColor={moduleAccent('catalog').hex}
        title="Materials"
        accent="Catalog"
        subtitle="Compare vendor pricing, then issue purchase orders grouped by vendor."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <MagnifyingGlass size={15} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search items, SKUs, vendors…" style={INP} />
            </div>
            {verticalsSorted.length > 0 && (
              <select value={vertical} onChange={(e) => setVertical(e.target.value)} style={SEL} className="pmBtn" aria-label="Filter by vertical">
                <option value="all">All Verticals ({allItems.length})</option>
                {verticalsSorted.map((v) => (
                  <option key={v} value={v}>{titleCase(v)} ({verticalCounts.get(v) || 0})</option>
                ))}
              </select>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)} style={SEL} className="pmBtn" aria-label="Sort products">
              <option value="name">Sort: Name A–Z</option>
              <option value="price">Sort: Best Price</option>
              <option value="category">Sort: Category</option>
            </select>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setPricingInfo((v) => !v)}
                className="pmBtn"
                style={{ ...ghostButtonStyle, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', fontSize: 12 }}
                aria-expanded={pricingInfo}
              >
                <Info size={13} weight="bold" /> How Pricing Works
              </button>
              {pricingInfo && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 80, width: 304, background: 'var(--bg-solid-2)', border: '1px solid var(--brand-primary-35)', borderRadius: 12, padding: '14px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', textAlign: 'left' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: AMBER, marginBottom: 8 }}>How Pricing and Ordering Work</div>
                  {[
                    ['1. Reference Snapshot', 'Every price is seeded reference data stamped with its capture date — never a live quote.'],
                    ['2. No Stock Claims', 'Availability is not tracked. A stock badge appears only on rows fed by a connected vendor feed, stamped with that vendor and date.'],
                    ['3. Check Availability', 'The Check Availability link on any offer searches that exact SKU and vendor, so you confirm today\'s price and stock yourself.'],
                    ['4. Draft the PO', 'Adding items creates draft POs grouped by vendor, with the reference-pricing note written onto each PO.'],
                    ['5. Your Vendor Confirms', 'The vendor confirms price and stock before the PO is issued. Vendor API feeds connect here when accounts are linked.'],
                  ].map(([h, b]) => (
                    <div key={h} style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: TEXT }}>{h}</div>
                      <div style={{ fontSize: 11, color: DIM, lineHeight: 1.45 }}>{b}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        }
      />

      {error && (
        <div style={{ background: 'rgba(192,48,48,.12)', border: '1px solid rgba(192,48,48,.3)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: RED, fontSize: 13 }}>
          {error}
        </div>
      )}

      {placed && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
          <CheckCircle size={18} weight="fill" color={GREEN} />
          <span style={{ color: GREEN, fontSize: 13, fontWeight: 700 }}>
            {placed.pos} purchase order{placed.pos === 1 ? '' : 's'} drafted for {fmtMoney(placed.total)} — committed into the project budget.
          </span>
          <a href={`/app/projects/${projectId}/purchase-orders`} style={{ ...ghostButtonStyle, padding: '6px 12px', fontSize: 12 }} className="pmBtn">View POs</a>
        </div>
      )}

      {/* ── The vertical filter moved into the toolbar as a dropdown, and the
           six stat cards are gone. Thirteen gold pills and six cards were
           ~190px of chrome between the header and the first price — on a
           screen whose entire job is comparing prices. Nothing factual was
           lost: items, vendors and the as-of date are in the card subtitle
           below, coverage appears there only when it is not 100%, the cart
           count lives in the sticky order bar it belongs to, and the
           best-price spread was a sales figure, not a decision input. ── */}

      <SectionCard
        title="Price Comparison"
        subtitle={!data ? 'Reference pricing' : [
          `${stats.items} item${stats.items === 1 ? '' : 's'}`,
          `${stats.vendors} vendor${stats.vendors === 1 ? '' : 's'}`,
          // Only worth saying when it is not the whole set — 100% priced is the
          // expected state and reads as filler.
          ...(stats.items > 0 && stats.coverage < 100 ? [`${stats.coverage}% priced`] : []),
          `reference pricing as of ${fmtDate(data.asOfMax)}`,
        ].join(' · ')}
        icon={<Package size={17} weight="duotone" color={GOLD} />}
        flush
      >
        {/* ── One line, not three.
             This said the same thing three times over: the card subtitle above
             already carries "Reference pricing · as of … · availability not
             tracked", then a bold line repeated it, then a paragraph repeated
             it again with ORDER_PATH_SENTENCE — which every row's provenance
             popover also shows. Eighty words of caveat and sixteen vendor
             buttons stood between the header and the first product.
             The honesty is not negotiable, so it stays — as one sentence. The
             long version lives behind "How pricing works" in the header, where
             someone who wants it can go and get it. ── */}
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' as const, padding: '9px 16px', borderBottom: `1px solid ${BORDER}`, background: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)' }}>
          <Info size={13} weight="bold" color={AMBER} style={{ flex: 'none' }} />
          <span style={{ fontSize: 11.5, color: DIM, lineHeight: 1.45, minWidth: 0 }}>
            {data?.hasLiveStockFeed
              ? 'Stock shows only on rows backed by a connected vendor feed.'
              : 'Reference prices, not live quotes — confirm with the vendor before ordering.'}
          </span>
          {vendorLinks.length > 0 && (
            <button
              type="button"
              onClick={() => setShowVendorSites((v) => !v)}
              className="pmBtn"
              style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: DIM, background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 9px', cursor: 'pointer', whiteSpace: 'nowrap' as const }}
            >
              {showVendorSites ? 'Hide Vendor Sites' : `${vendorLinks.length} Vendor Sites`}
            </button>
          )}
        </div>
        <div>
          <div>
            {showVendorSites && vendorLinks.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center', padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
                {vendorLinks.map((v) => (
                  <a
                    key={v.name}
                    href={v.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pmBtn"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: DIM, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' as const }}
                    title={`Open ${v.name}'s website to price and order`}
                  >
                    <Globe size={11} weight="bold" /> {v.name}
                    <ArrowSquareOut size={9} weight="bold" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 20 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="pmSkeleton" style={{ height: 40, borderRadius: 9, background: 'rgba(255,255,255,0.05)', marginBottom: 10, animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <PremiumEmpty
            icon={<Package size={34} weight="duotone" color={GOLD} />}
            title={q.trim() ? 'No items match your search' : 'Nothing on this shelf yet'}
            description={q.trim()
              ? `No catalog items match "${q.trim()}"${vertical === 'all' ? '' : ` in ${titleCase(vertical)}`}. Try a broader term or another vertical.`
              : `The ${vertical === 'all' ? 'catalog' : titleCase(vertical) + ' vertical'} has no priced items yet — seeded reference pricing lands here, and vendor API feeds connect when accounts are linked.`}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="k-table" style={{ width: '100%', borderCollapse: 'collapse' as const }}>
              <thead>
                <tr>
                  <SortableTh label="Add to Order" sort={colSort} onSort={cycleSort} style={{ padding: '9px 12px', minWidth: 132 }} />
                  <SortableTh label="Item" sortKey="item" sort={colSort} onSort={cycleSort} style={{ padding: '9px 12px', minWidth: 260 }} />
                  <SortableTh label="Unit" sortKey="unit" sort={colSort} onSort={cycleSort} style={{ padding: '9px 12px', minWidth: 58 }} />
                  <SortableTh label="Best Price" sortKey="best" sort={colSort} onSort={cycleSort} align="right" style={{ padding: '9px 12px', minWidth: 132 }} />
                  <SortableTh label="Other Quotes" sortKey="quotes" sort={colSort} onSort={cycleSort} style={{ padding: '9px 12px', minWidth: 300 }} />
                  <SortableTh label="Verify" sort={colSort} onSort={cycleSort} style={{ padding: '9px 12px', minWidth: 148 }} />
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((it, idx) => {
                  const best = it.prices.find((p) => p.bestPrice);
                  // One quote per vendor (the API already orders cheapest
                  // first), then every quote that is not the best one,
                  // cheapest first — what the matrix columns used to hold.
                  const byVendor = new Map<string, Offer>();
                  for (const p of it.prices) if (!byVendor.has(p.vendor)) byVendor.set(p.vendor, p);
                  const others = Array.from(byVendor.values())
                    .filter((o) => o !== best)
                    .sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
                  // How far above the best price the dearest quote sits. Null
                  // when there is nothing to compare, so it prints nothing
                  // rather than a meaningless 0%.
                  const overPct = (() => {
                    if (!best || others.length === 0) return null;
                    const lo = Number(best.price) || 0;
                    const hi = Number(others[others.length - 1].price) || 0;
                    if (lo <= 0 || hi <= lo) return null;
                    return Math.round(((hi - lo) / lo) * 100);
                  })();
                  const prevCat = idx > 0 ? sortedItems[idx - 1].category : null;
                  const showCat = sort === 'category' && !colSort && ((it.category || '') !== (prevCat || '') || idx === 0);
                  const qty = cart[it.id] || 0;
                  return (
                    <React.Fragment key={it.id}>
                      {showCat && it.category && (
                        <tr>
                          <td colSpan={6} style={{ padding: '10px 12px 5px', fontSize: 10, fontWeight: 900, color: 'var(--c-text-2)', borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                            {titleCase(it.category)}
                          </td>
                        </tr>
                      )}
                      <tr
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: qty > 0 ? 'color-mix(in srgb, var(--brand-primary) 5%, transparent)' : 'transparent' }}
                        onMouseEnter={(e) => { if (!qty) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                        onMouseLeave={(e) => { if (!qty) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' as const }}>
                          {qty === 0 ? (
                            <button
                              onClick={() => setQty(it.id, 1)}
                              disabled={it.prices.length === 0}
                              className="pmBtn catAdd"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 13px',
                                background: it.prices.length ? `linear-gradient(180deg,var(--brand-primary-strong),${GOLD} 60%,var(--brand-primary-hover))` : 'rgba(255,255,255,0.06)',
                                border: 'none', borderRadius: 8, color: it.prices.length ? 'var(--on-brand)' : 'rgba(255,255,255,0.3)',
                                fontSize: 11.5, fontWeight: 900, cursor: it.prices.length ? 'pointer' : 'not-allowed',
                                boxShadow: it.prices.length ? '0 2px 8px var(--brand-primary-25), inset 0 1px 0 rgba(255,255,255,0.35)' : 'none',
                              }}
                            >
                              <Plus size={12} weight="bold" /> Add
                            </button>
                          ) : (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0, border: `1px solid var(--brand-primary-35)`, borderRadius: 8, overflow: 'hidden', background: 'var(--brand-primary-08)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                              <button onClick={() => setQty(it.id, qty - 1)} className="pmBtn catStep" style={{ padding: '5px 9px', background: 'var(--brand-primary-12)', border: 'none', boxShadow: 'inset -1px 0 0 var(--brand-primary-25)', color: AMBER, cursor: 'pointer' }}><Minus size={11} weight="bold" /></button>
                              <input
                                value={qty}
                                onChange={(e) => setQty(it.id, Math.max(0, parseInt(e.target.value) || 0))}
                                style={{ width: 42, textAlign: 'center', background: 'transparent', border: 'none', color: AMBER, fontWeight: 800, fontSize: 12.5, outline: 'none', fontVariantNumeric: 'tabular-nums' }}
                              />
                              <button onClick={() => setQty(it.id, qty + 1)} className="pmBtn catStep" style={{ padding: '5px 9px', background: 'var(--brand-primary-12)', border: 'none', boxShadow: 'inset 1px 0 0 var(--brand-primary-25)', color: AMBER, cursor: 'pointer' }}><Plus size={11} weight="bold" /></button>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', minWidth: 220 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <ItemVisual item={it} onOpen={setLightbox} />
                            <div style={{ minWidth: 0, position: 'relative' }}>
                              <div style={{ fontWeight: 700, color: TEXT, fontSize: 12.5, lineHeight: 1.3 }}>{it.name}</div>
                              {(it.description || it.skuHint) && (
                                <div style={{ fontSize: 11, color: 'var(--c-text-2)', marginTop: 2, lineHeight: 1.4 }}>
                                  {it.description}{it.description && it.skuHint ? ' · ' : ''}{it.skuHint ? `SKU ${it.skuHint}` : ''}
                                </div>
                              )}
                              {it.canEditImage && (
                                <button
                                  onClick={() => { setImgMenu(imgMenu === it.id ? null : it.id); setImgErr(''); setImgUrlDraft(''); }}
                                  className="pmBtn catImgBtn"
                                  title={imgBusy === it.id ? 'Saving photo…' : it.imageUrl ? 'Replace product photo' : 'Add product photo'}
                                  aria-label={it.imageUrl ? 'Replace product photo' : 'Add product photo'}
                                  style={{ display: 'inline-flex', alignItems: 'center', marginTop: 4, padding: '3px 6px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${BORDER}`, borderRadius: 6, color: DIM, cursor: 'pointer' }}
                                >
                                  <Camera size={11} />
                                </button>
                              )}
                              {imgMenu === it.id && (
                                <div style={{ position: 'absolute', zIndex: 80, top: '100%', left: 0, marginTop: 6, width: 252, padding: 11, borderRadius: 10, background: 'var(--bg-solid-2)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', boxShadow: '0 10px 28px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}>
                                  <div style={{ fontSize: 9.5, fontWeight: 900, color: AMBER, marginBottom: 7 }}>Real Product Photo</div>
                                  <label className="pmBtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', background: 'var(--brand-primary-12)', border: '1px solid var(--brand-primary-35)', borderRadius: 8, color: AMBER, fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                                    <UploadSimple size={12} weight="bold" /> Upload Image
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/webp,image/gif"
                                      style={{ display: 'none' }}
                                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(it.id, f); e.target.value = ''; }}
                                    />
                                  </label>
                                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                                    <input
                                      value={imgUrlDraft}
                                      onChange={(e) => setImgUrlDraft(e.target.value)}
                                      placeholder="…or paste manufacturer image URL"
                                      style={{ flex: 1, minWidth: 0, padding: '6px 8px', background: DARK, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 11, outline: 'none' }}
                                    />
                                    <button
                                      onClick={() => attachImageUrl(it.id)}
                                      disabled={!imgUrlDraft.trim() || imgBusy === it.id}
                                      className="pmBtn"
                                      title="Save image URL"
                                      style={{ padding: '6px 9px', background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, cursor: imgUrlDraft.trim() && imgBusy !== it.id ? 'pointer' : 'not-allowed' }}
                                    >
                                      <LinkSimple size={12} weight="bold" />
                                    </button>
                                  </div>
                                  <div style={{ fontSize: 9.5, color: 'var(--c-text-2)', marginTop: 7, lineHeight: 1.45 }}>Images only, 5MB max. Paste a real vendor or manufacturer URL — never a guess.</div>
                                  {imgErr && <div style={{ fontSize: 10.5, color: RED, marginTop: 6 }}>{imgErr}</div>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', color: DIM, whiteSpace: 'nowrap' as const }}>{it.unit || '—'}</td>
                        {/* BEST PRICE — the number, who quoted it, nothing else. */}
                        <td style={{ padding: '9px 12px', textAlign: 'right' as const, whiteSpace: 'nowrap' as const, verticalAlign: 'middle' }}>
                          {best ? (
                            <span className="catProv" tabIndex={0}>
                              <ProvPop offer={best} item={it} />
                              <div style={{ fontWeight: 800, color: AMBER, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtMoney(best.price)}<RefChip />
                              </div>
                              <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>{best.vendor}</div>
                              <Availability offer={best} compact feedConnected={!!data?.hasLiveStockFeed} />
                              {/* Lead time comes off the same seeded row as stock — only a real feed may show it. */}
                              {hasLiveStock(best) && best.leadTimeDays != null && best.leadTimeDays > 0 && (
                                <div style={{ fontSize: 10, color: 'var(--c-text-2)', display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                                  <Truck size={10} color="rgba(255,255,255,0.45)" />{best.leadTimeDays}d lead
                                </div>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--c-text-2)', fontSize: 11.5 }}>No quotes yet</span>
                          )}
                        </td>

                        {/* ── OTHER QUOTES ──────────────────────────────────
                             This replaced a sixteen-column vendor matrix.
                             Sixteen columns to carry three numbers a row: the
                             grid measured 2,860px wide (about 1,240px of it
                             scrolled off the right edge, so twelve vendors were
                             invisible), and of its 3,568 cells, 2,901 — 81% —
                             held nothing but an em-dash. A price comparison
                             screen where four fifths of the pixels say "no
                             price" is not comparing anything.

                             Every quote that existed in the matrix is still
                             here, cheapest first, each with the same
                             provenance popover. What is gone is the space
                             reserved for the quotes that do not exist.

                             The tradeoff, stated plainly: you can no longer
                             sort the whole catalog by one named vendor's
                             price. At 18.7% fill that sort put a handful of
                             priced rows above a couple hundred dashes, in a
                             column you had to scroll sideways to read. ── */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {others.length === 0 ? (
                            <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>
                              {best ? 'Only quote on file' : '—'}
                            </span>
                          ) : (
                            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, alignItems: 'center' }}>
                              {others.map((o, i) => (
                                <span key={`${o.vendor}-${i}`} className="catProv" tabIndex={0}>
                                  <ProvPop offer={o} item={it} />
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'baseline', gap: 6,
                                    padding: '3px 8px', borderRadius: 7,
                                    border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.03)',
                                    whiteSpace: 'nowrap' as const,
                                  }}>
                                    <span style={{ fontSize: 10.5, color: DIM }}>{o.vendor}</span>
                                    <span style={{ fontSize: 12, fontWeight: 700, color: TEXT, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(o.price)}</span>
                                    {/* Only a live feed may say anything about stock. */}
                                    {hasLiveStock(o) && <Availability offer={o} compact feedConnected={!!data?.hasLiveStockFeed} />}
                                  </span>
                                </span>
                              ))}
                              {/* What the spread actually costs you, per item —
                                  the one number the old "avg savings" card was
                                  trying to be, but per row and actionable. */}
                              {best && overPct != null && (
                                <span
                                  style={{ fontSize: 10, fontWeight: 800, color: 'var(--c-text-2)', whiteSpace: 'nowrap' as const, marginLeft: 2 }}
                                  title={`Highest quote on file is ${overPct}% above ${best.vendor}'s ${fmtMoney(best.price)}`}
                                >
                                  +{overPct}% high
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* VERIFY — the real order path. No Buy button exists,
                            because nothing here can be bought without the vendor. */}
                        <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
                          {best && (
                            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4, alignItems: 'flex-start' }}>
                              <a
                                href={checkAvailabilityUrl(it, best.vendor)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="pmBtn"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 800, color: AMBER, textDecoration: 'none', border: '1px solid var(--brand-primary-35)', background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)', borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' as const }}
                                title={`Search today's price and availability for this SKU at ${best.vendor}`}
                              >
                                <MagnifyingGlassPlus size={10} weight="bold" /> Check Availability
                              </a>
                              {vendorSiteHref(best.vendorWebsite) && (
                                <a
                                  href={vendorSiteHref(best.vendorWebsite) as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="pmBtn"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9.5, fontWeight: 800, color: DIM, textDecoration: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '3px 7px', whiteSpace: 'nowrap' as const }}
                                  title={`Open ${best.vendor}'s website`}
                                >
                                  <Globe size={10} weight="bold" /> {best.vendor}
                                  <ArrowSquareOut size={9} weight="bold" />
                                </a>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Sticky order bar — appears the moment anything is selected ── */}
      {cartCount > 0 && (
        <div style={{
          // Above the chat launcher (9999), which otherwise sits on this bar's buttons on a phone.
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10000,
          background: 'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0) 46%), rgba(12,12,13,0.97)',
          borderTop: `1px solid var(--brand-primary-35)`,
          boxShadow: '0 -8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)',
          padding: '14px 16px calc(14px + env(safe-area-inset-bottom, 0px))',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          animation: 'pmRise .2s cubic-bezier(.2,.7,.3,1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingCartSimple size={20} weight="fill" color={GOLD} />
            <div>
              <div style={{ fontWeight: 800, color: TEXT, fontSize: 13.5, fontVariantNumeric: 'tabular-nums' }}>{cartCount} item{cartCount === 1 ? '' : 's'} · {fmtMoney(cartTotal)}</div>
              <div style={{ fontSize: 11, color: DIM }}>Best reference offer per item · availability not tracked · POs grouped by vendor · your vendor confirms price and stock before issue</div>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <select id="cat-po-project" aria-label="Project" aria-required="true" aria-invalid={placeErr && !projectId ? true : undefined} value={projectId} onChange={(e) => { setProjectId(e.target.value); setPlaceErr(''); }} style={{ ...SEL, minWidth: 0, flex: '1 1 220px', minHeight: 44 }} className="pmBtn">
            <option value="">Select project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            onClick={placeOrders}
            disabled={placing}
            className="pmBtn"
            style={{ ...goldButtonStyle, minHeight: 44, opacity: !projectId || placing ? 0.55 : 1, cursor: placing ? 'not-allowed' : 'pointer' }}
          >
            {placing ? 'Creating POs…' : `Create Purchase Order${cartLines.length > 1 ? 's' : ''}`}
          </button>
          <button onClick={() => { setCart({}); setPlaceErr(''); }} className="pmBtn" style={{ ...ghostButtonStyle, padding: '9px 12px', minHeight: 44, minWidth: 44 }} title="Clear selection" aria-label="Clear selection">
            <X size={14} weight="bold" />
          </button>
          {placeErr && <div role="alert" style={{ width: '100%', color: RED, fontSize: 13 }}>{placeErr}</div>}
        </div>
      )}
      {/* ── Lightbox — real product images only, never a placeholder blowup ── */}
      {lightbox && lightbox.imageUrl && (
        <div
          onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(2,4,8,0.72)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28, cursor: 'zoom-out' }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 'min(760px, 92vw)', background: 'var(--bg-surface)', border: '1px solid color-mix(in srgb, var(--brand-primary) 30%, transparent)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)', cursor: 'default' }}>
            <img src={lightbox.imageUrl} alt={lightbox.name} style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', margin: '0 auto', background: DARK }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: `1px solid ${BORDER}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: TEXT, fontSize: 13 }}>{lightbox.name}</div>
                <div style={{ fontSize: 10.5, color: DIM, marginTop: 1 }}>{titleCase(lightbox.vertical)}{lightbox.skuHint ? ` · SKU ${lightbox.skuHint}` : ''}</div>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={() => setLightbox(null)} className="pmBtn" style={{ ...ghostButtonStyle, padding: '7px 10px' }} title="Close">
                <X size={13} weight="bold" />
              </button>
            </div>
          </div>
        </div>
      )}
    </PremiumSurface>
  );
}
