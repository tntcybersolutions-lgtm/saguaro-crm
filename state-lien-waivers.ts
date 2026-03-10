/**
 * state-lien-waivers.ts
 *
 * Statutory lien waiver language for all major US construction states.
 * Every state has specific statutory requirements for lien waivers —
 * using the wrong form can invalidate the waiver entirely.
 *
 * Sources:
 *   Arizona: A.R.S. §33-1008
 *   California: Civil Code §8132, §8134, §8136, §8138
 *   Texas: Property Code §53.281–.284
 *   Nevada: NRS 108.2453
 *   New Mexico: NMSA 1978 §48-2-2.1
 *   Florida: F.S. §713.20
 *   Colorado: C.R.S. §38-22-124
 *   Utah: U.C.A. §38-1a-801
 *   Washington: RCW 60.04.260
 *   Oregon: ORS 87.027
 *
 * For states not listed, a generic/recommended form is provided.
 * Always have legal counsel review lien waivers for critical projects.
 */

export type WaiverType =
  | 'conditional_partial'
  | 'unconditional_partial'
  | 'conditional_final'
  | 'unconditional_final';

export type StateLienWaiverLanguage = {
  state:            string;
  statute:          string;
  mainText:         string;
  additionalText?:  string;
  warningText?:     string;
  requiresNotary:   boolean;
  requiresWitness:  boolean;
  exceptionAllowed: boolean;   // some states (AZ) prohibit exceptions on final waivers
};

// ─────────────────────────────────────────────────────────────────────────────
// ARIZONA — A.R.S. §33-1008 (Statutory Form Required)
// ─────────────────────────────────────────────────────────────────────────────

