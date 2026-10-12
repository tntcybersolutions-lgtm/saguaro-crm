/**
 * The palette every generated document uses — the PDFs
 * (lib/document-templates/report-theme.ts → every generator) and the HTML
 * print / export documents (lib/print-doc.ts). One source, so a change here
 * re-colours both.
 *
 * Documents are read on white paper: navy ink, slate labels and rules, a
 * print-safe cyan-blue accent that matches the app's page titles, and the app
 * navy only as the thin letterhead band. Never the app's dark page. Status
 * colours are the darker print versions of the app's green / amber / red.
 */
export const DOC_HEX = {
  paper: '#FFFFFF',
  ink: '#0F172A',         // headings, figures, the letterhead band
  text: '#1E293B',        // body text
  muted: '#475569',       // labels
  faint: '#64748B',       // captions, footers
  rule: '#CBD5E1',        // lines, cell borders
  zebra: '#F1F5F9',       // zebra rows, KPI cells, table headers
  accent: '#0284C7',      // titles, rules, KPI bars — the app's cyan-blue, deepened for paper
  accentOnBand: '#38BDF8',// the app's title cyan, on the navy band
  highlight: '#E0F2FE',   // a highlighted total row
  success: '#15803D',
  successFill: '#DCFCE7',
  warning: '#B45309',
  warningFill: '#FEF3C7',
  danger: '#B91C1C',
  dangerFill: '#FEE2E2',
} as const;

export type DocRole = keyof typeof DOC_HEX;
