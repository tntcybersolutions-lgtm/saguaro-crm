import { NextRequest } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return new Response('Profile not found', { status: 404 })

  const tenantId = profile.tenant_id

  const encoder = new TextEncoder()
  let closed = false
  let lastItemCount = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { closed = true }
      }

      // Heartbeat to keep connection alive
      const heartbeat = setInterval(() => {
        send({ type: 'heartbeat', ts: Date.now() })
      }, 15000)

      // Poll DB for progress
      const poll = setInterval(async () => {
        if (closed) { clearInterval(poll); clearInterval(heartbeat); return }

        try {
          const { data: takeoff } = await supabase
            .from('takeoffs')
            .select('status, progress_pct, pages_processed, page_count, processing_error, grand_total')
            .eq('id', params.id).eq('tenant_id', tenantId).single()

          if (!takeoff) return

          send({
            type:     'progress',
            status:   takeoff.status,
            pct:      takeoff.progress_pct || 0,
            pages:    `${takeoff.pages_processed || 0} / ${takeoff.page_count || '?'}`,
            page:     takeoff.pages_processed || 0,
            totalPages: takeoff.page_count || 0,
            message:  takeoff.pages_processed > 0
              ? `Reading page ${takeoff.pages_processed} of ${takeoff.page_count || '?'}...`
              : 'Sending plans to Sage AI...',
          })

          // Check for new line items
          const { count } = await supabase
            .from('takeoff_line_items')
            .select('id', { count: 'exact', head: true })
            .eq('takeoff_id', params.id)
            .eq('tenant_id', tenantId)

          const currentCount = count || 0
          if (currentCount > lastItemCount) {
            // Fetch the newest items
            const { data: newItems } = await supabase
              .from('takeoff_line_items')
              .select('id, csi_division, description, quantity, unit, unit_material_cost, unit_labor_cost')
              .eq('takeoff_id', params.id)
              .eq('tenant_id', tenantId)
              .order('created_at', { ascending: false })
              .limit(currentCount - lastItemCount)

            send({ type: 'items', total: currentCount, new_items: newItems || [] })
            lastItemCount = currentCount
          }

          if (takeoff.status === 'complete') {
            send({
              type:        'done',
              grand_total: takeoff.grand_total,
              item_count:  currentCount,
            })
            clearInterval(poll)
            clearInterval(heartbeat)
            closed = true
            controller.close()
          }

          if (takeoff.status === 'failed') {
            send({ type: 'error', message: takeoff.processing_error || 'Extraction failed' })
            clearInterval(poll)
            clearInterval(heartbeat)
            closed = true
            controller.close()
          }
        } catch (pollErr) {
          console.error('[stream] poll error:', pollErr)
        }
      }, 2000)

      // Abort handler
      req.signal.addEventListener('abort', () => {
        closed = true
        clearInterval(poll)
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
