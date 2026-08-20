/**
 * Document AI — Smart form helpers powered by Sage.
 * Auto-fill, auto-detect, and suggest based on project context.
 */

/**
 * Suggest lien waiver type based on payment status.
 * Arizona law: Conditional before payment, Unconditional after.
 */
export function suggestLienWaiverType(paymentStatus: string, paymentAmount: number): {
  type: 'conditional_partial' | 'conditional_final' | 'unconditional_partial' | 'unconditional_final';
  label: string;
  description: string;
} {
  const isPaid = paymentStatus === 'paid' || paymentStatus === 'cleared';
  const isFinal = paymentStatus === 'final' || paymentStatus === 'complete';

  if (isPaid && isFinal) {
    return {
      type: 'unconditional_final',
      label: 'Unconditional Final Lien Waiver',
      description: `Payment of $${paymentAmount.toLocaleString()} has been received and verified. This unconditional final waiver releases all lien rights for the entire project.`,
    };
  }
  if (isPaid) {
    return {
      type: 'unconditional_partial',
      label: 'Unconditional Partial Lien Waiver',
      description: `Payment of $${paymentAmount.toLocaleString()} has been received. This unconditional waiver releases lien rights for work through this payment period.`,
    };
  }
  if (isFinal) {
    return {
      type: 'conditional_final',
      label: 'Conditional Final Lien Waiver',
      description: `Conditioned on receipt of final payment of $${paymentAmount.toLocaleString()}. Lien rights are released only after check clears.`,
    };
  }
  return {
    type: 'conditional_partial',
    label: 'Conditional Partial Lien Waiver',
    description: `Conditioned on receipt of payment of $${paymentAmount.toLocaleString()}. Lien rights preserved until payment clears.`,
  };
}

/**
 * Auto-detect insurance document expiration from common patterns.
 * Looks for dates in the file name or metadata.
 */
export function detectInsuranceExpiration(fileName: string): {
  detected: boolean;
  expirationDate: string | null;
  confidence: 'high' | 'medium' | 'low';
} {
  // Pattern: YYYY-MM-DD or MM-DD-YYYY or MM/DD/YYYY in filename
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/,          // 2026-03-15
    /(\d{2})-(\d{2})-(\d{4})/,          // 03-15-2026
    /(\d{2})\/(\d{2})\/(\d{4})/,         // 03/15/2026
    /exp[iry]*[_\-\s]*(\d{4})/i,         // expiry_2026 or exp-2027
    /(\d{2})(\d{2})(\d{4})/,            // 03152026
  ];

  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      let year: string, month: string, day: string;
      if (match[1].length === 4) {
        year = match[1]; month = match[2]; day = match[3];
      } else if (match[3]?.length === 4) {
        month = match[1]; day = match[2]; year = match[3];
      } else {
        // Just year detected
        return { detected: true, expirationDate: `${match[1]}-12-31`, confidence: 'low' };
      }
      const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const d = new Date(dateStr);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2024 && d.getFullYear() <= 2030) {
        return { detected: true, expirationDate: dateStr, confidence: 'high' };
      }
    }
  }

  // Check for "exp" or "renewal" keywords suggesting this has expiration info
  if (/expir|renewal|valid.*until|effective.*through/i.test(fileName)) {
    return { detected: true, expirationDate: null, confidence: 'low' };
  }

  return { detected: false, expirationDate: null, confidence: 'low' };
}

/**
 * Pre-populate pay app line items from Schedule of Values.
 * Calculates: this period amount, total completed, retainage.
 */
