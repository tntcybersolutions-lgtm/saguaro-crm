// lib/lien-law/states.ts
// 50-STATE LIEN LAW CONFIGURATION
// All deadlines, notice requirements, statutory citations, and form requirements
// Sources: state statutes, construction law references (verify with attorney for final use)

export interface StateLienLaw {
  state: string
  stateName: string
  // Preliminary / Pre-lien Notice
  preliminaryNoticeRequired: boolean
  preliminaryNoticeDays: number | null    // days from first furnishing; null = not required
  preliminaryNoticeRecipients: string[]   // who must receive notice
  preliminaryNoticeStatute: string
  preliminaryNoteMethod: 'certified_mail' | 'personal_service' | 'either' | 'none'
  // Notice to Owner (some states use this term)
  noticeToOwnerRequired: boolean
  noticeToOwnerDays: number | null
  // Monthly notice (TX-specific pattern)
  monthlyNoticeRequired: boolean
  monthlyNoticeDeadline: string | null    // e.g. '15th of month following'
  // Mechanic's Lien Filing
  lienFilingDays: number                  // days from substantial completion or last work
  lienFilingTrigger: 'substantial_completion' | 'last_work' | 'project_completion' | 'breach'
  lienStatute: string
  // Foreclosure
  foreclosureDays: number                 // days from filing to foreclose
  // Stop Notice (public projects / CA-style)
  stopNoticeAvailable: boolean
  stopNoticeDays: number | null
  // Bond Claim
  bondClaimDays: number | null
  // Notarization
  notarizationRequired: boolean
  // Statutory Form Required (CA mandates exact language by statute)
  statutoryFormRequired: boolean
  statutoryFormCitation: string | null
  // Lien Agent (NC requires designating a lien agent on projects > $30k)
  lienAgentRequired: boolean
  lienAgentThreshold: number | null        // project value threshold in USD
  // Waiver types available
  waiverTypes: string[]
  // State-specific notes
  notes: string
}

