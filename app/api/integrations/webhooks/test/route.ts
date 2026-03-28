import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/supabase-server';

/* ------------------------------------------------------------------ */
/*  POST  /api/integrations/webhooks/test                             */
/*  Test a webhook endpoint by sending a sample payload               */
/* ------------------------------------------------------------------ */
export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { url, event_type } = body;

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return NextResponse.json({ error: 'URL must use http or https protocol' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
    }

    // Build sample payload based on event type
    const samplePayloads: Record<string, any> = {
      'project.created': {
        event: 'project.created',
        timestamp: new Date().toISOString(),
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Test Project - Webhook Verification',
          status: 'active',
          address: '123 Test St, Phoenix, AZ 85001',
          contract_value: 1250000,
          created_at: new Date().toISOString(),
        },
      },
      'invoice.sent': {
        event: 'invoice.sent',
        timestamp: new Date().toISOString(),
        data: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          invoice_number: 'INV-TEST-001',
          vendor_name: 'Test Subcontractor LLC',
          amount: 45000,
          status: 'sent',
          project_id: '550e8400-e29b-41d4-a716-446655440000',
          sent_at: new Date().toISOString(),
        },
      },
      'pay_app.approved': {
        event: 'pay_app.approved',
        timestamp: new Date().toISOString(),
        data: {
          id: '550e8400-e29b-41d4-a716-446655440002',
          pay_app_number: 3,
          project_name: 'Test Project',
          amount_requested: 125000,
          amount_approved: 118750,
          approved_by: 'test@saguaro.com',
          approved_at: new Date().toISOString(),
        },
      },
      'change_order.created': {
        event: 'change_order.created',
        timestamp: new Date().toISOString(),
        data: {
          id: '550e8400-e29b-41d4-a716-446655440003',
          co_number: 'CO-001',
          project_name: 'Test Project',
          description: 'Additional electrical work per owner request',
          amount: 15000,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      },
      'rfi.submitted': {
        event: 'rfi.submitted',
        timestamp: new Date().toISOString(),
        data: {
          id: '550e8400-e29b-41d4-a716-446655440004',
          rfi_number: 'RFI-042',
          subject: 'Clarification on footing dimensions',
          project_name: 'Test Project',
          submitted_by: 'test@saguaro.com',
          due_date: new Date(Date.now() + 7 * 86400000).toISOString(),
        },
      },
      'contract.signed': {
        event: 'contract.signed',
        timestamp: new Date().toISOString(),
        data: {
          id: '550e8400-e29b-41d4-a716-446655440005',
          contract_number: 'CTR-2024-015',
          vendor_name: 'Test Mechanical Inc',
          value: 285000,
          signed_at: new Date().toISOString(),
        },
      },
    };

    const eventKey = event_type || 'project.created';
    const payload = samplePayloads[eventKey] || samplePayloads['project.created'];
    payload.test = true;
    payload.webhook_id = 'test_' + Date.now();

    // Send test webhook
    let testResult: { success: boolean; status: number; response_time_ms: number; response_body?: string; error?: string };

    const startTime = Date.now();
    try {
      const webhookRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Saguaro-Event': eventKey,
          'X-Saguaro-Delivery': payload.webhook_id,
          'X-Saguaro-Signature': 'test_signature',
          'User-Agent': 'Saguaro-Webhooks/1.0',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const responseTime = Date.now() - startTime;
      const responseBody = await webhookRes.text().catch(() => '');

      testResult = {
        success: webhookRes.ok,
        status: webhookRes.status,
        response_time_ms: responseTime,
        response_body: responseBody.substring(0, 500),
      };
    } catch (fetchErr: any) {
      testResult = {
        success: false,
        status: 0,
        response_time_ms: Date.now() - startTime,
        error: fetchErr.name === 'TimeoutError'
          ? 'Request timed out after 15 seconds'
          : fetchErr.message,
      };
    }

    return NextResponse.json({
      test: true,
      event_type: eventKey,
      endpoint: url,
      payload_sent: payload,
      result: testResult,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
