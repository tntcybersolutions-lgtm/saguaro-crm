import { NextRequest, NextResponse } from 'next/server';
import { DocumentGenerator } from '../../../../document-generator';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== process.env.SAGUARO_API_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await DocumentGenerator.seedDocumentTemplates();
  return NextResponse.json({ success: true, message: 'Document templates seeded.' });
}
