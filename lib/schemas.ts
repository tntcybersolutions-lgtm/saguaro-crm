/**
 * Zod Validation Schemas — Saguaro CRM
 * Matches Supabase table schemas exactly.
 * Used with react-hook-form via @hookform/resolvers/zod.
 */
import { z } from 'zod';

/* ── Projects ──────────────────────────────────────────────────────── */
export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  zip: z.string().max(20).optional().or(z.literal('')),
  project_type: z.string().max(100).optional().or(z.literal('')),
  status: z.enum(['planning', 'pre_construction', 'active', 'on_hold', 'complete', 'closed']).default('planning'),
  contract_value: z.coerce.number().min(0).optional().or(z.literal('')),
  budget: z.coerce.number().min(0).optional().or(z.literal('')),
  start_date: z.string().optional().or(z.literal('')),
  end_date: z.string().optional().or(z.literal('')),
  owner_name: z.string().max(200).optional().or(z.literal('')),
  owner_email: z.string().email('Invalid email').optional().or(z.literal('')),
  owner_phone: z.string().max(30).optional().or(z.literal('')),
  description: z.string().max(2000).optional().or(z.literal('')),
});
export type ProjectFormData = z.infer<typeof projectSchema>;

/* ── Invoices ──────────────────────────────────────────────────────── */
export const invoiceSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  vendor_name: z.string().min(1, 'Vendor name is required').max(200),
  invoice_number: z.string().max(50).optional().or(z.literal('')),
  vendor_email: z.string().email('Invalid email').optional().or(z.literal('')),
  description: z.string().max(1000).optional().or(z.literal('')),
  category: z.string().max(100).optional().or(z.literal('')),
  cost_code: z.string().max(50).optional().or(z.literal('')),
  amount: z.coerce.number().min(0, 'Amount must be positive').optional(),
  tax: z.coerce.number().min(0).optional(),
  due_date: z.string().optional().or(z.literal('')),
  status: z.enum(['draft', 'pending', 'sent', 'paid', 'overdue']).default('draft'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});
export type InvoiceFormData = z.infer<typeof invoiceSchema>;

/* ── Schedule Tasks ────────────────────────────────────────────────── */
export const scheduleTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required').max(200),
  projectId: z.string().uuid('Select a project'),
  phase: z.string().max(100).optional().or(z.literal('')),
  start_date: z.string().optional().or(z.literal('')),
  end_date: z.string().optional().or(z.literal('')),
  pct_complete: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(['not_started', 'in_progress', 'complete', 'delayed', 'on_hold']).default('not_started'),
  predecessor: z.string().max(200).optional().or(z.literal('')),
  assigned_to: z.string().max(200).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});
export type ScheduleTaskFormData = z.infer<typeof scheduleTaskSchema>;

/* ── Daily Logs ────────────────────────────────────────────────────── */
export const dailyLogSchema = z.object({
  projectId: z.string().uuid('Select a project'),
  logDate: z.string().default(() => new Date().toISOString().slice(0, 10)),
  weather: z.string().max(50).optional().or(z.literal('')),
  temperatureHigh: z.coerce.number().optional(),
  temperatureLow: z.coerce.number().optional(),
  crewCount: z.coerce.number().min(0).default(0),
  workPerformed: z.string().max(5000).optional().or(z.literal('')),
  delays: z.string().max(2000).optional().or(z.literal('')),
  safetyNotes: z.string().max(2000).optional().or(z.literal('')),
  materialsDelivered: z.string().max(2000).optional().or(z.literal('')),
  visitors: z.string().max(1000).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});
export type DailyLogFormData = z.infer<typeof dailyLogSchema>;

/* ── Bids ──────────────────────────────────────────────────────────── */
export const bidScoreSchema = z.object({
  projectName: z.string().min(1, 'Project name is required'),
  estValue: z.coerce.number().min(1, 'Estimated value is required'),
  trade: z.string().min(1, 'Trade is required'),
  location: z.string().min(1, 'Location is required'),
  targetMargin: z.coerce.number().min(0).max(100, 'Margin must be 0-100'),
});
export type BidScoreFormData = z.infer<typeof bidScoreSchema>;

/* ── Change Orders ─────────────────────────────────────────────────── */
export const changeOrderSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional().or(z.literal('')),
  amount: z.coerce.number(),
  days_impact: z.coerce.number().int().default(0),
  status: z.enum(['draft', 'pending', 'approved', 'rejected']).default('draft'),
  requested_by: z.string().max(200).optional().or(z.literal('')),
  reason: z.string().max(500).optional().or(z.literal('')),
});
export type ChangeOrderFormData = z.infer<typeof changeOrderSchema>;

/* ── RFIs ──────────────────────────────────────────────────────────── */
export const rfiSchema = z.object({
  project_id: z.string().uuid('Select a project'),
  subject: z.string().min(1, 'Subject is required').max(200),
  question: z.string().min(1, 'Question is required').max(5000),
  assigned_to: z.string().max(200).optional().or(z.literal('')),
  due_date: z.string().optional().or(z.literal('')),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  cost_impact: z.coerce.number().optional(),
  schedule_impact_days: z.coerce.number().int().optional(),
});
export type RFIFormData = z.infer<typeof rfiSchema>;

/* ── Contacts ──────────────────────────────────────────────────────── */
export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  company: z.string().max(200).optional().or(z.literal('')),
  role: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});
export type ContactFormData = z.infer<typeof contactSchema>;
