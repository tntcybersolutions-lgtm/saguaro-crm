import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helper';
import QRCode from 'qrcode';

/**
 * GET /api/punch-list/qr/[projectId]
 * Generate QR codes for punch list items.
 * ?itemId=xxx  — single QR code as JSON { qr, url }
 * (no itemId)  — printable HTML page with 3-column grid of all open items
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;
  const { supabase, tenantId } = auth;
  const { projectId } = await params;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  if (itemId) {
    // Single QR code
    const url = `${appUrl}/field/punch/${itemId}`;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    return NextResponse.json({ qr: qrDataUrl, url });
  }

  // QR sheet — all open items
  const { data: items } = await supabase
    .from('punch_list')
    .select('id, item_number, title, location, room_number, floor_level')
    .eq('project_id', projectId)
    .eq('tenant_id', tenantId)
    .in('status', ['open', 'in_progress'])
    .order('item_number');

  const qrItems = await Promise.all(
    (items || []).map(async (item) => {
      const url = `${appUrl}/field/punch/${item.id}`;
      const qr = await QRCode.toDataURL(url, { width: 120, margin: 1 });
      return { ...item, qr, url };
    }),
  );

  // Get project name
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .single();

  const projectName = project?.name || 'Project';
  const dateStr = new Date().toLocaleDateString();

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Punch List QR Codes - ${projectName}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: Arial, sans-serif; }
    h1 { font-size: 14pt; margin-bottom: 4px; }
    .sub { font-size: 9pt; color: #555; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .card { border: 1px solid #ccc; border-radius: 6px; padding: 12px; display: flex; align-items: flex-start; gap: 10px; break-inside: avoid; }
    .qr-img { width: 80px; height: 80px; flex-shrink: 0; }
    .info { flex: 1; }
    .num { font-size: 14pt; font-weight: bold; color: #000; }
    .title { font-size: 9pt; color: #333; margin-top: 2px; line-height: 1.3; }
    .loc { font-size: 8pt; color: #666; margin-top: 4px; }
    .instructions { font-size: 8pt; color: #888; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>Punch List QR Codes - ${projectName}</h1>
  <div class="sub">Generated ${dateStr} &middot; ${qrItems.length} open items &middot; Scan with any smartphone camera</div>
  <div class="grid">
    ${qrItems
      .map(
        (item) => `
      <div class="card">
        <img class="qr-img" src="${item.qr}" />
        <div class="info">
          <div class="num">#${item.item_number || ''}</div>
          <div class="title">${item.title || ''}</div>
          <div class="loc">${[item.floor_level, item.room_number, item.location].filter(Boolean).join(' &middot; ')}</div>
        </div>
      </div>
    `,
      )
      .join('')}
  </div>
  <div class="instructions">
    Post these QR codes in the rooms/areas they reference. Field workers scan the code with their phone camera to open the punch item directly and mark it complete, add photos, or log notes.
  </div>
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