export const STATE_LIEN_LAWS: Record<string, StateLienLaw> = {
  AL: { state: 'AL', stateName: 'Alabama', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Ala. Code § 35-11-210 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 6 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Ala. Code § 35-11-213', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 6 * 30, notarizationRequired: true, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Verified/notarized claim required. Subcontractors must notify owner/GC.' },
  AK: { state: 'AK', stateName: 'Alaska', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Alaska Stat. § 34.35.050 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'substantial_completion', lienStatute: 'Alaska Stat. § 34.35.068', foreclosureDays: 180, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Preliminary notice required only on projects with original contract > $25,000 involving residential owner-occupied.' },
  AZ: { state: 'AZ', stateName: 'Arizona', preliminaryNoticeRequired: true, preliminaryNoticeDays: 20, preliminaryNoticeRecipients: ['owner','GC','lender'], preliminaryNoticeStatute: 'A.R.S. § 33-992.01', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'substantial_completion', lienStatute: 'A.R.S. § 33-993', foreclosureDays: 180, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Serve preliminary notice within 20 days of first furnishing. GC is exempt from preliminary notice.' },
  AR: { state: 'AR', stateName: 'Arkansas', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Ark. Code Ann. § 18-44-101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'last_work', lienStatute: 'Ark. Code Ann. § 18-44-117', foreclosureDays: 15 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '120 days to file lien from last work.' },
  CA: { state: 'CA', stateName: 'California', preliminaryNoticeRequired: true, preliminaryNoticeDays: 20, preliminaryNoticeRecipients: ['owner','GC','lender'], preliminaryNoticeStatute: 'Cal. Civ. Code § 8200-8216', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'substantial_completion', lienStatute: 'Cal. Civ. Code § 8412', foreclosureDays: 90, stopNoticeAvailable: true, stopNoticeDays: 90, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: true, statutoryFormCitation: 'Cal. Civ. Code § 8132-8138', lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'CRITICAL: California mandates exact statutory language for all 4 waiver types (§ 8132-8138). Any deviation renders waiver unenforceable. Preliminary 20-day notice to owner, GC, and construction lender.' },
  CO: { state: 'CO', stateName: 'Colorado', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'C.R.S. § 38-22-101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 4 * 30, lienFilingTrigger: 'last_work', lienStatute: 'C.R.S. § 38-22-109', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'No preliminary notice required. 4 months from last work to file.' },
  CT: { state: 'CT', stateName: 'Connecticut', preliminaryNoticeRequired: true, preliminaryNoticeDays: 90, preliminaryNoticeRecipients: ['owner'], preliminaryNoticeStatute: 'Conn. Gen. Stat. § 49-32a', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Conn. Gen. Stat. § 49-34', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 180, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Sub must serve notice on owner within 90 days of last furnishing to preserve lien rights.' },
  DE: { state: 'DE', stateName: 'Delaware', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Del. Code Ann. tit. 25, § 2701 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 180, lienFilingTrigger: 'last_work', lienStatute: 'Del. Code Ann. tit. 25, § 2712', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 180, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '180 days from last work to file lien.' },
  FL: { state: 'FL', stateName: 'Florida', preliminaryNoticeRequired: true, preliminaryNoticeDays: 45, preliminaryNoticeRecipients: ['owner','lender'], preliminaryNoticeStatute: 'Fla. Stat. § 713.06(2)', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: true, noticeToOwnerDays: 45, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Fla. Stat. § 713.08', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Notice to Owner required within 45 days of first furnishing. Failure to serve NTO loses lien rights entirely. 90 days from last work to file.' },
  GA: { state: 'GA', stateName: 'Georgia', preliminaryNoticeRequired: true, preliminaryNoticeDays: 30, preliminaryNoticeRecipients: ['owner','GC'], preliminaryNoticeStatute: 'O.C.G.A. § 44-14-361.5', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'O.C.G.A. § 44-14-361', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Notice required within 30 days of first furnishing on commercial projects. 90 days from last work.' },
  HI: { state: 'HI', stateName: 'Hawaii', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Haw. Rev. Stat. § 507-41 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 45, lienFilingTrigger: 'last_work', lienStatute: 'Haw. Rev. Stat. § 507-43', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 45, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '45 days from last work to file — one of the shortest deadlines in the country.' },
  ID: { state: 'ID', stateName: 'Idaho', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Idaho Code § 45-501 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Idaho Code § 45-507', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
  IL: { state: 'IL', stateName: 'Illinois', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: '770 ILCS 60/', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 4 * 30, lienFilingTrigger: 'last_work', lienStatute: '770 ILCS 60/7', foreclosureDays: 2 * 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 4 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '4 months from last work to file. No preliminary notice required.' },
  IN: { state: 'IN', stateName: 'Indiana', preliminaryNoticeRequired: true, preliminaryNoticeDays: 30, preliminaryNoticeRecipients: ['owner'], preliminaryNoticeStatute: 'Ind. Code § 32-28-3-1 et seq.', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 60, lienFilingTrigger: 'last_work', lienStatute: 'Ind. Code § 32-28-3-3', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 60, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Subcontractors must serve notice on owner within 30 days of first furnishing. 60 days from last work to file.' },
  IA: { state: 'IA', stateName: 'Iowa', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Iowa Code § 572.1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Iowa Code § 572.8', foreclosureDays: 2 * 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
  KS: { state: 'KS', stateName: 'Kansas', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Kan. Stat. Ann. § 60-1101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 4 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Kan. Stat. Ann. § 60-1103', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 4 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '4 months from last work.' },
  KY: { state: 'KY', stateName: 'Kentucky', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Ky. Rev. Stat. Ann. § 376.010 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 6 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Ky. Rev. Stat. Ann. § 376.080', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 6 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '6 months from last work.' },
  LA: { state: 'LA', stateName: 'Louisiana', preliminaryNoticeRequired: true, preliminaryNoticeDays: 10, preliminaryNoticeRecipients: ['owner','GC'], preliminaryNoticeStatute: 'La. R.S. § 9:4801 et seq.', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 60, lienFilingTrigger: 'last_work', lienStatute: 'La. R.S. § 9:4822', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 60, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Notice required within 10 days of beginning work. 60 days from last work to file statement of claim.' },
  ME: { state: 'ME', stateName: 'Maine', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Me. Rev. Stat. tit. 10, § 3251 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Me. Rev. Stat. tit. 10, § 3253', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
  MD: { state: 'MD', stateName: 'Maryland', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Md. Code Ann., Real Prop. § 9-101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 180, lienFilingTrigger: 'last_work', lienStatute: 'Md. Code Ann., Real Prop. § 9-105', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 180, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '180 days from last work to file.' },
  MA: { state: 'MA', stateName: 'Massachusetts', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Mass. Gen. Laws ch. 254', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Mass. Gen. Laws ch. 254, § 2', foreclosureDays: 90, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Subcontractors must give notice to owner (not just GC). 90 days from last work.' },
  MI: { state: 'MI', stateName: 'Michigan', preliminaryNoticeRequired: true, preliminaryNoticeDays: 20, preliminaryNoticeRecipients: ['owner','lender'], preliminaryNoticeStatute: 'MCL § 570.1109', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'MCL § 570.1111', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Notice of furnishing required within 20 days of first work. 90 days from last work to file.' },
  MN: { state: 'MN', stateName: 'Minnesota', preliminaryNoticeRequired: true, preliminaryNoticeDays: 45, preliminaryNoticeRecipients: ['owner','GC'], preliminaryNoticeStatute: 'Minn. Stat. § 514.011', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'last_work', lienStatute: 'Minn. Stat. § 514.08', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 120, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Subcontractors must serve pre-lien notice within 45 days of first furnishing. 120 days from last work to file.' },
  MS: { state: 'MS', stateName: 'Mississippi', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Miss. Code Ann. § 85-7-401 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 6 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Miss. Code Ann. § 85-7-405', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 6 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '6 months from last work to file.' },
  MO: { state: 'MO', stateName: 'Missouri', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Mo. Rev. Stat. § 429.010 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 6 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Mo. Rev. Stat. § 429.080', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 6 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Subcontractors must give 10-day notice to owner before filing lien.' },
  MT: { state: 'MT', stateName: 'Montana', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Mont. Code Ann. § 71-3-521 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Mont. Code Ann. § 71-3-535', foreclosureDays: 2 * 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
  NE: { state: 'NE', stateName: 'Nebraska', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Neb. Rev. Stat. § 52-101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'last_work', lienStatute: 'Neb. Rev. Stat. § 52-108', foreclosureDays: 2 * 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 120, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '120 days from last work.' },
  NV: { state: 'NV', stateName: 'Nevada', preliminaryNoticeRequired: true, preliminaryNoticeDays: 31, preliminaryNoticeRecipients: ['owner','GC','lender'], preliminaryNoticeStatute: 'Nev. Rev. Stat. § 108.245', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Nev. Rev. Stat. § 108.226', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Preliminary notice within 31 days of first furnishing. 90 days from last work to file.' },
  NH: { state: 'NH', stateName: 'New Hampshire', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'N.H. Rev. Stat. Ann. § 447:1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'last_work', lienStatute: 'N.H. Rev. Stat. Ann. § 447:9', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 120, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '120 days from last work.' },
  NJ: { state: 'NJ', stateName: 'New Jersey', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'N.J. Stat. Ann. § 2A:44A-1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'N.J. Stat. Ann. § 2A:44A-6', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work. Sworn statement required.' },
  NM: { state: 'NM', stateName: 'New Mexico', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'N.M. Stat. Ann. § 48-2-1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'N.M. Stat. Ann. § 48-2-7', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work. Notice required in some circumstances.' },
  NY: { state: 'NY', stateName: 'New York', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'N.Y. Lien Law § 1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 8 * 30, lienFilingTrigger: 'substantial_completion', lienStatute: 'N.Y. Lien Law § 10', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 8 * 30, notarizationRequired: true, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '8 months from completion to file. Verification/notarization required. Contractors have 4 months; subs have 8 months.' },
  NC: { state: 'NC', stateName: 'North Carolina', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'N.C. Gen. Stat. § 44A-7 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'last_work', lienStatute: 'N.C. Gen. Stat. § 44A-12', foreclosureDays: 180, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 120, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: true, lienAgentThreshold: 30000, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'LIEN AGENT REQUIRED on projects > $30,000 (N.C. Gen. Stat. § 44A-11.1). Subcontractors must give notice to lien agent within 15 days of first furnishing. 120 days from last work to file.' },
  ND: { state: 'ND', stateName: 'North Dakota', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'N.D. Cent. Code § 35-27-01 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'N.D. Cent. Code § 35-27-03', foreclosureDays: 3 * 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
  OH: { state: 'OH', stateName: 'Ohio', preliminaryNoticeRequired: true, preliminaryNoticeDays: 21, preliminaryNoticeRecipients: ['owner','GC','lender'], preliminaryNoticeStatute: 'Ohio Rev. Code § 1311.05', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 75, lienFilingTrigger: 'last_work', lienStatute: 'Ohio Rev. Code § 1311.06', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 75, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Notice of commencement required. Sub must serve notice within 21 days of first work. 75 days from last work to file.' },
  OK: { state: 'OK', stateName: 'Oklahoma', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Okla. Stat. tit. 42, § 141 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 4 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Okla. Stat. tit. 42, § 143', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 4 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '4 months from last work.' },
  OR: { state: 'OR', stateName: 'Oregon', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Or. Rev. Stat. § 87.001 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 75, lienFilingTrigger: 'last_work', lienStatute: 'Or. Rev. Stat. § 87.035', foreclosureDays: 120, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 75, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '75 days from last work to file. No preliminary notice required but notice to owner recommended.' },
  PA: { state: 'PA', stateName: 'Pennsylvania', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Pa. Stat. tit. 49, § 1101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 6 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Pa. Stat. tit. 49, § 1502', foreclosureDays: 2 * 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 6 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '6 months from last work. Must file with court prothonotary.' },
  RI: { state: 'RI', stateName: 'Rhode Island', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'R.I. Gen. Laws § 34-28-1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 200, lienFilingTrigger: 'last_work', lienStatute: 'R.I. Gen. Laws § 34-28-8', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 200, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '200 days from last work to file.' },
  SC: { state: 'SC', stateName: 'South Carolina', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'S.C. Code Ann. § 29-5-10 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'S.C. Code Ann. § 29-5-90', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
  SD: { state: 'SD', stateName: 'South Dakota', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'S.D. Codified Laws § 44-9-1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 120, lienFilingTrigger: 'last_work', lienStatute: 'S.D. Codified Laws § 44-9-8', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 120, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '120 days from last work.' },
  TN: { state: 'TN', stateName: 'Tennessee', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Tenn. Code Ann. § 66-11-101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Tenn. Code Ann. § 66-11-112', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work. Notice of nonpayment may be required.' },
  TX: { state: 'TX', stateName: 'Texas', preliminaryNoticeRequired: true, preliminaryNoticeDays: 15, preliminaryNoticeRecipients: ['owner','GC'], preliminaryNoticeStatute: 'Tex. Prop. Code § 53.001 et seq.', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: true, monthlyNoticeDeadline: '2nd month after unpaid work', lienFilingDays: 15, lienFilingTrigger: 'last_work', lienStatute: 'Tex. Prop. Code § 53.052', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'COMPLEX: Monthly notices required by the 15th of the 2nd month after work for which payment not received. Residential: notice by 15th of month 2. Commercial: can skip 1 month. Fund trapping notices to GC required.' },
  UT: { state: 'UT', stateName: 'Utah', preliminaryNoticeRequired: true, preliminaryNoticeDays: 20, preliminaryNoticeRecipients: ['owner','GC','lender'], preliminaryNoticeStatute: 'Utah Code Ann. § 38-1a-401', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'substantial_completion', lienStatute: 'Utah Code Ann. § 38-1a-501', foreclosureDays: 180, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Preliminary notice within 20 days of first furnishing. Electronic filing available. 90 days from substantial completion.' },
  VT: { state: 'VT', stateName: 'Vermont', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Vt. Stat. Ann. tit. 9, § 1921 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 180, lienFilingTrigger: 'last_work', lienStatute: 'Vt. Stat. Ann. tit. 9, § 1925', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 180, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '180 days from last work.' },
  VA: { state: 'VA', stateName: 'Virginia', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Va. Code Ann. § 43-1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'Va. Code Ann. § 43-4', foreclosureDays: 6 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work. Must file with circuit court clerk. Sub-subcontractors may need to give 30-day notice to GC.' },
  WA: { state: 'WA', stateName: 'Washington', preliminaryNoticeRequired: true, preliminaryNoticeDays: 10, preliminaryNoticeRecipients: ['owner','GC','lender'], preliminaryNoticeStatute: 'RCW § 60.04.031', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'substantial_completion', lienStatute: 'RCW § 60.04.091', foreclosureDays: 8 * 30, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Notice required within 10 days of first work on RESIDENTIAL, 60 days on commercial. 90 days from substantial completion to file.' },
  WV: { state: 'WV', stateName: 'West Virginia', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'W. Va. Code § 38-2-1 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 8 * 30, lienFilingTrigger: 'last_work', lienStatute: 'W. Va. Code § 38-2-7', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 8 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '8 months from last work.' },
  WI: { state: 'WI', stateName: 'Wisconsin', preliminaryNoticeRequired: true, preliminaryNoticeDays: 60, preliminaryNoticeRecipients: ['owner'], preliminaryNoticeStatute: 'Wis. Stat. § 779.02', preliminaryNoteMethod: 'certified_mail', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 6 * 30, lienFilingTrigger: 'last_work', lienStatute: 'Wis. Stat. § 779.06', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 6 * 30, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: 'Subcontractors must serve Notice Within 60 Days on the owner. Without this notice, no lien rights.' },
  WY: { state: 'WY', stateName: 'Wyoming', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'Wyo. Stat. Ann. § 29-1-101 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 150, lienFilingTrigger: 'last_work', lienStatute: 'Wyo. Stat. Ann. § 29-2-109', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 150, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '150 days from last work.' },
  DC: { state: 'DC', stateName: 'Washington D.C.', preliminaryNoticeRequired: false, preliminaryNoticeDays: null, preliminaryNoticeRecipients: [], preliminaryNoticeStatute: 'D.C. Code § 40-301.01 et seq.', preliminaryNoteMethod: 'none', noticeToOwnerRequired: false, noticeToOwnerDays: null, monthlyNoticeRequired: false, monthlyNoticeDeadline: null, lienFilingDays: 90, lienFilingTrigger: 'last_work', lienStatute: 'D.C. Code § 40-301.02', foreclosureDays: 365, stopNoticeAvailable: false, stopNoticeDays: null, bondClaimDays: 90, notarizationRequired: false, statutoryFormRequired: false, statutoryFormCitation: null, lienAgentRequired: false, lienAgentThreshold: null, waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'], notes: '90 days from last work.' },
}

// Helper: get lien law for a state (falls back to generic if state not found)
export function getLienLaw(stateCode: string): StateLienLaw {
  const law = STATE_LIEN_LAWS[stateCode?.toUpperCase()]
  if (law) return law
  // Generic fallback
  return {
    state: stateCode || 'XX',
    stateName: stateCode || 'Unknown',
    preliminaryNoticeRequired: false,
    preliminaryNoticeDays: null,
    preliminaryNoticeRecipients: [],
    preliminaryNoticeStatute: 'See state statutes',
    preliminaryNoteMethod: 'none',
    noticeToOwnerRequired: false,
    noticeToOwnerDays: null,
    monthlyNoticeRequired: false,
    monthlyNoticeDeadline: null,
    lienFilingDays: 90,
    lienFilingTrigger: 'last_work',
    lienStatute: 'See state statutes',
    foreclosureDays: 365,
    stopNoticeAvailable: false,
    stopNoticeDays: null,
    bondClaimDays: 90,
    notarizationRequired: false,
    statutoryFormRequired: false,
    statutoryFormCitation: null,
    lienAgentRequired: false,
    lienAgentThreshold: null,
    waiverTypes: ['conditional_partial','unconditional_partial','conditional_final','unconditional_final'],
    notes: 'Consult a local construction attorney for state-specific requirements.',
  }
}

// Calculate deadline dates given a state and project dates
export function calculateLienDeadlines(stateCode: string, firstFurnishedDate: Date, lastFurnishedDate: Date, substantialCompletionDate?: Date) {
  const law = getLienLaw(stateCode)
  const today = new Date()
  const results: Array<{
    type: string
    category: string
    description: string
    statute: string
    dueDate: Date
    isCritical: boolean
    serviceMethod: string
    notarizationRequired: boolean
    recipients: string[]
  }> = []

  // Preliminary Notice
  if (law.preliminaryNoticeRequired && law.preliminaryNoticeDays !== null) {
    const prelim = new Date(firstFurnishedDate)
    prelim.setDate(prelim.getDate() + law.preliminaryNoticeDays)
    results.push({
      type: 'preliminary_notice',
      category: 'preliminary_notice',
      description: `Preliminary Notice / Notice to ${law.noticeToOwnerRequired ? 'Owner' : 'Subs'} — Must serve within ${law.preliminaryNoticeDays} days of first furnishing`,
      statute: law.preliminaryNoticeStatute,
      dueDate: prelim,
      isCritical: true,
      serviceMethod: law.preliminaryNoteMethod,
      notarizationRequired: false,
      recipients: law.preliminaryNoticeRecipients,
    })
  }

  // Notice to Owner (FL-specific)
  if (law.noticeToOwnerRequired && law.noticeToOwnerDays !== null) {
    const nto = new Date(firstFurnishedDate)
    nto.setDate(nto.getDate() + law.noticeToOwnerDays)
    results.push({
      type: 'notice_to_owner',
      category: 'notice_to_owner',
      description: `Notice to Owner — Must serve within ${law.noticeToOwnerDays} days of first furnishing. Failure loses ALL lien rights.`,
      statute: law.preliminaryNoticeStatute,
      dueDate: nto,
      isCritical: true,
      serviceMethod: 'certified_mail',
      notarizationRequired: false,
      recipients: ['owner', 'lender'],
    })
  }

  // Texas monthly notices
  if (law.monthlyNoticeRequired) {
    // Create 3 monthly notices starting from now
    for (let m = 1; m <= 3; m++) {
      const monthlyDate = new Date(lastFurnishedDate)
      monthlyDate.setMonth(monthlyDate.getMonth() + m)
      monthlyDate.setDate(15) // 15th of the month
      results.push({
        type: 'monthly_notice',
        category: 'monthly_notice',
        description: `Texas Monthly Notice — 15th of month ${m} after unpaid work (${law.preliminaryNoticeStatute})`,
        statute: law.lienStatute,
        dueDate: monthlyDate,
        isCritical: true,
        serviceMethod: 'certified_mail',
        notarizationRequired: false,
        recipients: ['owner', 'GC'],
      })
    }
  }

  // Mechanic's Lien Filing
  const lienTriggerDate = law.lienFilingTrigger === 'substantial_completion' && substantialCompletionDate
    ? substantialCompletionDate
    : lastFurnishedDate
  const lienDeadline = new Date(lienTriggerDate)
  lienDeadline.setDate(lienDeadline.getDate() + law.lienFilingDays)
  results.push({
    type: 'mechanics_lien',
    category: 'mechanics_lien',
    description: `Mechanic's Lien — Record within ${law.lienFilingDays} days of ${law.lienFilingTrigger === 'substantial_completion' ? 'substantial completion' : 'last work'}${law.notarizationRequired ? ' (NOTARIZATION REQUIRED)' : ''}`,
    statute: law.lienStatute,
    dueDate: lienDeadline,
    isCritical: true,
    serviceMethod: 'recorded',
    notarizationRequired: law.notarizationRequired,
    recipients: ['county_recorder'],
  })

  // Lien Foreclosure
  const foreclosureDeadline = new Date(lienDeadline)
  foreclosureDeadline.setDate(foreclosureDeadline.getDate() + law.foreclosureDays)
  results.push({
    type: 'lien_foreclosure',
    category: 'lien_foreclosure',
    description: `Lien Foreclosure Deadline — Must file foreclosure lawsuit within ${law.foreclosureDays} days of recording lien`,
    statute: law.lienStatute,
    dueDate: foreclosureDeadline,
    isCritical: false,
    serviceMethod: 'court_filing',
    notarizationRequired: false,
    recipients: ['court'],
  })

  // Stop Notice (CA and some other states)
  if (law.stopNoticeAvailable && law.stopNoticeDays !== null) {
    const stopDate = new Date(lastFurnishedDate)
    stopDate.setDate(stopDate.getDate() + law.stopNoticeDays)
    results.push({
      type: 'stop_notice',
      category: 'stop_notice',
      description: `Stop Notice — Serve on construction lender/owner within ${law.stopNoticeDays} days`,
      statute: law.preliminaryNoticeStatute,
      dueDate: stopDate,
      isCritical: false,
      serviceMethod: 'certified_mail',
      notarizationRequired: false,
      recipients: ['lender', 'owner'],
    })
  }

  // Bond Claim
  if (law.bondClaimDays !== null) {
    const bondDate = new Date(lastFurnishedDate)
    bondDate.setDate(bondDate.getDate() + law.bondClaimDays)
    results.push({
      type: 'bond_claim',
      category: 'bond_claim',
      description: `Bond Claim — File with payment bond surety within ${law.bondClaimDays} days of last work`,
      statute: law.lienStatute,
      dueDate: bondDate,
      isCritical: false,
      serviceMethod: 'certified_mail',
      notarizationRequired: false,
      recipients: ['surety', 'GC'],
    })
  }

  return results.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
}

// Get California statutory waiver language (mandated by Civil Code § 8132-8138)
export function getCaliforniaStatutoryWaiverText(waiverType: string, amount: string, throughDate: string, claimantName: string): string {
  switch (waiverType) {
    case 'conditional_partial':
      return `CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT\nCal. Civ. Code § 8132\n\nThis document waives and releases lien, stop payment notice, and payment bond rights the undersigned has for labor and service provided, and equipment and material delivered, to ${claimantName} through ${throughDate}. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the undersigned, are waived and released by this document, unless listed as an Exception below. This document is effective only on the undersigned's receipt of payment from the financial institution on which the following check is drawn: Maker of Check: __________________________ Amount of Check: ${amount} Check Payable to: __________________________\nEXCEPTIONS: ________________________________________`
    case 'unconditional_partial':
      return `UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT\nCal. Civ. Code § 8134\n\nThis document waives and releases lien, stop payment notice, and payment bond rights the undersigned has for labor and service provided, and equipment and material delivered, to ${claimantName} through ${throughDate}. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the undersigned, are waived and released by this document, unless listed as an Exception below. The undersigned warrants that the undersigned either has already been paid in full for all labor and service provided, and equipment and material delivered, to the Customer, or is and shall remain obligated to accept, for payment in full, the amount listed below.\nPAYMENT AMOUNT: ${amount}\nEXCEPTIONS: ________________________________________`
    case 'conditional_final':
      return `CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT\nCal. Civ. Code § 8136\n\nThis document waives and releases lien, stop payment notice, and payment bond rights the undersigned has for all labor and service provided, and equipment and material delivered, to ${claimantName}. Rights based upon labor or service provided, or equipment or material delivered, pursuant to a written change order that has been fully executed by the parties prior to the date that this document is signed by the undersigned, are waived and released by this document, unless listed as an Exception below. This document is effective only on the undersigned's receipt of payment from the financial institution on which the following check is drawn: Maker of Check: __________________________ Amount of Check: ${amount} Check Payable to: __________________________\nEXCEPTIONS: ________________________________________`
    case 'unconditional_final':
      return `UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT\nCal. Civ. Code § 8138\n\nThis document waives and releases lien, stop payment notice, and payment bond rights the undersigned has for all labor and service provided, and equipment and material delivered, to ${claimantName}. The undersigned warrants that the undersigned either has already been paid in full for all labor and service provided, and equipment and material delivered, or is and shall remain obligated to accept, for payment in full, the amount listed below.\nFINAL PAYMENT AMOUNT: ${amount}\nEXCEPTIONS: ________________________________________`
    default:
      return ''
  }
}

export const ALL_STATES = Object.keys(STATE_LIEN_LAWS).sort()
export const STATES_REQUIRING_PRELIM_NOTICE = Object.values(STATE_LIEN_LAWS).filter(s => s.preliminaryNoticeRequired).map(s => s.state)
export const STATES_REQUIRING_NOTARIZATION = Object.values(STATE_LIEN_LAWS).filter(s => s.notarizationRequired).map(s => s.state)
export const STATES_WITH_STATUTORY_FORMS = Object.values(STATE_LIEN_LAWS).filter(s => s.statutoryFormRequired).map(s => s.state) // ['CA']
export const STATES_REQUIRING_LIEN_AGENT = Object.values(STATE_LIEN_LAWS).filter(s => s.lienAgentRequired).map(s => s.state) // ['NC']
