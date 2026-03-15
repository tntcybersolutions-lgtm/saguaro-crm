-- ============================================================
-- MIGRATION 023: Fix RLS — tenant_id = auth.uid() pattern
-- Run this in Supabase SQL Editor → New Query → Run
-- ============================================================

-- ENABLE RLS on every flagged table
ALTER TABLE public.lien_waivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoff_materials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.takeoffs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.w9_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_applications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents              ENABLE ROW LEVEL SECURITY;

-- DROP existing policies (clean slate)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public' AND tablename IN (
    'lien_waivers','takeoff_materials','takeoffs','w9_requests',
    'generated_documents','pay_applications','notifications',
    'insurance_certificates','payroll_records','report_runs','documents'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- ============================================================
-- GENERATED DOCUMENTS — tenant_id = auth.uid()
-- ============================================================
CREATE POLICY "tenant_generated_documents_select" ON public.generated_documents FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "tenant_generated_documents_insert" ON public.generated_documents FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "tenant_generated_documents_update" ON public.generated_documents FOR UPDATE USING (tenant_id = auth.uid());
CREATE POLICY "tenant_generated_documents_delete" ON public.generated_documents FOR DELETE USING (tenant_id = auth.uid());

-- ============================================================
-- INSURANCE CERTIFICATES — tenant_id = auth.uid()
-- ============================================================
CREATE POLICY "tenant_insurance_certificates_select" ON public.insurance_certificates FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "tenant_insurance_certificates_insert" ON public.insurance_certificates FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "tenant_insurance_certificates_update" ON public.insurance_certificates FOR UPDATE USING (tenant_id = auth.uid());
CREATE POLICY "tenant_insurance_certificates_delete" ON public.insurance_certificates FOR DELETE USING (tenant_id = auth.uid());

-- ============================================================
-- NOTIFICATIONS — tenant_id = auth.uid()
-- ============================================================
CREATE POLICY "tenant_notifications_select" ON public.notifications FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "tenant_notifications_insert" ON public.notifications FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "tenant_notifications_update" ON public.notifications FOR UPDATE USING (tenant_id = auth.uid());
CREATE POLICY "tenant_notifications_delete" ON public.notifications FOR DELETE USING (tenant_id = auth.uid());

-- ============================================================
-- PAYROLL RECORDS — tenant_id = auth.uid()
-- ============================================================
CREATE POLICY "tenant_payroll_records_select" ON public.payroll_records FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "tenant_payroll_records_insert" ON public.payroll_records FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "tenant_payroll_records_update" ON public.payroll_records FOR UPDATE USING (tenant_id = auth.uid());
CREATE POLICY "tenant_payroll_records_delete" ON public.payroll_records FOR DELETE USING (tenant_id = auth.uid());

-- ============================================================
-- REPORT RUNS — tenant_id = auth.uid()
-- ============================================================
CREATE POLICY "tenant_report_runs_select" ON public.report_runs FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "tenant_report_runs_insert" ON public.report_runs FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "tenant_report_runs_update" ON public.report_runs FOR UPDATE USING (tenant_id = auth.uid());

-- ============================================================
-- W9 REQUESTS — tenant_id = auth.uid()
-- ============================================================
CREATE POLICY "tenant_w9_requests_select" ON public.w9_requests FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "tenant_w9_requests_insert" ON public.w9_requests FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "tenant_w9_requests_update" ON public.w9_requests FOR UPDATE USING (tenant_id = auth.uid());

-- ============================================================
-- LIEN WAIVERS — project_id (text) → join projects
-- ============================================================
CREATE POLICY "tenant_lien_waivers_select" ON public.lien_waivers FOR SELECT USING (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_lien_waivers_insert" ON public.lien_waivers FOR INSERT WITH CHECK (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_lien_waivers_update" ON public.lien_waivers FOR UPDATE USING (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_lien_waivers_delete" ON public.lien_waivers FOR DELETE USING (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));

-- ============================================================
-- PAY APPLICATIONS — project_id (text) → join projects
-- ============================================================
CREATE POLICY "tenant_pay_applications_select" ON public.pay_applications FOR SELECT USING (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_pay_applications_insert" ON public.pay_applications FOR INSERT WITH CHECK (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_pay_applications_update" ON public.pay_applications FOR UPDATE USING (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_pay_applications_delete" ON public.pay_applications FOR DELETE USING (project_id IN (SELECT id::text FROM public.projects WHERE tenant_id = auth.uid()));

-- ============================================================
-- TAKEOFFS — project_id (uuid) → join projects
-- ============================================================
CREATE POLICY "tenant_takeoffs_select" ON public.takeoffs FOR SELECT USING (project_id IN (SELECT id FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_takeoffs_insert" ON public.takeoffs FOR INSERT WITH CHECK (project_id IN (SELECT id FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_takeoffs_update" ON public.takeoffs FOR UPDATE USING (project_id IN (SELECT id FROM public.projects WHERE tenant_id = auth.uid()));
CREATE POLICY "tenant_takeoffs_delete" ON public.takeoffs FOR DELETE USING (project_id IN (SELECT id FROM public.projects WHERE tenant_id = auth.uid()));

-- ============================================================
-- TAKEOFF MATERIALS — takeoff_id (uuid) → takeoffs → projects
-- ============================================================
CREATE POLICY "tenant_takeoff_materials_select" ON public.takeoff_materials FOR SELECT USING (takeoff_id IN (SELECT t.id FROM public.takeoffs t JOIN public.projects p ON p.id = t.project_id WHERE p.tenant_id = auth.uid()));
CREATE POLICY "tenant_takeoff_materials_insert" ON public.takeoff_materials FOR INSERT WITH CHECK (takeoff_id IN (SELECT t.id FROM public.takeoffs t JOIN public.projects p ON p.id = t.project_id WHERE p.tenant_id = auth.uid()));
CREATE POLICY "tenant_takeoff_materials_update" ON public.takeoff_materials FOR UPDATE USING (takeoff_id IN (SELECT t.id FROM public.takeoffs t JOIN public.projects p ON p.id = t.project_id WHERE p.tenant_id = auth.uid()));
CREATE POLICY "tenant_takeoff_materials_delete" ON public.takeoff_materials FOR DELETE USING (takeoff_id IN (SELECT t.id FROM public.takeoffs t JOIN public.projects p ON p.id = t.project_id WHERE p.tenant_id = auth.uid()));

-- ============================================================
-- DOCUMENTS — user_id (uuid) = auth.uid()
-- ============================================================
CREATE POLICY "owner_documents_select" ON public.documents FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "owner_documents_insert" ON public.documents FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "owner_documents_update" ON public.documents FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "owner_documents_delete" ON public.documents FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- VERIFY
-- ============================================================
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'lien_waivers','takeoff_materials','takeoffs','w9_requests',
    'generated_documents','pay_applications','notifications',
    'insurance_certificates','payroll_records','report_runs','documents'
  )
ORDER BY tablename;
