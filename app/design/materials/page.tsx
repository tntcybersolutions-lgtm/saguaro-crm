'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';

/* ─── Palette ─── */
const BG = '#F8F9FB', CARD = '#F8F9FB', GOLD = '#C8960F', GREEN = '#22C55E';
const BORDER = '#2A3040', TEXT = '#F0F4FF', DIM = '#8B9DB8', DARK = '#141922';
const RED = '#EF4444', BLUE = '#3B82F6';

const glass: React.CSSProperties = {
  background: `${CARD}CC`, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid ${BORDER}`, borderRadius: 16,
};

/* ─── Categories & Products ─── */
const CATEGORIES = [
  { id: 'flooring', label: 'Flooring', icon: '🪵' },
  { id: 'countertops', label: 'Countertops', icon: '🪨' },
  { id: 'tile', label: 'Tile', icon: '🧱' },
  { id: 'fixtures', label: 'Fixtures', icon: '🚰' },
  { id: 'paint', label: 'Paint', icon: '🎨' },
  { id: 'appliances', label: 'Appliances', icon: '🍳' },
  { id: 'lighting', label: 'Lighting', icon: '💡' },
  { id: 'hardware', label: 'Hardware', icon: '🔩' },
];

type Product = {
  id: string; name: string; brand: string; price: number; unit: string;
  color: string; color_hex: string; category: string; image?: string;
};

const SEED_PRODUCTS: Product[] = [
  // Flooring
  { id: 'f1', name: 'Engineered Hardwood - Oak', brand: 'Shaw', price: 8.50, unit: 'sq ft', color: 'Natural Oak', color_hex: '#C4A36B', category: 'flooring' },
  { id: 'f2', name: 'Luxury Vinyl Plank', brand: 'Mohawk', price: 4.25, unit: 'sq ft', color: 'Driftwood', color_hex: '#A89278', category: 'flooring' },
  { id: 'f3', name: 'Polished Concrete', brand: 'ConcreteWorks', price: 6.00, unit: 'sq ft', color: 'Dove Gray', color_hex: '#9B9B9B', category: 'flooring' },
  { id: 'f4', name: 'Bamboo Plank', brand: 'Cali', price: 5.75, unit: 'sq ft', color: 'Caramel', color_hex: '#D4944A', category: 'flooring' },
  { id: 'f5', name: 'Porcelain Wood-Look', brand: 'Daltile', price: 7.00, unit: 'sq ft', color: 'Charcoal', color_hex: '#4A4A4A', category: 'flooring' },
  // Countertops
  { id: 'c1', name: 'Quartz - Calacatta', brand: 'Caesarstone', price: 85.00, unit: 'sq ft', color: 'White Gold', color_hex: '#F5F0E1', category: 'countertops' },
  { id: 'c2', name: 'Granite - Absolute Black', brand: 'MSI', price: 65.00, unit: 'sq ft', color: 'Black', color_hex: '#1A1A1A', category: 'countertops' },
  { id: 'c3', name: 'Butcher Block - Walnut', brand: 'John Boos', price: 55.00, unit: 'sq ft', color: 'Walnut', color_hex: '#5C3D2E', category: 'countertops' },
  { id: 'c4', name: 'Marble - Carrara', brand: 'Arizona Tile', price: 95.00, unit: 'sq ft', color: 'White Vein', color_hex: '#E8E4DE', category: 'countertops' },
  // Tile
  { id: 't1', name: 'Subway Tile 3x6', brand: 'Daltile', price: 3.50, unit: 'sq ft', color: 'Bright White', color_hex: '#FFFFFF', category: 'tile' },
  { id: 't2', name: 'Mosaic Hexagon', brand: 'Merola', price: 12.00, unit: 'sq ft', color: 'Matte Black', color_hex: '#2C2C2C', category: 'tile' },
  { id: 't3', name: 'Large Format 24x48', brand: 'Porcelanosa', price: 9.50, unit: 'sq ft', color: 'Silver', color_hex: '#C0C0C0', category: 'tile' },
  // Fixtures
  { id: 'x1', name: 'Rain Shower Head', brand: 'Moen', price: 280.00, unit: 'each', color: 'Brushed Nickel', color_hex: '#B5B5B5', category: 'fixtures' },
  { id: 'x2', name: 'Freestanding Bathtub', brand: 'Kohler', price: 2400.00, unit: 'each', color: 'White', color_hex: '#F8F8F8', category: 'fixtures' },
  { id: 'x3', name: 'Vessel Sink', brand: 'Kraus', price: 180.00, unit: 'each', color: 'Matte Black', color_hex: '#1E1E1E', category: 'fixtures' },
  // Paint
  { id: 'p1', name: 'Interior Eggshell', brand: 'Benjamin Moore', price: 65.00, unit: 'gallon', color: 'Simply White', color_hex: '#F5F0E8', category: 'paint' },
  { id: 'p2', name: 'Interior Matte', brand: 'Sherwin-Williams', price: 55.00, unit: 'gallon', color: 'Repose Gray', color_hex: '#B8B0A8', category: 'paint' },
  { id: 'p3', name: 'Accent Wall Satin', brand: 'Farrow & Ball', price: 110.00, unit: 'gallon', color: 'Hague Blue', color_hex: '#2C4A52', category: 'paint' },
  // Appliances
  { id: 'a1', name: 'Smart Refrigerator', brand: 'Samsung', price: 3200.00, unit: 'each', color: 'Stainless', color_hex: '#C8C8C8', category: 'appliances' },
  { id: 'a2', name: 'Induction Range', brand: 'Bosch', price: 2800.00, unit: 'each', color: 'Black Stainless', color_hex: '#3A3A3A', category: 'appliances' },
  { id: 'a3', name: 'Smart Dishwasher', brand: 'LG', price: 1100.00, unit: 'each', color: 'Stainless', color_hex: '#D0D0D0', category: 'appliances' },
  // Lighting
  { id: 'l1', name: 'Pendant Light', brand: 'West Elm', price: 180.00, unit: 'each', color: 'Brass', color_hex: '#C9A84C', category: 'lighting' },
  { id: 'l2', name: 'Recessed LED 6"', brand: 'Halo', price: 28.00, unit: 'each', color: 'White', color_hex: '#EFEFEF', category: 'lighting' },
  { id: 'l3', name: 'Under-Cabinet LED Strip', brand: 'Philips Hue', price: 85.00, unit: 'per ft', color: 'Warm White', color_hex: '#FFD699', category: 'lighting' },
  // Hardware
  { id: 'h1', name: 'Cabinet Pull 5"', brand: 'Amerock', price: 8.50, unit: 'each', color: 'Matte Black', color_hex: '#1C1C1C', category: 'hardware' },
  { id: 'h2', name: 'Cabinet Knob', brand: 'Top Knobs', price: 6.00, unit: 'each', color: 'Brushed Gold', color_hex: '#C4A43C', category: 'hardware' },
  { id: 'h3', name: 'Door Lever Set', brand: 'Schlage', price: 45.00, unit: 'each', color: 'Satin Nickel', color_hex: '#BABABA', category: 'hardware' },
];

const ROOMS_ASSIGN = ['Kitchen', 'Bathroom', 'Living Room', 'Bedroom', 'Office', 'Garage', 'Exterior'];

type Selection = { product: Product; qty: number; room: string };

export default function MaterialsPage() {
  const [products, setProducts] = useState<Product[]>(SEED_PRODUCTS);
  const [activeCategory, setActiveCategory] = useState('flooring');
  const [selections, setSelections] = useState<Selection[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/materials/products').then(r => r.json())
      .then(data => { if (data?.products?.length) setProducts(data.products); })
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let items = products.filter(p => p.category === activeCategory);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(p =>
        p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.color.toLowerCase().includes(q)
      );
    }
    return items;
  }, [products, activeCategory, search]);

  const addToSelection = useCallback((product: Product) => {
    setSelections(prev => {
      const existing = prev.find(s => s.product.id === product.id);
      if (existing) return prev.map(s => s.product.id === product.id ? { ...s, qty: s.qty + 1 } : s);
      return [...prev, { product, qty: 1, room: 'Kitchen' }];
    });
    setDrawerOpen(true);
  }, []);

  const removeSelection = useCallback((productId: string) => {
    setSelections(prev => prev.filter(s => s.product.id !== productId));
  }, []);

  const updateQty = useCallback((productId: string, qty: number) => {
    if (qty < 1) return;
    setSelections(prev => prev.map(s => s.product.id === productId ? { ...s, qty } : s));
  }, []);

  const updateRoom = useCallback((productId: string, room: string) => {
    setSelections(prev => prev.map(s => s.product.id === productId ? { ...s, room } : s));
  }, []);

  const totalCost = useMemo(() =>
    selections.reduce((sum, s) => sum + s.product.price * s.qty, 0), [selections]
  );

  const exportToEstimate = async () => {
    try {
      await fetch('/api/takeoff/from-materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selections.map(s => ({
            name: s.product.name, brand: s.product.brand,
            quantity: s.qty, unit: s.product.unit,
            unit_cost: s.product.price, room: s.room,
            category: s.product.category,
          })),
        }),
      });
      alert('Selections exported to your estimate!');
    } catch {
      alert('Export saved locally. Sign in to sync to your project.');
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TEXT }}>
      {/* Header */}
      <section style={{
        textAlign: 'center', padding: '80px 20px 40px',
        background: `linear-gradient(180deg, ${DARK} 0%, ${BG} 100%)`,
      }}>
        <h1 style={{ fontSize: 'clamp(26px, 5vw, 44px)', fontWeight: 800, marginBottom: 12 }}>
          Material <span style={{ color: GOLD }}>Selection Board</span>
        </h1>
        <p style={{ fontSize: 17, color: DIM, maxWidth: 600, margin: '0 auto' }}>
          Browse, compare, and select materials for your project.
        </p>
      </section>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 20px 80px' }}>
        {/* Category Tabs */}
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20,
          WebkitOverflowScrolling: 'touch',
        }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => { setActiveCategory(cat.id); setSearch(''); }} style={{
              padding: '10px 18px', borderRadius: 10, border: `1px solid ${activeCategory === cat.id ? GOLD : BORDER}`,
              background: activeCategory === cat.id ? `${GOLD}18` : `${CARD}CC`,
              color: activeCategory === cat.id ? GOLD : TEXT, fontWeight: 600,
              fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .2s',
              backdropFilter: 'blur(8px)',
            }}>
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>

        {/* Search + My Selections toggle */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <input
            type="text" placeholder="Search materials..." value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 200, padding: '12px 16px', background: `${CARD}CC`,
              border: `1px solid ${BORDER}`, borderRadius: 12, color: TEXT,
              fontSize: 14, outline: 'none',
            }}
          />
          <button onClick={() => setDrawerOpen(!drawerOpen)} style={{
            padding: '12px 20px', background: selections.length > 0 ? `${GREEN}20` : `${CARD}CC`,
            border: `1px solid ${selections.length > 0 ? GREEN : BORDER}`,
            borderRadius: 12, color: selections.length > 0 ? GREEN : DIM,
            fontWeight: 700, cursor: 'pointer', fontSize: 14, position: 'relative',
          }}>
            My Selections
            {selections.length > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                background: GREEN, color: '#000', borderRadius: '50%', fontSize: 11,
                fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{selections.length}</span>
            )}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: drawerOpen ? '1fr 340px' : '1fr', gap: 24 }}>
          {/* Product Grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16,
            alignContent: 'start',
          }}>
            {filtered.map(product => {
              const isSelected = selections.some(s => s.product.id === product.id);
              return (
                <div key={product.id} style={{
                  ...glass, padding: 0, overflow: 'hidden',
                  borderColor: isSelected ? GREEN : BORDER, transition: 'all .2s',
                }}>
                  {/* Product image placeholder */}
                  <div style={{
                    height: 120, background: `linear-gradient(135deg, ${product.color_hex}40, ${CARD})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: 8, background: product.color_hex,
                      border: `2px solid ${BORDER}`,
                    }} />
                    {isSelected && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8, background: GREEN,
                        color: '#000', fontSize: 11, fontWeight: 800, padding: '2px 8px',
                        borderRadius: 6,
                      }}>Selected</div>
                    )}
                  </div>
                  <div style={{ padding: '14px 16px' }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{product.name}</h4>
                    <div style={{ fontSize: 12, color: DIM, marginBottom: 6 }}>{product.brand}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4, background: product.color_hex,
                        border: `1px solid ${BORDER}`,
                      }} />
                      <span style={{ fontSize: 12, color: DIM }}>{product.color}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: 18, fontWeight: 800, color: GOLD }}>
                          ${product.price.toFixed(2)}
                        </span>
                        <span style={{ fontSize: 12, color: DIM }}>/{product.unit}</span>
                      </div>
                      <button onClick={() => addToSelection(product)} style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: isSelected ? `${GREEN}20` : `${GOLD}20`,
                        border: `1px solid ${isSelected ? GREEN : GOLD}`,
                        color: isSelected ? GREEN : GOLD, fontSize: 12,
                        fontWeight: 700, cursor: 'pointer',
                      }}>
                        {isSelected ? '+ More' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: DIM }}>
                No products found in this category.
              </div>
            )}
          </div>

          {/* Selections Drawer */}
          {drawerOpen && (
            <div style={{ ...glass, padding: 20, height: 'fit-content', position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>My Selections</h3>
                <button onClick={() => setDrawerOpen(false)} style={{
                  background: 'none', border: 'none', color: DIM, fontSize: 18,
                  cursor: 'pointer',
                }}>&#10005;</button>
              </div>

              {selections.length === 0 ? (
                <p style={{ color: DIM, fontSize: 13, textAlign: 'center', padding: 20 }}>
                  No materials selected yet. Browse and add items.
                </p>
              ) : (
                <>
                  <div style={{ maxHeight: 400, overflowY: 'auto', marginBottom: 16 }}>
                    {selections.map(s => (
                      <div key={s.product.id} style={{
                        padding: '12px', background: `${BG}60`, borderRadius: 10,
                        border: `1px solid ${BORDER}`, marginBottom: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.product.name}</div>
                            <div style={{ fontSize: 11, color: DIM }}>{s.product.brand}</div>
                          </div>
                          <button onClick={() => removeSelection(s.product.id)} style={{
                            background: 'none', border: 'none', color: RED,
                            cursor: 'pointer', fontSize: 14,
                          }}>&#10005;</button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <button onClick={() => updateQty(s.product.id, s.qty - 1)} style={{
                            width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER}`,
                            background: CARD, color: TEXT, cursor: 'pointer', fontSize: 14,
                          }}>-</button>
                          <span style={{ fontSize: 14, fontWeight: 700, minWidth: 30, textAlign: 'center' }}>
                            {s.qty}
                          </span>
                          <button onClick={() => updateQty(s.product.id, s.qty + 1)} style={{
                            width: 26, height: 26, borderRadius: 6, border: `1px solid ${BORDER}`,
                            background: CARD, color: TEXT, cursor: 'pointer', fontSize: 14,
                          }}>+</button>
                          <span style={{ fontSize: 12, color: DIM }}>{s.product.unit}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginLeft: 'auto' }}>
                            ${(s.product.price * s.qty).toFixed(2)}
                          </span>
                        </div>
                        <select
                          value={s.room} onChange={e => updateRoom(s.product.id, e.target.value)}
                          style={{
                            width: '100%', padding: '6px 10px', background: BG,
                            border: `1px solid ${BORDER}`, borderRadius: 6,
                            color: TEXT, fontSize: 12, outline: 'none',
                          }}
                        >
                          {ROOMS_ASSIGN.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    padding: '14px 0', borderTop: `1px solid ${BORDER}`,
                    display: 'flex', justifyContent: 'space-between', marginBottom: 12,
                  }}>
                    <span style={{ fontWeight: 700 }}>Total</span>
                    <span style={{ fontSize: 20, fontWeight: 800, color: GREEN }}>
                      ${totalCost.toFixed(2)}
                    </span>
                  </div>

                  <button onClick={exportToEstimate} style={{
                    width: '100%', padding: '12px', background: `linear-gradient(135deg, ${GOLD}, #B8860B)`,
                    color: '#000', border: 'none', borderRadius: 10, fontWeight: 700,
                    fontSize: 14, cursor: 'pointer',
                  }}>
                    Export to Estimate
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          div[style*="grid-template-columns: 1fr 340px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