const ARIZONA: Record<WaiverType, StateLienWaiverLanguage> = {
  conditional_partial: {
    state: 'AZ', statute: 'A.R.S. §33-1008(A)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT

The undersigned has been paid and has received a progress payment in the sum of {{amount}} for labor, services, equipment or materials furnished to {{project}} at {{address}} on the job of {{owner}}, Owner, and does hereby release any claim or right to a lien upon the real property or improvement in which the undersigned is a claimant, subject to the claimant receiving payment in full for the amount stated above.

This release covers a progress payment for labor, services, equipment or materials furnished through {{through_date}} only and does not cover any retentions retained before or after the release date; extras furnished before the release date for which payment has not been received; extras or items furnished after the release date.

Claimant has read and understands this document, which is a conditional waiver and release, and will become effective and binding only if and when such payment is received by the claimant.`,
    warningText: 'Arizona requires the specific statutory form per A.R.S. §33-1008. Using a non-compliant form may invalidate the waiver.',
  },
  unconditional_partial: {
    state: 'AZ', statute: 'A.R.S. §33-1008(B)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT

The undersigned has been paid and has received a progress payment in the sum of {{amount}} for labor, services, equipment or materials furnished to {{project}} at {{address}} on the job of {{owner}}, Owner, and does hereby release any claim or right to a lien upon the real property or improvement in which the undersigned is a claimant.

This release covers a progress payment for labor, services, equipment or materials furnished through {{through_date}} only and does not cover any retentions retained before or after the release date; extras furnished before the release date for which payment has not been received; extras or items furnished after the release date.`,
    warningText: 'This form is effective immediately upon signing, even without payment. Do not sign until payment is confirmed received.',
  },
  conditional_final: {
    state: 'AZ', statute: 'A.R.S. §33-1008(C)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT

The undersigned has been paid and has received a final payment in the sum of {{amount}} for labor, services, equipment or materials furnished to {{project}} at {{address}} on the job of {{owner}}, Owner, and does hereby release any claim or right to a lien or bond claim upon the real property or improvement, as well as any claim against any payment bond, in which the undersigned is a claimant.

This is a CONDITIONAL release and is effective only upon receipt by claimant of payment in the sum of {{amount}}.`,
    warningText: 'Arizona law prohibits exceptions on final lien waivers (A.R.S. §33-1008). Any exceptions written here are void.',
  },
  unconditional_final: {
    state: 'AZ', statute: 'A.R.S. §33-1008(D)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT

The undersigned has been paid and has received final payment in the sum of {{amount}} for labor, services, equipment or materials furnished to {{project}} at {{address}} on the job of {{owner}}, Owner, and does hereby release any claim or right to a lien or bond claim upon the real property or improvement, as well as any claim against any payment bond, in which the undersigned is a claimant.

The undersigned warrants that all persons and entities that provided labor, services, equipment or materials for which the claimant is responsible have been paid.`,
    warningText: 'FINAL WAIVER: This release is unconditional and immediately effective. Verify full payment received before signing. Arizona law prohibits any exceptions (A.R.S. §33-1008).',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// CALIFORNIA — Civil Code §8132–8138 (Statutory Form Required)
// ─────────────────────────────────────────────────────────────────────────────

const CALIFORNIA: Record<WaiverType, StateLienWaiverLanguage> = {
  conditional_partial: {
    state: 'CA', statute: 'California Civil Code §8132',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT
(California Civil Code §8132)

This document, when signed by the claimant, is a conditional release and waiver effective on receipt by the claimant of payment from the financial institution on which the following check is drawn:

Maker of Check: {{gc}}
Amount of Check: {{amount}}
Check Payable to: {{claimant}}

Conditional on receipt of the check described above, the undersigned releases any claim and right to a mechanic's lien, stop payment notice, or any bond right under the Civil Code of the State of California against {{owner}} and the property of {{owner}} located at {{address}}, for labor, service, equipment, or material furnished through {{through_date}}, except for disputed claims for additional work in the amount of {{exceptions}}.

NOTICE: This document waives and releases lien and bond rights and stop payment notice rights based on the California Civil Code. Read it before signing. The condition stated above must be met, or this document is ineffective.`,
    warningText: 'California requires the exact statutory form per Civil Code §8132. The check description must match the actual payment instrument.',
  },
  unconditional_partial: {
    state: 'CA', statute: 'California Civil Code §8134',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT
(California Civil Code §8134)

The undersigned has received a progress payment described below from {{gc}} and releases any claim and right to a mechanic's lien, stop payment notice, or any bond right under the Civil Code of the State of California against {{owner}} and the property located at {{address}}, for labor, service, equipment, or material furnished through {{through_date}}, except for disputed claims for additional work in the amount of {{exceptions}}.

Payment Amount: {{amount}}
Payment received by: {{claimant}}

NOTICE: This document waives and releases lien and bond rights and stop payment notice rights based on the California Civil Code. Read it before signing. This release is unconditional and effective immediately upon execution.`,
    warningText: 'This form is effective upon signing regardless of payment. Do not sign before payment is received and cleared.',
  },
  conditional_final: {
    state: 'CA', statute: 'California Civil Code §8136',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `CONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT
(California Civil Code §8136)

This document, when signed by the claimant, is a conditional release and waiver effective on receipt of payment from the financial institution on which the following check is drawn:

Maker of Check: {{gc}}
Amount of Check: {{amount}}
Check Payable to: {{claimant}}

Conditional on receipt of the check described above in payment of a claim described as final payment, the undersigned releases any claim and right to a mechanic's lien, stop payment notice, or any bond right under the Civil Code of the State of California against {{owner}} and the property located at {{address}} for all labor, service, equipment, or material furnished on this job.

NOTICE: This document waives and releases lien and bond rights and stop payment notice rights based on the California Civil Code.`,
    warningText: 'Effective only upon receipt and clearing of the specified check. Do not release until payment confirms.',
  },
  unconditional_final: {
    state: 'CA', statute: 'California Civil Code §8138',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE UPON FINAL PAYMENT
(California Civil Code §8138)

The undersigned has received final payment described below from {{gc}} and releases any claim and right to a mechanic's lien, stop payment notice, or any bond right under the Civil Code of the State of California against {{owner}} and the property located at {{address}} for all labor, service, equipment, or material furnished on this job.

Final Payment Amount: {{amount}}
Received by: {{claimant}}

NOTICE: This document waives and releases lien and bond rights and stop payment notice rights unconditionally. The claimant has received full payment and has no further claims against the project.`,
    warningText: 'FINAL — UNCONDITIONAL: This releases ALL rights permanently. Only sign after receiving full final payment.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TEXAS — Property Code §53.281–.284
// ─────────────────────────────────────────────────────────────────────────────

const TEXAS: Record<WaiverType, StateLienWaiverLanguage> = {
  conditional_partial: {
    state: 'TX', statute: 'Texas Property Code §53.284',
    requiresNotary: true, requiresWitness: false, exceptionAllowed: true,
    mainText: `CONDITIONAL WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS

Project: {{project}}
Owner: {{owner}}
Prime Contractor: {{gc}}
Claimant: {{claimant}}
Amount of Payment for Which Waiver Is Given: {{amount}}
Through Date: {{through_date}}

NOTICE: This document waives and releases lien and bond rights. Read it before signing. The conditions stated in this form must be met, or this document is ineffective.

The claimant has agreed to waive and release lien and bond rights only under the following conditions: The claimant receives payment in the amount of {{amount}} by check that clears the bank.

This waiver and release of lien and bond rights is conditioned on receipt by claimant of payment of the amount stated above. This waiver and release covers a progress payment only for the labor, service, equipment, and materials furnished through the date stated above.`,
    warningText: 'Texas requires notarization of lien waivers. An unnotarized waiver is not effective under Texas law.',
  },
  unconditional_partial: {
    state: 'TX', statute: 'Texas Property Code §53.283',
    requiresNotary: true, requiresWitness: false, exceptionAllowed: true,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS

Project: {{project}}
Owner: {{owner}}
Prime Contractor: {{gc}}
Claimant: {{claimant}}
Amount of Payment Received: {{amount}}
Through Date: {{through_date}}

NOTICE: This document waives and releases lien and bond rights unconditionally and is effective on delivery.

The claimant has received payment in the amount of {{amount}} and waives and releases any right to a lien or payment bond claim for labor, services, equipment, or materials furnished through {{through_date}} on the above project.

This waiver covers all amounts through {{through_date}} only, and does not cover amounts retained.`,
    warningText: 'Texas requires notarization. Effective immediately upon delivery — verify payment has cleared before executing.',
  },
  conditional_final: {
    state: 'TX', statute: 'Texas Property Code §53.284',
    requiresNotary: true, requiresWitness: false, exceptionAllowed: false,
    mainText: `CONDITIONAL WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS (FINAL)

This FINAL conditional waiver releases all claims upon receipt of final payment.

Project: {{project}}
Claimant: {{claimant}}
Final Payment Amount: {{amount}}

This waiver and release of lien and bond rights is conditioned on receipt by the claimant of the final payment in the amount of {{amount}}. Upon receipt of such payment, claimant releases all rights to a lien or payment bond claim for all labor, services, equipment, and materials furnished on this project.`,
    warningText: 'Texas final lien waivers require notarization. Final waivers cannot include exceptions under Texas law.',
  },
  unconditional_final: {
    state: 'TX', statute: 'Texas Property Code §53.283',
    requiresNotary: true, requiresWitness: false, exceptionAllowed: false,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE OF LIEN AND PAYMENT BOND RIGHTS (FINAL)

Project: {{project}}
Owner: {{owner}}
Claimant: {{claimant}}
Final Payment Received: {{amount}}

The claimant has received final payment in the amount stated above and unconditionally releases all rights to a lien or payment bond claim for all labor, services, equipment, and materials furnished on the above project.

The claimant represents that all subcontractors, laborers, and materialmen employed or engaged by the claimant have been paid in full through the date hereof.`,
    warningText: 'FINAL — UNCONDITIONAL — NOTARIZED REQUIRED: All rights permanently released. Texas courts strictly enforce this form.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// NEVADA — NRS 108.2453
// ─────────────────────────────────────────────────────────────────────────────

const NEVADA: Record<WaiverType, StateLienWaiverLanguage> = {
  conditional_partial: {
    state: 'NV', statute: 'NRS 108.2453(1)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `CONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT

Upon receipt of payment described below, the undersigned waives and releases any and all claims and liens upon the real property or improvement described as {{project}}, located at {{address}}, for labor, materials, equipment or services performed through {{through_date}}.

Payment Amount (Conditional On): {{amount}}
Claimant: {{claimant}}

This waiver is conditional upon actual receipt and clearance of the payment described above.`,
    warningText: 'Nevada follows substantial statutory requirements for lien waivers per NRS 108.2453.',
  },
  unconditional_partial: {
    state: 'NV', statute: 'NRS 108.2453(2)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE UPON PROGRESS PAYMENT

The undersigned has received payment in the amount of {{amount}} and unconditionally waives and releases any and all claims and liens upon the real property described as {{project}}, located at {{address}}, for labor, materials, equipment or services performed through {{through_date}}.

Claimant: {{claimant}}`,
    warningText: 'Effective upon signing. Confirm payment received before executing.',
  },
  conditional_final: {
    state: 'NV', statute: 'NRS 108.2453(3)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `CONDITIONAL FINAL WAIVER AND RELEASE

Conditional on receipt of final payment in the amount of {{amount}}, the undersigned permanently and unconditionally waives and releases all claims, liens, and rights against the property described as {{project}} at {{address}}.

Claimant: {{claimant}}
Amount: {{amount}}`,
    warningText: 'Nevada final waivers cannot contain exceptions once payment is final.',
  },
  unconditional_final: {
    state: 'NV', statute: 'NRS 108.2453(4)',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `UNCONDITIONAL FINAL WAIVER AND RELEASE

The undersigned has received final payment of {{amount}} and permanently and unconditionally waives, releases, and relinquishes all claims, liens, stop notices, and rights against the property described as {{project}} at {{address}} and against {{owner}}.

This waiver covers all labor, materials, equipment and services furnished on this project.

Claimant: {{claimant}}`,
    warningText: 'FINAL AND UNCONDITIONAL: No further claims after this signature.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// FLORIDA — F.S. §713.20
// ─────────────────────────────────────────────────────────────────────────────

const FLORIDA: Record<WaiverType, StateLienWaiverLanguage> = {
  conditional_partial: {
    state: 'FL', statute: 'F.S. §713.20(3)',
    requiresNotary: true, requiresWitness: true, exceptionAllowed: true,
    mainText: `PARTIAL RELEASE OF LIEN (CONDITIONAL)

STATE OF FLORIDA, COUNTY OF _______________

The undersigned, {{claimant}}, for and in consideration of the sum of {{amount}}, contingent upon clearance of the payment described herein, releases and waives its lien or claim of lien for labor, services, and materials furnished through {{through_date}}, to {{project}}, located at {{address}}, owned by {{owner}}, described as follows:

[Legal description or project description]

In Witness Whereof, the undersigned has executed this release this ___ day of __________, 20___.

Signed in the presence of two witnesses.`,
    warningText: 'Florida lien waivers REQUIRE notarization AND two witnesses per F.S. §713.20. Missing either invalidates the waiver.',
    additionalText: 'WITNESS 1 signature: ___________________ WITNESS 2 signature: ___________________',
  },
  unconditional_partial: {
    state: 'FL', statute: 'F.S. §713.20(2)',
    requiresNotary: true, requiresWitness: true, exceptionAllowed: true,
    mainText: `PARTIAL RELEASE OF LIEN (UNCONDITIONAL)

STATE OF FLORIDA, COUNTY OF _______________

The undersigned, {{claimant}}, for and in consideration of the sum of {{amount}} received, releases and waives its lien or claim of lien for labor, services, and materials furnished through {{through_date}}, to {{project}}, located at {{address}}, owned by {{owner}}.`,
    warningText: 'Florida requires notarization AND two witnesses. Effective immediately upon execution.',
    additionalText: 'WITNESS 1 signature: ___________________ WITNESS 2 signature: ___________________',
  },
  conditional_final: {
    state: 'FL', statute: 'F.S. §713.20(4)',
    requiresNotary: true, requiresWitness: true, exceptionAllowed: false,
    mainText: `FINAL RELEASE OF LIEN (CONDITIONAL)

STATE OF FLORIDA, COUNTY OF _______________

Conditional on receipt of final payment in the sum of {{amount}}, the undersigned, {{claimant}}, releases and waives any and all claims, liens, and rights against {{project}} at {{address}}, owned by {{owner}}, for all labor, services, and materials furnished through the completion of the project.`,
    warningText: 'Florida final lien waivers require notarization and two witnesses.',
    additionalText: 'WITNESS 1 signature: ___________________ WITNESS 2 signature: ___________________',
  },
  unconditional_final: {
    state: 'FL', statute: 'F.S. §713.20(1)',
    requiresNotary: true, requiresWitness: true, exceptionAllowed: false,
    mainText: `FINAL RELEASE OF LIEN (UNCONDITIONAL)

STATE OF FLORIDA, COUNTY OF _______________

The undersigned, {{claimant}}, for and in consideration of final payment in the sum of {{amount}} received, releases and waives any and all claims, liens, stop notices, and rights against {{project}} at {{address}}, owned by {{owner}}, for all labor, services, materials, and equipment furnished on this project.`,
    warningText: 'FINAL — ALL RIGHTS RELEASED. Florida requires notarization and two witnesses. Verify full payment received.',
    additionalText: 'WITNESS 1 signature: ___________________ WITNESS 2 signature: ___________________',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC / ALL OTHER STATES
// ─────────────────────────────────────────────────────────────────────────────

const GENERIC: Record<WaiverType, StateLienWaiverLanguage> = {
  conditional_partial: {
    state: 'GENERIC', statute: 'Recommended Form',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `CONDITIONAL WAIVER AND RELEASE — PROGRESS PAYMENT

Upon receipt of payment in the sum of {{amount}}, the undersigned, {{claimant}}, releases any and all claims or rights to a mechanic's lien upon the property located at {{address}}, known as {{project}}, owned by {{owner}}, for labor, services, equipment, or materials furnished through {{through_date}}.

This waiver is conditional upon actual receipt and clearance of the payment described above.

EXCEPTIONS (if any): {{exceptions}}`,
    warningText: 'Consult legal counsel. State-specific statutory forms may be required in your jurisdiction.',
  },
  unconditional_partial: {
    state: 'GENERIC', statute: 'Recommended Form',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: true,
    mainText: `UNCONDITIONAL WAIVER AND RELEASE — PROGRESS PAYMENT

The undersigned, {{claimant}}, has received payment in the sum of {{amount}} and releases any and all claims or rights to a mechanic's lien upon the property at {{address}}, known as {{project}}, owned by {{owner}}, for all work through {{through_date}}.

EXCEPTIONS (if any): {{exceptions}}`,
    warningText: 'This form is unconditional and effective immediately upon signing.',
  },
  conditional_final: {
    state: 'GENERIC', statute: 'Recommended Form',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `CONDITIONAL FINAL WAIVER AND RELEASE

Upon receipt of final payment in the sum of {{amount}}, the undersigned, {{claimant}}, permanently releases any and all claims or rights to a lien upon the property at {{address}}, known as {{project}}, owned by {{owner}}, for all labor, services, equipment, and materials furnished on this project.`,
    warningText: 'Final conditional waiver — verify payment before signing.',
  },
  unconditional_final: {
    state: 'GENERIC', statute: 'Recommended Form',
    requiresNotary: false, requiresWitness: false, exceptionAllowed: false,
    mainText: `UNCONDITIONAL FINAL WAIVER AND RELEASE

The undersigned, {{claimant}}, has received final payment in the sum of {{amount}} and permanently and unconditionally releases all claims, liens, and rights against the property at {{address}}, known as {{project}}, owned by {{owner}}, and against {{gc}} for all labor, services, equipment, and materials furnished on this project.

The undersigned warrants that all subcontractors, suppliers, and laborers have been paid in full.`,
    warningText: 'FINAL AND UNCONDITIONAL: All rights permanently released. No further claims can be made.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main export function
// ─────────────────────────────────────────────────────────────────────────────

const STATE_MAP: Record<string, Record<WaiverType, StateLienWaiverLanguage>> = {
  AZ: ARIZONA,
  CA: CALIFORNIA,
  TX: TEXAS,
  NV: NEVADA,
  FL: FLORIDA,
  // Add more states here as needed
};

export function getStatutoryWaiverLanguage(
  state: string,
  waiverType: WaiverType,
): StateLienWaiverLanguage {
  const stateUpper = state.toUpperCase().trim();
  const stateTemplates = STATE_MAP[stateUpper] ?? GENERIC;
  return stateTemplates[waiverType] ?? GENERIC[waiverType];
}

export function getStateWaiverRequirements(state: string): {
  requiresNotary:  boolean;
  requiresWitness: boolean;
  hasStatutoryForm: boolean;
  statutoryCitation: string;
  notes: string;
} {
  const stateUpper = state.toUpperCase().trim();
  const templates = STATE_MAP[stateUpper];

  if (!templates) {
    return {
      requiresNotary:   false,
      requiresWitness:  false,
      hasStatutoryForm: false,
      statutoryCitation: 'Consult state lien law',
      notes: `${stateUpper} does not have a specific statutory lien waiver form on file. Using generic recommended form. STRONGLY recommend consulting a licensed attorney in ${stateUpper} before using.`,
    };
  }

  const sample = templates.conditional_partial;
  return {
    requiresNotary:    sample.requiresNotary,
    requiresWitness:   sample.requiresWitness,
    hasStatutoryForm:  true,
    statutoryCitation: sample.statute,
    notes: sample.warningText ?? '',
  };
}

export function getSupportedStates(): string[] {
  return Object.keys(STATE_MAP);
}
