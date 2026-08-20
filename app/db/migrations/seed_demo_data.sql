-- Seed demo data for Beat Procore modules.
-- Run in Supabase SQL editor or via supabase db execute.
-- Safe to re-run: guards with ON CONFLICT DO NOTHING where keys exist.

DO $$
DECLARE
  v_tenant_id UUID := '692d8793-4d9f-4c43-a935-bf56cc637553';
  v_project_id UUID := 'b8ab7fd9-0cc9-443f-b0c8-0b5c8b5f2c5a';
BEGIN

-- Schedule Tasks
INSERT INTO schedule_tasks (tenant_id, project_id, name, phase, start_date, end_date, duration_days, pct_complete, status, priority)
VALUES
  (v_tenant_id, v_project_id, 'Site Mobilization', 'Mobilization', '2026-03-01', '2026-03-14', 14, 100, 'complete', 'high'),
  (v_tenant_id, v_project_id, 'Foundation Excavation', 'Foundation', '2026-03-15', '2026-04-05', 21, 100, 'complete', 'high'),
  (v_tenant_id, v_project_id, 'Foundation Pour', 'Foundation', '2026-04-06', '2026-04-19', 14, 80, 'in_progress', 'high'),
  (v_tenant_id, v_project_id, 'Structural Steel Erection', 'Framing', '2026-04-20', '2026-05-15', 25, 0, 'not_started', 'high'),
  (v_tenant_id, v_project_id, 'MEP Rough-In', 'Rough-In', '2026-05-16', '2026-06-20', 35, 0, 'not_started', 'medium'),
  (v_tenant_id, v_project_id, 'Exterior Envelope', 'Exterior', '2026-06-01', '2026-07-01', 30, 0, 'not_started', 'medium'),
  (v_tenant_id, v_project_id, 'Interior Drywall', 'Drywall', '2026-06-20', '2026-07-20', 30, 0, 'not_started', 'medium'),
  (v_tenant_id, v_project_id, 'Finishes & Flooring', 'Finishes', '2026-07-21', '2026-08-31', 41, 0, 'not_started', 'medium'),
  (v_tenant_id, v_project_id, 'Punch List & Closeout', 'Punch List', '2026-09-01', '2026-09-20', 20, 0, 'not_started', 'low')
ON CONFLICT DO NOTHING;

-- Schedule Milestones
INSERT INTO schedule_milestones (tenant_id, project_id, title, date, status, phase)
VALUES
  (v_tenant_id, v_project_id, 'NTP Issued', '2026-03-01', 'complete', 'Preconstruction'),
  (v_tenant_id, v_project_id, 'Foundation Complete', '2026-04-19', 'pending', 'Foundation'),
  (v_tenant_id, v_project_id, 'Steel Topped Out', '2026-05-15', 'pending', 'Framing'),
  (v_tenant_id, v_project_id, 'Dry-In / Weather Tight', '2026-07-01', 'pending', 'Exterior'),
  (v_tenant_id, v_project_id, 'Certificate of Occupancy', '2026-09-20', 'pending', 'Closeout')
ON CONFLICT DO NOTHING;

-- Punch List Items
INSERT INTO punch_list (tenant_id, project_id, item_number, title, description, location, trade, assigned_to, due_date, priority, status)
VALUES
  (v_tenant_id, v_project_id, 1, 'Touch-up paint on north wall', 'Multiple scuffs and marks on Level 2 north corridor wall', 'Level 2, North Corridor', 'Painting', 'Southwest Painting', '2026-04-25', 'medium', 'open'),
  (v_tenant_id, v_project_id, 2, 'HVAC diffuser loose at Grid B-4', 'Supply air diffuser not properly secured, rattling noise', 'Level 1, Conference Room', 'HVAC', 'Valley Mechanical', '2026-04-22', 'high', 'in_progress'),
  (v_tenant_id, v_project_id, 3, 'Exterior caulking missing at east windows', 'Weep screed caulk missing at 6 window locations on east elevation', 'East Elevation', 'General', 'Desert Glass Co.', '2026-04-28', 'high', 'open'),
  (v_tenant_id, v_project_id, 4, 'Stair handrail loose at Level 3', 'Handrail at stair 2 pulls away from wall — safety issue', 'Stair 2, Level 3', 'General', 'Iron Works LLC', '2026-04-21', 'high', 'open'),
  (v_tenant_id, v_project_id, 5, 'Light switch cover missing Suite 210', 'Blank plate needed at light switch in Suite 210 break room', 'Suite 210', 'Electrical', 'Sunstate Electric', '2026-04-30', 'low', 'open'),
  (v_tenant_id, v_project_id, 6, 'Carpet seam separation Room 104', 'Carpet seam visible and lifting at doorway to Room 104', 'Room 104', 'Flooring', 'AZ Flooring Pros', '2026-04-26', 'medium', 'open')
