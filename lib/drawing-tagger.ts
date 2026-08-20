// lib/drawing-tagger.ts
// Auto-detects drawing discipline and sheet type from filename/title
// No AI needed — pattern matching covers 95% of cases

export type DrawingDiscipline =
  | 'architectural'
  | 'structural'
  | 'electrical'
  | 'mechanical'
  | 'plumbing'
  | 'civil'
  | 'fire_protection'
  | 'landscape'
  | 'survey'
  | 'general'

export type SheetType =
  | 'plan'
  | 'elevation'
  | 'section'
  | 'detail'
  | 'schedule'
  | 'diagram'
  | 'specification'
  | 'cover'
  | 'general'

interface TaggerResult {
  discipline: DrawingDiscipline
  sheetType: SheetType
  confidence: number // 0-1
  suggestedNumber: string | null
  suggestedTitle: string | null
}

// Sheet number prefixes → discipline
const SHEET_PREFIX_MAP: Record<string, DrawingDiscipline> = {
  'A':    'architectural',
  'AR':   'architectural',
  'S':    'structural',
  'ST':   'structural',
  'E':    'electrical',
  'EL':   'electrical',
  'M':    'mechanical',
  'ME':   'mechanical',
  'HVAC': 'mechanical',
  'P':    'plumbing',
  'PL':   'plumbing',
  'FP':   'fire_protection',
  'FS':   'fire_protection',
  'C':    'civil',
  'CV':   'civil',
  'G':    'general',
  'GN':   'general',
  'T':    'survey',
  'LS':   'landscape',
  'L':    'landscape',
}

// Keywords in title → sheet type
const SHEET_TYPE_KEYWORDS: Record<SheetType, string[]> = {
  plan:          ['plan', 'floor', 'layout', 'roof', 'site', 'foundation'],
  elevation:     ['elevation', 'facade', 'exterior'],
  section:       ['section', 'cross section', 'building section'],
  detail:        ['detail', 'typical', 'connection', 'flashing'],
  schedule:      ['schedule', 'door schedule', 'window schedule', 'room finish'],
  diagram:       ['diagram', 'riser', 'one-line', 'schematic', 'flow'],
  specification: ['specification', 'spec', 'notes', 'requirements'],
  cover:         ['cover', 'title', 'index', 'table of contents'],
  general:       [],
}

export function tagDrawingSheet(
  filename: string,
  title?: string
): TaggerResult {
  const upper = (filename + ' ' + (title || '')).toUpperCase()
  const clean = filename.replace(/\.[^.]+$/, '').trim()

  // Try to extract sheet number from filename
  // Common patterns: A-101, A101, S-001, 01-A-101, SHEET A-101
  const sheetMatch = clean.match(
    /\b([A-Z]{1,4})-?(\d{3,4})\b/
  )
  const suggestedNumber = sheetMatch
    ? `${sheetMatch[1]}-${sheetMatch[2]}`
    : null

  // Determine discipline from sheet number prefix
  let discipline: DrawingDiscipline = 'general'
  let confidence = 0.5

  if (sheetMatch) {
    const prefix = sheetMatch[1]
    if (SHEET_PREFIX_MAP[prefix]) {
      discipline = SHEET_PREFIX_MAP[prefix]
      confidence = 0.95
    }
  }

  // Fallback: keyword search in title/filename
  if (discipline === 'general') {
    const keywordDisciplines: Array<[string[], DrawingDiscipline]> = [
      [['ELECTRICAL', 'POWER', 'LIGHTING', 'PANEL'], 'electrical'],
      [['STRUCTURAL', 'FRAMING', 'FOUNDATION', 'FOOTING'], 'structural'],
      [['MECHANICAL', 'HVAC', 'DUCTWORK', 'AIR'], 'mechanical'],
      [['PLUMBING', 'SANITARY', 'DOMESTIC WATER'], 'plumbing'],
      [['CIVIL', 'GRADING', 'DRAINAGE', 'UTILITY'], 'civil'],
      [['FIRE', 'SPRINKLER', 'SUPPRESSION'], 'fire_protection'],
      [['LANDSCAPE', 'IRRIGATION', 'PLANTING'], 'landscape'],
      [['FLOOR PLAN', 'ELEVATION', 'SECTION', 'REFLECTED'], 'architectural'],
    ]
    for (const [keywords, disc] of keywordDisciplines) {
      if (keywords.some(kw => upper.includes(kw))) {
        discipline = disc
        confidence = 0.7
        break
      }
    }
  }

  // Determine sheet type
  let sheetType: SheetType = 'general'
  const lowerCombined = upper.toLowerCase()
  for (const [type, keywords] of Object.entries(SHEET_TYPE_KEYWORDS)) {
    if (keywords.some(kw => lowerCombined.includes(kw))) {
      sheetType = type as SheetType
      break
    }
  }

  // Clean up title: remove extension, normalize spaces
  const suggestedTitle = title
    ? title
    : clean
        .replace(/-|_/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

  return {
    discipline,
    sheetType,
    confidence,
    suggestedNumber,
    suggestedTitle,
  }
}

// Batch tag multiple sheets
export function tagDrawingSheets(sheets: Array<{
  filename: string
  title?: string
}>): TaggerResult[] {
  return sheets.map(s => tagDrawingSheet(s.filename, s.title))
}
