// lib/validate.ts — Central validation used by all forms and API routes

export type ValidationResult = { valid: boolean; errors: Record<string, string> }

export function validateRequired(fields: Record<string, unknown>, required: string[]): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const field of required) {
    const val = fields[field]
    if (val === undefined || val === null || String(val).trim() === '') {
      errors[field] = `${field.replace(/_/g, ' ')} is required`
    }
  }
  return errors
}

export function validateEmail(email: string): string | null {
  if (!email) return 'Email is required'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address'
  return null
}

export function validatePhone(phone: string): string | null {
  if (!phone) return null // optional
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length < 10) return 'Enter a valid 10-digit phone number'
  return null
}

export function validateMoney(val: unknown, fieldName = 'Amount'): string | null {
  const n = Number(val)
  if (isNaN(n)) return `${fieldName} must be a number`
  if (n < 0) return `${fieldName} cannot be negative`
  if (n > 999_999_999) return `${fieldName} is too large`
  return null
}

export function validatePositiveInt(val: unknown, fieldName = 'Value'): string | null {
  const n = Number(val)
  if (isNaN(n) || !Number.isInteger(n)) return `${fieldName} must be a whole number`
  if (n < 0) return `${fieldName} cannot be negative`
  return null
}

export function validateHours(hours: unknown): string | null {
  const n = Number(hours)
  if (isNaN(n)) return 'Hours must be a number'
  if (n < 0) return 'Hours cannot be negative'
  if (n > 24) return 'Cannot enter more than 24 hours per day'
  return null
}

export function validateDate(val: string, fieldName = 'Date'): string | null {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d.getTime())) return `${fieldName} is not a valid date`
  return null
}

export function validateDateRange(start: string, end: string): string | null {
  if (!start || !end) return null
  if (new Date(start) > new Date(end)) return 'Start date must be before end date'
  return null
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  if (!/[A-Z]/.test(password)) return 'Password needs at least one uppercase letter'
  if (!/[0-9]/.test(password)) return 'Password needs at least one number'
  return null
}

export function validateProject(data: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const req = validateRequired(data, ['name'])
  Object.assign(errors, req)
  if (data.contract_value !== undefined && data.contract_value !== '') {
    const moneyErr = validateMoney(data.contract_value, 'Contract value')
    if (moneyErr) errors.contract_value = moneyErr
  }
  if (data.start_date && data.estimated_completion) {
    const rangeErr = validateDateRange(String(data.start_date), String(data.estimated_completion))
    if (rangeErr) errors.estimated_completion = rangeErr
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateSubcontractor(data: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const req = validateRequired(data, ['company_name'])
  Object.assign(errors, req)
  if (data.contact_email) {
    const emailErr = validateEmail(String(data.contact_email))
    if (emailErr) errors.contact_email = emailErr
  }
  if (data.contact_phone) {
    const phoneErr = validatePhone(String(data.contact_phone))
    if (phoneErr) errors.contact_phone = phoneErr
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateTimecard(data: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const req = validateRequired(data, ['employee_id', 'work_date'])
  Object.assign(errors, req)
  const hoursErr = validateHours(data.regular_hours)
  if (hoursErr) errors.regular_hours = hoursErr
  if (data.overtime_hours) {
    const otErr = validateHours(data.overtime_hours)
    if (otErr) errors.overtime_hours = otErr
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateBudgetItem(data: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const req = validateRequired(data, ['csi_division'])
  Object.assign(errors, req)
  const moneyErr = validateMoney(data.budget_amount, 'Budget amount')
  if (moneyErr) errors.budget_amount = moneyErr
  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateRFI(data: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const req = validateRequired(data, ['subject', 'question'])
  Object.assign(errors, req)
  if (data.due_date) {
    const dateErr = validateDate(String(data.due_date), 'Due date')
    if (dateErr) errors.due_date = dateErr
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

export function validateChangeOrder(data: Record<string, unknown>): ValidationResult {
  const errors: Record<string, string> = {}
  const req = validateRequired(data, ['title', 'cost_impact'])
  Object.assign(errors, req)
  const moneyErr = validateMoney(data.cost_impact, 'Cost impact')
  if (moneyErr) errors.cost_impact = moneyErr
  if (data.schedule_impact !== undefined) {
    const dayErr = validatePositiveInt(data.schedule_impact, 'Schedule impact')
    if (dayErr) errors.schedule_impact = dayErr
  }
  return { valid: Object.keys(errors).length === 0, errors }
}

// Supabase error → human readable message
export function humanizeSupabaseError(error: { message?: string; code?: string; details?: string }): string {
  const msg = error.message || ''
  const code = error.code || ''

  if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique')) {
    if (msg.includes('email')) return 'This email address is already in use'
    if (msg.includes('company_name')) return 'A subcontractor with this company name already exists'
    if (msg.includes('license_number')) return 'This license number is already registered'
    if (msg.includes('rfi_number')) return 'An RFI with this number already exists'
    return 'A duplicate record already exists'
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return 'This record is linked to other data and cannot be deleted. Remove linked items first.'
  }
  if (code === '42501' || msg.includes('permission denied') || msg.includes('row-level')) {
    return 'You do not have permission to perform this action'
  }
  if (code === '23514' || msg.includes('check constraint')) {
    if (msg.includes('positive')) return 'Value must be greater than zero'
    if (msg.includes('status')) return 'Invalid status value'
    return 'Invalid data — please check your inputs'
  }
  if (msg.includes('JWT expired') || msg.includes('not authenticated')) {
    return 'Your session has expired. Please sign in again.'
  }
  if (msg.includes('connection') || msg.includes('timeout')) {
    return 'Connection error. Please check your internet and try again.'
  }
  return msg || 'An unexpected error occurred. Please try again.'
}
