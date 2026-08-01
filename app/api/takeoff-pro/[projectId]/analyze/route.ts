import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import Anthropic from '@anthropic-ai/sdk'
import { prepareImageForClaude, ImagePrepError, detectImageType, type ClaudeImageMediaType } from '@/lib/image-detect'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const CSI_DIVISIONS: Record<string, string> = {
  '00': 'Procurement & Contracting',
  '01': 'General Requirements',
  '02': 'Existing Conditions',
  '03': 'Concrete',
  '04': 'Masonry',
  '05': 'Metals',
  '06': 'Wood, Plastics & Composites',
  '07': 'Thermal & Moisture Protection',
  '08': 'Openings',
  '09': 'Finishes',
  '10': 'Specialties',
  '11': 'Equipment',
  '12': 'Furnishings',
  '13': 'Special Construction',
  '14': 'Conveying Equipment',
  '21': 'Fire Suppression',
  '22': 'Plumbing',
  '23': 'HVAC',
  '26': 'Electrical',
  '27': 'Communications',
  '28': 'Electronic Safety & Security',
  '31': 'Earthwork',
  '32': 'Exterior Improvements',
  '33': 'Utilities',
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { supabase, tenantId } = auth
  const { projectId } = await params

  const body = await req.json()
  const { takeoffId, fileUrl, buildingType } = body

  console.log('[analyze] start', { tenantId, projectId, takeoffId, hasFileUrl: !!fileUrl })

  if (!takeoffId || !fileUrl) {
    return NextResponse.json(
      { error: 'takeoffId and fileUrl required' },
      { status: 400 },
    )
  }

  await supabase
    .from('takeoffs')
    .update({
      status: 'processing',
      orchestration_status: 'started',
      orchestration_started_at: new Date().toISOString(),
      processing_started_at: new Date().toISOString(),
      progress_pct: 0,
    })
    .eq('id', takeoffId)
    .eq('tenant_id', tenantId)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          )
        } catch {
          /* stream may be closed */
        }
      }

      try {
        send('stage', {
          stage: 'fetching',
          message: 'Fetching blueprint file...',
          pct: 5,
        })

        let fileBase64 = ''
        let mediaType: 'application/pdf' | ClaudeImageMediaType = 'application/pdf'

        try {
          const fileRes = await fetch(fileUrl)
          console.log('[analyze] File fetch status:', fileRes.status, 'URL:', fileUrl.slice(0, 120))
          if (!fileRes.ok) {
            console.error('[analyze] File fetch failed:', fileRes.status, fileUrl)
            const hint =
              fileRes.status === 400 || fileRes.status === 401 || fileRes.status === 403
                ? ' The Supabase storage bucket "blueprints" may not be public. Set public=true on the bucket.'
                : ''
            throw new Error(`HTTP ${fileRes.status} from storage.${hint}`)
          }
          const arrayBuf = await fileRes.arrayBuffer()
          // Detect the real type from the bytes — never trust the HTTP
          // content-type header (Supabase often serves octet-stream).
          const buf = Buffer.from(arrayBuf)
          const detected = detectImageType(buf)
          if (detected === 'application/pdf') {
            mediaType = 'application/pdf'
            fileBase64 = buf.toString('base64')
          } else {
            const prepared = await prepareImageForClaude(buf)
            mediaType = prepared.mediaType
            fileBase64 = prepared.base64
          }
          console.log('[analyze] file fetched', { bytes: arrayBuf.byteLength, mediaType })
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof ImagePrepError) {
            send('error', { message: fetchErr.message })
            await supabase
              .from('takeoffs')
              .update({ status: 'failed', processing_error: fetchErr.message })
              .eq('id', takeoffId)
              .eq('tenant_id', tenantId)
            controller.close()
            return
          }
          const msg = fetchErr instanceof Error ? fetchErr.message : 'fetch failed'
          console.error('[analyze] File fetch error:', msg, fileUrl)
          send('error', { message: `Cannot access blueprint file. ${msg}` })
          await supabase
            .from('takeoffs')
            .update({ status: 'failed', processing_error: msg })
            .eq('id', takeoffId)
            .eq('tenant_id', tenantId)
          controller.close()
          return
        }

        await supabase
          .from('takeoffs')
          .update({ progress_pct: 10 })
          .eq('id', takeoffId)
          .eq('tenant_id', tenantId)
        send('stage', {
          stage: 'reading',
          message: 'Reading drawing sheets and annotations...',
          pct: 15,
        })

        const client = new Anthropic()

        const systemPrompt = `You are a professional construction estimator with 20+ years of experience.
You are analyzing construction drawings/blueprints to produce a detailed material and cost takeoff.
You must respond with ONLY valid JSON. No markdown, no explanation, no preamble.

The JSON must follow this exact schema:
{
  "project_info": {
    "building_type": string,
    "estimated_sqft": number,
    "floors": number,
    "construction_type": string,
    "scope_summary": string
  },
  "line_items": [
    {
      "csi_division": string (e.g. "03"),
      "csi_code": string (e.g. "03 30 00"),
      "description": string,
      "quantity": number,
      "unit": string (CY/SF/LF/EA/LS/TON/etc),
      "unit_material_cost": number,
      "unit_labor_cost": number,
      "unit_equipment_cost": number,
      "waste_factor_pct": number (0-25),
      "page_reference": string,
      "ai_confidence": number (0.0-1.0),
      "scope_notes": string
    }
  ],
  "scope_gaps": [
    {
      "csi_division": string,
      "gap_description": string,
      "severity": "critical"|"warning"|"info",
      "suggested_action": string
    }
  ],
  "overall_confidence": number (0.0-1.0),
  "extraction_notes": string
}`

        const userPrompt = `Analyze this construction blueprint/drawing set.
Building type: ${buildingType || 'Commercial'}

Extract EVERY identifiable quantity and cost item from the drawings.
Organize by CSI MasterFormat division.
Be thorough — extract concrete, steel, masonry, wood framing, insulation,
openings (doors/windows), finishes, MEP rough-ins, site work, everything visible.

For confidence scores:
- 0.9-1.0: Clearly dimensioned/quantified in drawings
- 0.7-0.89: Reasonable estimate from drawing scale
- 0.5-0.69: Inferred from building type/size
- Below 0.5: Assumed — verify manually

For scope gaps: Identify CSI scopes typically required for this building type
that are NOT visible in these drawings. Flag them as critical/warning/info.

Use current Phoenix, Arizona construction market pricing.
Return ONLY the JSON object.`

        send('stage', {
          stage: 'analyzing',
          message: 'Sage AI is reading every dimension and annotation...',
          pct: 25,
        })

        let rawJson = ''
        let lineItemsStreamed = 0

        const sourceBlock =
          mediaType === 'application/pdf'
            ? {
                type: 'document' as const,
                source: {
                  type: 'base64' as const,
                  media_type: 'application/pdf' as const,
                  data: fileBase64,
                },
              }
            : {
                type: 'image' as const,
                source: {
                  type: 'base64' as const,
                  media_type: mediaType as ClaudeImageMediaType,
                  data: fileBase64,
                },
              }

        const claudeStream = client.messages.stream({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8000,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: [sourceBlock, { type: 'text', text: userPrompt }],
            },
          ],
        })

        for await (const chunk of claudeStream) {
          if (
            chunk.type === 'content_block_delta' &&
            chunk.delta.type === 'text_delta'
          ) {
            rawJson += chunk.delta.text
            const lineItemMatches =
              rawJson.match(/"description":\s*"[^"]+"/g) || []
            if (lineItemMatches.length > lineItemsStreamed) {
              lineItemsStreamed = lineItemMatches.length
              const pct = Math.min(80, 25 + lineItemsStreamed * 2)
              send('progress', {
                message: `Found ${lineItemsStreamed} line items so far...`,
                pct,
                itemCount: lineItemsStreamed,
              })
              await supabase
                .from('takeoffs')
                .update({ progress_pct: pct })
                .eq('id', takeoffId)
                .eq('tenant_id', tenantId)
            }
          }
        }

        send('stage', {
          stage: 'parsing',
          message: 'Processing and organizing by CSI division...',
          pct: 82,
        })

        interface ParsedItem {
          csi_division?: string
          csi_code?: string
          description?: string
          quantity?: number
          unit?: string
          unit_material_cost?: number
          unit_labor_cost?: number
          unit_equipment_cost?: number
          waste_factor_pct?: number
          page_reference?: string
          ai_confidence?: number
          scope_notes?: string
        }
        interface ParsedGap {
          csi_division?: string
          gap_description?: string
          severity?: 'critical' | 'warning' | 'info'
          suggested_action?: string
        }
        interface ParsedResponse {
          project_info?: {
            building_type?: string
            estimated_sqft?: number
            floors?: number
            construction_type?: string
            scope_summary?: string
          }
          line_items?: ParsedItem[]
          scope_gaps?: ParsedGap[]
          overall_confidence?: number
          extraction_notes?: string
        }

        console.log('[analyze] Claude response length:', rawJson.length)

        let parsed: ParsedResponse
        try {
          const cleaned = rawJson.replace(/```json\n?|\n?```/g, '').trim()
          parsed = JSON.parse(cleaned) as ParsedResponse
        } catch (parseErr: unknown) {
          const msg = parseErr instanceof Error ? parseErr.message : 'unknown'
          console.error('[analyze] JSON parse failed:', msg, 'preview:', rawJson.slice(0, 500))
          send('error', {
            message: 'AI response could not be parsed. Try again.',
          })
          await supabase
            .from('takeoffs')
            .update({
              status: 'failed',
              processing_error: `JSON parse failed: ${msg}`,
            })
            .eq('id', takeoffId)
            .eq('tenant_id', tenantId)
          controller.close()
          return
        }

        const lineItems: ParsedItem[] = parsed.line_items || []
        const scopeGaps: ParsedGap[] = parsed.scope_gaps || []
        const projectInfo = parsed.project_info || {}

        console.log('[analyze] parsed', {
          itemCount: lineItems.length,
          gapCount: scopeGaps.length,
          confidence: parsed.overall_confidence,
        })

        send('stage', {
          stage: 'saving',
          message: `Saving ${lineItems.length} line items to database...`,
          pct: 85,
        })

        const { error: deleteErr } = await supabase
          .from('takeoff_line_items')
          .delete()
          .eq('takeoff_id', takeoffId)
          .eq('tenant_id', tenantId)
        if (deleteErr) console.error('[analyze] DELETE existing items failed:', deleteErr)

        let insertedCount = 0
        const batchSize = 20
        for (let i = 0; i < lineItems.length; i += batchSize) {
          const batchItems = lineItems.slice(i, i + batchSize).map((item, idx) => {
            const qty = Number(item.quantity) || 0
            const wastePct = Number(item.waste_factor_pct) || 5
            const mat = Number(item.unit_material_cost) || 0
            const lab = Number(item.unit_labor_cost) || 0
            const eq = Number(item.unit_equipment_cost) || 0
            const divCode = (item.csi_division || '01').slice(0, 2)
            // adjusted_quantity and total_{material,labor,equipment,sub} are
            // GENERATED columns in Postgres — do not include them in the insert
            // payload or Postgres rejects the row with 428C9.
            return {
              takeoff_id: takeoffId,
              tenant_id: tenantId,
              project_id: projectId,
              csi_division: item.csi_division || '01',
              csi_code: item.csi_code || '',
              csi_description: CSI_DIVISIONS[divCode] || '',
              description: item.description || '',
              scope_notes: item.scope_notes || '',
              page_reference: item.page_reference || '',
              quantity: qty,
              unit: item.unit || 'LS',
              waste_factor_pct: wastePct,
              unit_material_cost: mat,
              unit_labor_cost: lab,
              unit_equipment_cost: eq,
              unit_sub_cost: 0,
              ai_extracted: true,
              ai_confidence: Number(item.ai_confidence) || 0.75,
              ai_source_text: item.page_reference || '',
              manually_edited: false,
              sort_order: i + idx,
            }
          })
          if (batchItems.length > 0) {
            const { data: insertedData, error: insertErr } = await supabase
              .from('takeoff_line_items')
              .insert(batchItems)
              .select('id')
            if (insertErr) {
              console.error('[ANALYZE] BATCH INSERT FAILED:', {
                code: insertErr.code,
                message: insertErr.message,
                details: insertErr.details,
                hint: insertErr.hint,
                sampleItem: JSON.stringify(batchItems[0]).slice(0, 500),
              })
              send('error', {
                message: `Failed to save ${batchItems.length} line items: ${insertErr.message}`,
                hint: insertErr.hint,
                code: insertErr.code,
              })
              await supabase
                .from('takeoffs')
                .update({
                  status: 'failed',
                  processing_error: `Line items INSERT failed: ${insertErr.message}`,
                })
                .eq('id', takeoffId)
                .eq('tenant_id', tenantId)
              controller.close()
              return
            }
            insertedCount += insertedData?.length || batchItems.length
            console.log('[ANALYZE] Saved batch:', insertedData?.length, 'items')
          }
        }
        console.log('[analyze] line_items inserted:', insertedCount, '/', lineItems.length)

        const { count: savedCount } = await supabase
          .from('takeoff_line_items')
          .select('*', { count: 'exact', head: true })
          .eq('takeoff_id', takeoffId)
          .eq('tenant_id', tenantId)
        console.log(
          '[ANALYZE] Verification: DB has',
          savedCount,
          '/',
          lineItems.length,
          'items',
        )
        if ((savedCount || 0) === 0 && lineItems.length > 0) {
          send('error', {
            message: `Parsed ${lineItems.length} items but 0 saved to DB. Schema or permissions issue.`,
          })
          await supabase
            .from('takeoffs')
            .update({
              status: 'failed',
              processing_error: 'Line items parsed but none saved to DB',
            })
            .eq('id', takeoffId)
            .eq('tenant_id', tenantId)
          controller.close()
          return
        }

        if (scopeGaps.length > 0) {
          await supabase
            .from('takeoff_scope_gaps')
            .delete()
            .eq('takeoff_id', takeoffId)
            .eq('tenant_id', tenantId)
          const { error: gapsErr } = await supabase.from('takeoff_scope_gaps').insert(
            scopeGaps.map((gap) => ({
              tenant_id: tenantId,
              takeoff_id: takeoffId,
              csi_division: gap.csi_division || '01',
              gap_description: gap.gap_description || '',
              severity: gap.severity || 'warning',
              suggested_action: gap.suggested_action || '',
            })),
          )
          if (gapsErr) console.error('[analyze] INSERT scope_gaps failed:', gapsErr)
        }

        send('stage', {
          stage: 'calculating',
          message: 'Computing totals, markup, and cost per SF...',
          pct: 90,
        })

        const totalMaterial = lineItems.reduce(
          (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_material_cost) || 0),
          0,
        )
        const totalLabor = lineItems.reduce(
          (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_labor_cost) || 0),
          0,
        )
        const totalEquipment = lineItems.reduce(
          (s, i) =>
            s + (Number(i.quantity) || 0) * (Number(i.unit_equipment_cost) || 0),
          0,
        )
        const subtotal = totalMaterial + totalLabor + totalEquipment
        const overhead = subtotal * 0.12
        const profit = subtotal * 0.08
        const grandTotal = subtotal + overhead + profit
        const sqft = Number(projectInfo.estimated_sqft) || 1
        const costPerSqft = grandTotal / sqft

        const csiBreakdown: Record<string, number> = {}
        for (const item of lineItems) {
          const div = (item.csi_division || '01').slice(0, 2)
          const matCost = Number(item.unit_material_cost) || 0
          const labCost = Number(item.unit_labor_cost) || 0
          const eqCost = Number(item.unit_equipment_cost) || 0
          csiBreakdown[div] =
            (csiBreakdown[div] || 0) +
            (Number(item.quantity) || 0) * (matCost + labCost + eqCost)
        }

        const { error: updateErr } = await supabase
          .from('takeoffs')
          .update({
            status: 'complete',
            orchestration_status: 'complete',
            orchestration_completed_at: new Date().toISOString(),
            processing_completed_at: new Date().toISOString(),
            progress_pct: 100,
            building_type: projectInfo.building_type || buildingType,
            building_area: sqft,
            floor_count: projectInfo.floors || 1,
            summary: projectInfo.scope_summary,
            total_material: totalMaterial,
            total_labor: totalLabor,
            total_equipment: totalEquipment,
            subtotal,
            total_overhead: overhead,
            total_profit: profit,
            grand_total: grandTotal,
            cost_per_sqft: costPerSqft,
            extraction_confidence: parsed.overall_confidence || 0.8,
            extraction_notes: parsed.extraction_notes || '',
            csi_breakdown: csiBreakdown,
            orchestration_results: {
              line_item_count: lineItems.length,
              scope_gap_count: scopeGaps.length,
              csi_divisions_found: Object.keys(csiBreakdown),
            },
            ai_model_used: 'claude-sonnet-4-20250514',
            analyzed_at: new Date().toISOString(),
          })
          .eq('id', takeoffId)
          .eq('tenant_id', tenantId)
        if (updateErr) console.error('[analyze] Takeoff update failed:', updateErr)

        send('stage', {
          stage: 'benchmarking',
          message: 'Updating your cost benchmarks...',
          pct: 95,
        })

        for (const item of lineItems) {
          const mat = Number(item.unit_material_cost) || 0
          if (mat <= 0) continue
          const lab = Number(item.unit_labor_cost) || 0
          const unitCost = mat + lab
          const csiCode = item.csi_code || ''
          const unit = item.unit || 'LS'

          const existing = await supabase
            .from('takeoff_benchmarks')
            .select('id, avg_unit_cost, min_unit_cost, max_unit_cost, sample_count')
            .eq('tenant_id', tenantId)
            .eq('csi_code', csiCode)
            .eq('unit', unit)
            .maybeSingle()

          if (existing.data) {
            const count = Number(existing.data.sample_count) + 1
            const prevAvg = Number(existing.data.avg_unit_cost) || 0
            const prevCount = Number(existing.data.sample_count) || 0
            const newAvg = (prevAvg * prevCount + unitCost) / count
            await supabase
              .from('takeoff_benchmarks')
              .update({
                avg_unit_cost: newAvg,
                min_unit_cost: Math.min(
                  Number(existing.data.min_unit_cost) || unitCost,
                  unitCost,
                ),
                max_unit_cost: Math.max(
                  Number(existing.data.max_unit_cost) || unitCost,
                  unitCost,
                ),
                sample_count: count,
                last_updated: new Date().toISOString(),
              })
              .eq('id', existing.data.id)
          } else {
            await supabase.from('takeoff_benchmarks').insert({
              tenant_id: tenantId,
              building_type: projectInfo.building_type || null,
              csi_division: item.csi_division || '01',
              csi_code: csiCode,
              description: item.description || '',
              unit,
              avg_unit_cost: unitCost,
              min_unit_cost: unitCost,
              max_unit_cost: unitCost,
              sample_count: 1,
            })
          }
        }

        send('complete', {
          message: 'Analysis complete!',
          pct: 100,
          takeoffId,
          summary: {
            lineItems: lineItems.length,
            scopeGaps: scopeGaps.length,
            grandTotal,
            costPerSqft,
            confidence: parsed.overall_confidence || 0.8,
            divisionsFound: Object.keys(csiBreakdown).length,
          },
        })

        // Fire-and-forget: auto-populate CRM modules (SOV, budget, milestones, intelligence)
        const proto = req.headers.get('x-forwarded-proto') || 'https'
        const host = req.headers.get('host') || 'saguarocontrol.net'
        fetch(`${proto}://${host}/api/sage/auto-populate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: req.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            takeoffId,
            projectId,
            trigger: 'takeoff_complete',
          }),
        }).catch((e) =>
          console.error(
            '[ANALYZE] auto-populate error:',
            e instanceof Error ? e.message : String(e),
          ),
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Analysis failed'
        console.error('Takeoff analysis error:', err)
        await supabase
          .from('takeoffs')
          .update({
            status: 'failed',
            processing_error: msg,
            orchestration_status: 'failed',
          })
          .eq('id', takeoffId)
          .eq('tenant_id', tenantId)
        send('error', { message: msg })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