export function prepopulatePayApp(scheduleOfValues: {
  line_number: number;
  description: string;
  scheduled_value: number;
  previous_completed: number;
}[], retainagePercent: number = 10): {
  lineItems: {
    line_number: number;
    description: string;
    scheduled_value: number;
    previous_completed: number;
    this_period: number;
    total_completed: number;
    percent_complete: number;
    retainage: number;
    net_amount: number;
  }[];
  totals: {
    scheduled: number;
    previousCompleted: number;
    thisPeriod: number;
    totalCompleted: number;
    retainage: number;
    netAmount: number;
    overallPercent: number;
  };
} {
  const lineItems = scheduleOfValues.map(sov => {
    const remaining = sov.scheduled_value - sov.previous_completed;
    const thisPeriod = 0; // Start at zero, user fills in
    const totalCompleted = sov.previous_completed + thisPeriod;
    const percentComplete = sov.scheduled_value > 0 ? (totalCompleted / sov.scheduled_value) * 100 : 0;
    const retainage = totalCompleted * (retainagePercent / 100);
    const netAmount = totalCompleted - retainage;

    return {
      line_number: sov.line_number,
      description: sov.description,
      scheduled_value: sov.scheduled_value,
      previous_completed: sov.previous_completed,
      this_period: thisPeriod,
      total_completed: totalCompleted,
      percent_complete: Math.round(percentComplete * 10) / 10,
      retainage,
      net_amount: netAmount,
    };
  });

  const totals = lineItems.reduce(
    (acc, li) => ({
      scheduled: acc.scheduled + li.scheduled_value,
      previousCompleted: acc.previousCompleted + li.previous_completed,
      thisPeriod: acc.thisPeriod + li.this_period,
      totalCompleted: acc.totalCompleted + li.total_completed,
      retainage: acc.retainage + li.retainage,
      netAmount: acc.netAmount + li.net_amount,
      overallPercent: 0,
    }),
    { scheduled: 0, previousCompleted: 0, thisPeriod: 0, totalCompleted: 0, retainage: 0, netAmount: 0, overallPercent: 0 },
  );

  totals.overallPercent = totals.scheduled > 0 ? Math.round((totals.totalCompleted / totals.scheduled) * 1000) / 10 : 0;

  return { lineItems, totals };
}

/**
 * Auto-fill project form fields from Sage AI analysis.
 * Returns suggested field values based on project type.
 */
export function getProjectDefaults(projectType: string): Record<string, string | number> {
  const defaults: Record<string, Record<string, string | number>> = {
    commercial: {
      retainage_percent: 10,
      payment_terms: 'Net 30',
      default_markup: 15,
      insurance_required: 'GL + Workers Comp + Auto + Umbrella',
    },
    residential: {
      retainage_percent: 5,
      payment_terms: 'Draw Schedule',
      default_markup: 20,
      insurance_required: 'GL + Workers Comp',
    },
    government: {
      retainage_percent: 5,
      payment_terms: 'Net 45',
      default_markup: 10,
      insurance_required: 'GL + Workers Comp + Auto + Umbrella + Professional',
      prevailing_wage: 'Required',
      certified_payroll: 'Required',
    },
    industrial: {
      retainage_percent: 10,
      payment_terms: 'Net 30',
      default_markup: 12,
      insurance_required: 'GL + Workers Comp + Auto + Umbrella + Pollution',
    },
  };

  return defaults[projectType.toLowerCase()] || defaults.commercial;
}

/**
 * Calculate compliance health for a subcontractor.
 * Returns score 0-100 and list of missing/expiring items.
 */
export function calculateComplianceHealth(docs: {
  doc_type: string;
  status: string;
  expires_at: string | null;
  days_until_expiry: number | null;
}[]): {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  missing: string[];
  expiring: string[];
  expired: string[];
} {
  const required = ['insurance', 'w9', 'business_license'];
  const optional = ['bond', 'safety_certification'];
  const allTypes = [...required, ...optional];

  const missing: string[] = [];
  const expiring: string[] = [];
  const expired: string[] = [];

  let score = 100;

  // Check required docs
  for (const type of required) {
    const doc = docs.find(d => d.doc_type === type);
    if (!doc) {
      missing.push(type);
      score -= 20;
    } else if (doc.status === 'expired' || (doc.days_until_expiry !== null && doc.days_until_expiry <= 0)) {
      expired.push(type);
      score -= 15;
    } else if (doc.days_until_expiry !== null && doc.days_until_expiry <= 30) {
      expiring.push(type);
      score -= 5;
    }
  }

  // Check optional docs (less penalty)
  for (const type of optional) {
    const doc = docs.find(d => d.doc_type === type);
    if (doc && (doc.status === 'expired' || (doc.days_until_expiry !== null && doc.days_until_expiry <= 0))) {
      expired.push(type);
      score -= 5;
    }
  }

  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';

  return { score: Math.max(0, score), grade, missing, expiring, expired };
}