ON CONFLICT DO NOTHING;

-- Safety Incidents
INSERT INTO safety_incidents (tenant_id, project_id, title, description, incident_type, severity, incident_date, location, reported_by, recordable, osha_reportable, status, root_cause, immediate_actions)
VALUES
  (v_tenant_id, v_project_id, 'Near Miss — Unsecured Load', 'Material bundle nearly fell from elevated platform. Operator caught it before impact. No injuries.', 'near_miss', 'medium', '2026-04-10', 'Level 2 Deck', 'Marcus Johnson', false, false, 'open', 'Inadequate securing of material before lift', 'Lifted materials secured; crew briefed on tie-off requirements'),
  (v_tenant_id, v_project_id, 'First Aid — Laceration', 'Worker received minor laceration on right hand while cutting rebar. Treated on-site.', 'first_aid', 'low', '2026-04-15', 'Foundation Area', 'Site Foreman', false, false, 'closed', 'Improper use of cutting tool, gloves not worn', 'Gloves now mandatory for all rebar operations')
ON CONFLICT DO NOTHING;

-- Safety Talks
INSERT INTO safety_talks (tenant_id, project_id, topic, conducted_by, attendee_count, talk_date, notes)
VALUES
  (v_tenant_id, v_project_id, 'Fall Protection', 'Chad Derocher', 14, '2026-04-14', 'Reviewed 100% tie-off policy above 6 ft. Demonstrated proper harness inspection.'),
  (v_tenant_id, v_project_id, 'Struck-By Hazards', 'Marcus Johnson', 11, '2026-04-07', 'Covered exclusion zones, hard hat requirements, and spotter responsibilities.'),
  (v_tenant_id, v_project_id, 'Heat Illness Prevention', 'Chad Derocher', 16, '2026-03-31', 'Reviewed hydration, rest breaks, and signs of heat exhaustion. Arizona heat protocol activated.')
ON CONFLICT DO NOTHING;

-- Equipment
INSERT INTO equipment (tenant_id, name, type, make, model, year, serial_number, status, current_location)
VALUES
  (v_tenant_id, '50-Ton Grove Crane', 'Crane', 'Grove', 'GMK3055', 2021, 'GMK-21-48291', 'in_use', 'Mesa Commerce Center Site'),
  (v_tenant_id, 'Cat 320 Excavator', 'Excavator', 'Caterpillar', '320D', 2019, 'CAT-319-00843', 'available', 'Company Yard'),
  (v_tenant_id, 'Skid Steer #2', 'Skid Steer', 'Bobcat', 'S650', 2020, 'BOB-S650-7743', 'in_use', 'Mesa Commerce Center Site'),
  (v_tenant_id, 'Man Lift 40ft', 'Scissor Lift', 'JLG', '4069LE', 2022, 'JLG-4069-1122', 'available', 'Company Yard'),
  (v_tenant_id, 'Generator 60KW', 'Generator', 'Generac', 'SG060', 2020, 'GEN-060-5512', 'in_use', 'Mesa Commerce Center Site')
ON CONFLICT DO NOTHING;

-- Meetings
INSERT INTO meetings (tenant_id, project_id, title, meeting_type, meeting_date, location, chair, attendees, agenda_items, notes, action_items, status)
VALUES
  (v_tenant_id, v_project_id, 'OAC Meeting #4 — Mesa Commerce Center', 'OAC', '2026-04-14', 'Project Site Trailer', 'Chad Derocher',
   ARRAY['Chad Derocher - TNT Construction', 'Mark Stevens - Owner Rep', 'Sarah Chen - Architect', 'Tom Garcia - Civil Engineer'],
   ARRAY['1. Schedule update and critical path review', '2. Change order CO-003 discussion', '3. RFI log status', '4. Safety incident report', '5. Next 2-week look-ahead'],
   'Schedule reviewed — foundation pour is 80% complete. CO-003 for additional rebar approved at $42,500. 3 open RFIs need architect response by April 22.',
   '[{"who":"Sarah Chen","what":"Respond to RFI-011, RFI-012, RFI-013","by_when":"2026-04-22","status":"open"},{"who":"Chad Derocher","what":"Submit CO-004 for MEP coordination","by_when":"2026-04-25","status":"open"},{"who":"Mark Stevens","what":"Confirm owner change order authorization level","by_when":"2026-04-21","status":"open"}]'::jsonb,
   'complete')
ON CONFLICT DO NOTHING;

END $$;
