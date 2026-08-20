import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-helper'
import crypto from 'crypto'

const QBO_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID
const QBO_REDIRECT_URI = `${process.env.NEXT_PUBLIC_APP_URL || 'https://saguarocontrol.net'}/api/integrations/quickbooks/callback`
const QBO_SCOPE = 'com.intuit.quickbooks.accounting'
const QBO_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  if (!QBO_CLIENT_ID) {
    return NextResponse.json({
      error: 'QuickBooks not configured. Add QUICKBOOKS_CLIENT_ID to Vercel environment variables.',
      setup_required: true,
    }, { status: 503 })
  }

  const state = crypto.randomBytes(32).toString('hex')

  const params = new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    scope: QBO_SCOPE,
    redirect_uri: QBO_REDIRECT_URI,
    response_type: 'code',
    state,
  })

  const response = NextResponse.redirect(`${QBO_AUTH_URL}?${params}`)
  response.cookies.set('qbo_state', state, { httpOnly: true, secure: true, maxAge: 600 })
  return response
}
