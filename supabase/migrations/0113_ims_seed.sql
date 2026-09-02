-- 0113_ims_seed.sql
--
-- IMS — the vocabulary the module needs on the day it opens: the six
-- standards, the clause trees an auditor navigates by, the five registers
-- Phase 1 ships with, and the certification journey — what we hold, what is
-- underway, what we aim at.
--
-- Run AFTER 0112_ims_core.sql. In Genie's own database.
--
-- The clause numbers and titles are the STANDARDS' OWN, not paraphrases.
-- A clause list that reworded 8.5.1 would be a clause list nobody could
-- reconcile against the certificate, and the evidence matrix hangs off it.
--
-- ISO 27001:2022 additionally carries all 93 Annex A controls (A.5.1–A.5.37,
-- A.6.1–A.6.8, A.7.1–A.7.14, A.8.1–A.8.34), because the Statement of
-- Applicability has to answer for every one of them and typing 93 rows by
-- hand is how three of them go missing.
--
-- Idempotent. Safe to re-run: every insert is guarded.

-- ------------------------------------------------------------- A. STANDARDS
insert into ims_standard (code, name, sys, sort_order) values
  ('ISO9001',  'ISO 9001:2015 — Quality management systems',                    'QMS',  10),
  ('ISO14001', 'ISO 14001:2015 — Environmental management systems',             'EMS',  20),
  ('ISO45001', 'ISO 45001:2018 — Occupational health and safety management',    'OHS',  30),
  ('ISO27001', 'ISO/IEC 27001:2022 — Information security management systems',  'ISMS', 40),
  ('AWSD11',   'AWS D1.1 — Structural Welding Code, Steel',                     'WLD',  50),
  ('EN1090',   'EN 1090-2 — Execution of steel structures (EXC3)',              'WLD',  60)
on conflict (code) do update set name = excluded.name, sys = excluded.sys;

-- --------------------------------------------------------------- B. CLAUSES
insert into ims_standard_clause (standard_id, clause_no, title, parent_clause, sort_order)
select s.id, c.clause_no, c.title, c.parent_clause, c.sort_order
from ims_standard s,
  (values
    ('4', 'Context of the organization', null, 10),
    ('4.1', 'Understanding the organization and its context', '4', 20),
    ('4.2', 'Understanding the needs and expectations of interested parties', '4', 30),
    ('4.3', 'Determining the scope of the quality management system', '4', 40),
    ('4.4', 'Quality management system and its processes', '4', 50),
    ('5', 'Leadership', null, 60),
    ('5.1', 'Leadership and commitment', '5', 70),
    ('5.1.1', 'General', '5.1', 80),
    ('5.1.2', 'Customer focus', '5.1', 90),
    ('5.2', 'Policy', '5', 100),
    ('5.2.1', 'Establishing the quality policy', '5.2', 110),
    ('5.2.2', 'Communicating the quality policy', '5.2', 120),
    ('5.3', 'Organizational roles, responsibilities and authorities', '5', 130),
    ('6', 'Planning', null, 140),
    ('6.1', 'Actions to address risks and opportunities', '6', 150),
    ('6.2', 'Quality objectives and planning to achieve them', '6', 160),
    ('6.3', 'Planning of changes', '6', 170),
    ('7', 'Support', null, 180),
    ('7.1', 'Resources', '7', 190),
    ('7.1.1', 'General', '7.1', 200),
    ('7.1.2', 'People', '7.1', 210),
    ('7.1.3', 'Infrastructure', '7.1', 220),
    ('7.1.4', 'Environment for the operation of processes', '7.1', 230),
    ('7.1.5', 'Monitoring and measuring resources', '7.1', 240),
    ('7.1.6', 'Organizational knowledge', '7.1', 250),
    ('7.2', 'Competence', '7', 260),
    ('7.3', 'Awareness', '7', 270),
    ('7.4', 'Communication', '7', 280),
    ('7.5', 'Documented information', '7', 290),
    ('7.5.1', 'General', '7.5', 300),
    ('7.5.2', 'Creating and updating', '7.5', 310),
    ('7.5.3', 'Control of documented information', '7.5', 320),
    ('8', 'Operation', null, 330),
    ('8.1', 'Operational planning and control', '8', 340),
    ('8.2', 'Requirements for products and services', '8', 350),
    ('8.2.1', 'Customer communication', '8.2', 360),
    ('8.2.2', 'Determining the requirements for products and services', '8.2', 370),
    ('8.2.3', 'Review of the requirements for products and services', '8.2', 380),
    ('8.2.4', 'Changes to requirements for products and services', '8.2', 390),
    ('8.3', 'Design and development of products and services', '8', 400),
    ('8.3.1', 'General', '8.3', 410),
    ('8.3.2', 'Design and development planning', '8.3', 420),
    ('8.3.3', 'Design and development inputs', '8.3', 430),
    ('8.3.4', 'Design and development controls', '8.3', 440),
    ('8.3.5', 'Design and development outputs', '8.3', 450),
    ('8.3.6', 'Design and development changes', '8.3', 460),
    ('8.4', 'Control of externally provided processes, products and services', '8', 470),
    ('8.4.1', 'General', '8.4', 480),
    ('8.4.2', 'Type and extent of control', '8.4', 490),
    ('8.4.3', 'Information for external providers', '8.4', 500),
    ('8.5', 'Production and service provision', '8', 510),
    ('8.5.1', 'Control of production and service provision', '8.5', 520),
    ('8.5.2', 'Identification and traceability', '8.5', 530),
    ('8.5.3', 'Property belonging to customers or external providers', '8.5', 540),
    ('8.5.4', 'Preservation', '8.5', 550),
    ('8.5.5', 'Post-delivery activities', '8.5', 560),
    ('8.5.6', 'Control of changes', '8.5', 570),
    ('8.6', 'Release of products and services', '8', 580),
    ('8.7', 'Control of nonconforming outputs', '8', 590),
    ('9', 'Performance evaluation', null, 600),
    ('9.1', 'Monitoring, measurement, analysis and evaluation', '9', 610),
    ('9.1.1', 'General', '9.1', 620),
    ('9.1.2', 'Customer satisfaction', '9.1', 630),
    ('9.1.3', 'Analysis and evaluation', '9.1', 640),
    ('9.2', 'Internal audit', '9', 650),
    ('9.3', 'Management review', '9', 660),
    ('9.3.1', 'General', '9.3', 670),
    ('9.3.2', 'Management review inputs', '9.3', 680),
    ('9.3.3', 'Management review outputs', '9.3', 690),
    ('10', 'Improvement', null, 700),
    ('10.1', 'General', '10', 710),
    ('10.2', 'Nonconformity and corrective action', '10', 720),
    ('10.3', 'Continual improvement', '10', 730)
  ) as c(clause_no, title, parent_clause, sort_order)
where s.code = 'ISO9001'
on conflict (standard_id, clause_no) do nothing;

insert into ims_standard_clause (standard_id, clause_no, title, parent_clause, sort_order)
select s.id, c.clause_no, c.title, c.parent_clause, c.sort_order
from ims_standard s,
  (values
    ('4', 'Context of the organization', null, 10),
    ('4.1', 'Understanding the organization and its context', '4', 20),
    ('4.2', 'Understanding the needs and expectations of interested parties', '4', 30),
    ('4.3', 'Determining the scope of the environmental management system', '4', 40),
    ('4.4', 'Environmental management system', '4', 50),
    ('5', 'Leadership', null, 60),
    ('5.1', 'Leadership and commitment', '5', 70),
    ('5.2', 'Environmental policy', '5', 80),
    ('5.3', 'Organizational roles, responsibilities and authorities', '5', 90),
    ('6', 'Planning', null, 100),
    ('6.1', 'Actions to address risks and opportunities', '6', 110),
    ('6.1.1', 'General', '6.1', 120),
    ('6.1.2', 'Environmental aspects', '6.1', 130),
    ('6.1.3', 'Compliance obligations', '6.1', 140),
    ('6.1.4', 'Planning action', '6.1', 150),
    ('6.2', 'Environmental objectives and planning to achieve them', '6', 160),
    ('6.2.1', 'Environmental objectives', '6.2', 170),
    ('6.2.2', 'Planning actions to achieve environmental objectives', '6.2', 180),
    ('7', 'Support', null, 190),
    ('7.1', 'Resources', '7', 200),
    ('7.2', 'Competence', '7', 210),
    ('7.3', 'Awareness', '7', 220),
    ('7.4', 'Communication', '7', 230),
    ('7.4.1', 'General', '7.4', 240),
    ('7.4.2', 'Internal communication', '7.4', 250),
    ('7.4.3', 'External communication', '7.4', 260),
    ('7.5', 'Documented information', '7', 270),
    ('7.5.1', 'General', '7.5', 280),
    ('7.5.2', 'Creating and updating', '7.5', 290),
    ('7.5.3', 'Control of documented information', '7.5', 300),
    ('8', 'Operation', null, 310),
    ('8.1', 'Operational planning and control', '8', 320),
    ('8.2', 'Emergency preparedness and response', '8', 330),
    ('9', 'Performance evaluation', null, 340),
    ('9.1', 'Monitoring, measurement, analysis and evaluation', '9', 350),
    ('9.1.1', 'General', '9.1', 360),
    ('9.1.2', 'Evaluation of compliance', '9.1', 370),
    ('9.2', 'Internal audit', '9', 380),
    ('9.2.1', 'General', '9.2', 390),
    ('9.2.2', 'Internal audit programme', '9.2', 400),
    ('9.3', 'Management review', '9', 410),
    ('10', 'Improvement', null, 420),
    ('10.1', 'General', '10', 430),
    ('10.2', 'Nonconformity and corrective action', '10', 440),
    ('10.3', 'Continual improvement', '10', 450)
  ) as c(clause_no, title, parent_clause, sort_order)
where s.code = 'ISO14001'
on conflict (standard_id, clause_no) do nothing;

insert into ims_standard_clause (standard_id, clause_no, title, parent_clause, sort_order)
select s.id, c.clause_no, c.title, c.parent_clause, c.sort_order
from ims_standard s,
  (values
    ('4', 'Context of the organization', null, 10),
    ('4.1', 'Understanding the organization and its context', '4', 20),
    ('4.2', 'Understanding the needs and expectations of workers and other interested parties', '4', 30),
    ('4.3', 'Determining the scope of the OH&S management system', '4', 40),
    ('4.4', 'OH&S management system', '4', 50),
    ('5', 'Leadership and worker participation', null, 60),
    ('5.1', 'Leadership and commitment', '5', 70),
    ('5.2', 'OH&S policy', '5', 80),
    ('5.3', 'Organizational roles, responsibilities and authorities', '5', 90),
    ('5.4', 'Consultation and participation of workers', '5', 100),
    ('6', 'Planning', null, 110),
    ('6.1', 'Actions to address risks and opportunities', '6', 120),
    ('6.1.1', 'General', '6.1', 130),
    ('6.1.2', 'Hazard identification and assessment of risks and opportunities', '6.1', 140),
    ('6.1.3', 'Determination of legal requirements and other requirements', '6.1', 150),
    ('6.1.4', 'Planning action', '6.1', 160),
    ('6.2', 'OH&S objectives and planning to achieve them', '6', 170),
    ('6.2.1', 'OH&S objectives', '6.2', 180),
    ('6.2.2', 'Planning to achieve OH&S objectives', '6.2', 190),
    ('7', 'Support', null, 200),
    ('7.1', 'Resources', '7', 210),
    ('7.2', 'Competence', '7', 220),
    ('7.3', 'Awareness', '7', 230),
    ('7.4', 'Communication', '7', 240),
    ('7.4.1', 'General', '7.4', 250),
    ('7.4.2', 'Internal communication', '7.4', 260),
    ('7.4.3', 'External communication', '7.4', 270),
    ('7.5', 'Documented information', '7', 280),
    ('7.5.1', 'General', '7.5', 290),
    ('7.5.2', 'Creating and updating', '7.5', 300),
    ('7.5.3', 'Control of documented information', '7.5', 310),
    ('8', 'Operation', null, 320),
    ('8.1', 'Operational planning and control', '8', 330),
    ('8.1.1', 'General', '8.1', 340),
    ('8.1.2', 'Eliminating hazards and reducing OH&S risks', '8.1', 350),
    ('8.1.3', 'Management of change', '8.1', 360),
    ('8.1.4', 'Procurement', '8.1', 370),
    ('8.2', 'Emergency preparedness and response', '8', 380),
    ('9', 'Performance evaluation', null, 390),
    ('9.1', 'Monitoring, measurement, analysis and evaluation', '9', 400),
    ('9.1.1', 'General', '9.1', 410),
    ('9.1.2', 'Evaluation of compliance', '9.1', 420),
    ('9.2', 'Internal audit', '9', 430),
    ('9.2.1', 'General', '9.2', 440),
    ('9.2.2', 'Internal audit programme', '9.2', 450),
    ('9.3', 'Management review', '9', 460),
    ('10', 'Improvement', null, 470),
    ('10.1', 'General', '10', 480),
    ('10.2', 'Incident, nonconformity and corrective action', '10', 490),
    ('10.3', 'Continual improvement', '10', 500)
  ) as c(clause_no, title, parent_clause, sort_order)
where s.code = 'ISO45001'
on conflict (standard_id, clause_no) do nothing;

insert into ims_standard_clause (standard_id, clause_no, title, parent_clause, sort_order)
select s.id, c.clause_no, c.title, c.parent_clause, c.sort_order
from ims_standard s,
  (values
    ('4', 'Context of the organization', null, 10),
    ('4.1', 'Understanding the organization and its context', '4', 20),
    ('4.2', 'Understanding the needs and expectations of interested parties', '4', 30),
    ('4.3', 'Determining the scope of the information security management system', '4', 40),
    ('4.4', 'Information security management system', '4', 50),
    ('5', 'Leadership', null, 60),
    ('5.1', 'Leadership and commitment', '5', 70),
    ('5.2', 'Policy', '5', 80),
    ('5.3', 'Organizational roles, responsibilities and authorities', '5', 90),
    ('6', 'Planning', null, 100),
    ('6.1', 'Actions to address risks and opportunities', '6', 110),
    ('6.1.1', 'General', '6.1', 120),
    ('6.1.2', 'Information security risk assessment', '6.1', 130),
    ('6.1.3', 'Information security risk treatment', '6.1', 140),
    ('6.2', 'Information security objectives and planning to achieve them', '6', 150),
    ('6.3', 'Planning of changes', '6', 160),
    ('7', 'Support', null, 170),
    ('7.1', 'Resources', '7', 180),
    ('7.2', 'Competence', '7', 190),
    ('7.3', 'Awareness', '7', 200),
    ('7.4', 'Communication', '7', 210),
    ('7.5', 'Documented information', '7', 220),
    ('7.5.1', 'General', '7.5', 230),
    ('7.5.2', 'Creating and updating', '7.5', 240),
    ('7.5.3', 'Control of documented information', '7.5', 250),
    ('8', 'Operation', null, 260),
    ('8.1', 'Operational planning and control', '8', 270),
    ('8.2', 'Information security risk assessment', '8', 280),
    ('8.3', 'Information security risk treatment', '8', 290),
    ('9', 'Performance evaluation', null, 300),
    ('9.1', 'Monitoring, measurement, analysis and evaluation', '9', 310),
    ('9.2', 'Internal audit', '9', 320),
    ('9.2.1', 'General', '9.2', 330),
    ('9.2.2', 'Internal audit programme', '9.2', 340),
    ('9.3', 'Management review', '9', 350),
    ('9.3.1', 'General', '9.3', 360),
    ('9.3.2', 'Management review inputs', '9.3', 370),
    ('9.3.3', 'Management review results', '9.3', 380),
    ('10', 'Improvement', null, 390),
    ('10.1', 'Continual improvement', '10', 400),
    ('10.2', 'Nonconformity and corrective action', '10', 410),
    ('A.5', 'Organizational controls', 'A', 420),
    ('A.5.1', 'Policies for information security', 'A.5', 430),
    ('A.5.2', 'Information security roles and responsibilities', 'A.5', 440),
    ('A.5.3', 'Segregation of duties', 'A.5', 450),
    ('A.5.4', 'Management responsibilities', 'A.5', 460),
    ('A.5.5', 'Contact with authorities', 'A.5', 470),
    ('A.5.6', 'Contact with special interest groups', 'A.5', 480),
    ('A.5.7', 'Threat intelligence', 'A.5', 490),
    ('A.5.8', 'Information security in project management', 'A.5', 500),
    ('A.5.9', 'Inventory of information and other associated assets', 'A.5', 510),
    ('A.5.10', 'Acceptable use of information and other associated assets', 'A.5', 520),
    ('A.5.11', 'Return of assets', 'A.5', 530),
    ('A.5.12', 'Classification of information', 'A.5', 540),
    ('A.5.13', 'Labelling of information', 'A.5', 550),
    ('A.5.14', 'Information transfer', 'A.5', 560),
    ('A.5.15', 'Access control', 'A.5', 570),
    ('A.5.16', 'Identity management', 'A.5', 580),
    ('A.5.17', 'Authentication information', 'A.5', 590),
    ('A.5.18', 'Access rights', 'A.5', 600),
    ('A.5.19', 'Information security in supplier relationships', 'A.5', 610),
    ('A.5.20', 'Addressing information security within supplier agreements', 'A.5', 620),
    ('A.5.21', 'Managing information security in the ICT supply chain', 'A.5', 630),
    ('A.5.22', 'Monitoring, review and change management of supplier services', 'A.5', 640),
    ('A.5.23', 'Information security for use of cloud services', 'A.5', 650),
    ('A.5.24', 'Information security incident management planning and preparation', 'A.5', 660),
    ('A.5.25', 'Assessment and decision on information security events', 'A.5', 670),
    ('A.5.26', 'Response to information security incidents', 'A.5', 680),
    ('A.5.27', 'Learning from information security incidents', 'A.5', 690),
    ('A.5.28', 'Collection of evidence', 'A.5', 700),
    ('A.5.29', 'Information security during disruption', 'A.5', 710),
    ('A.5.30', 'ICT readiness for business continuity', 'A.5', 720),
    ('A.5.31', 'Legal, statutory, regulatory and contractual requirements', 'A.5', 730),
    ('A.5.32', 'Intellectual property rights', 'A.5', 740),
    ('A.5.33', 'Protection of records', 'A.5', 750),
    ('A.5.34', 'Privacy and protection of PII', 'A.5', 760),
    ('A.5.35', 'Independent review of information security', 'A.5', 770),
    ('A.5.36', 'Compliance with policies, rules and standards for information security', 'A.5', 780),
    ('A.5.37', 'Documented operating procedures', 'A.5', 790),
    ('A.6', 'People controls', 'A', 800),
    ('A.6.1', 'Screening', 'A.6', 810),
    ('A.6.2', 'Terms and conditions of employment', 'A.6', 820),
    ('A.6.3', 'Information security awareness, education and training', 'A.6', 830),
    ('A.6.4', 'Disciplinary process', 'A.6', 840),
    ('A.6.5', 'Responsibilities after termination or change of employment', 'A.6', 850),
    ('A.6.6', 'Confidentiality or non-disclosure agreements', 'A.6', 860),
    ('A.6.7', 'Remote working', 'A.6', 870),
    ('A.6.8', 'Information security event reporting', 'A.6', 880),
    ('A.7', 'Physical controls', 'A', 890),
    ('A.7.1', 'Physical security perimeters', 'A.7', 900),
    ('A.7.2', 'Physical entry', 'A.7', 910),
    ('A.7.3', 'Securing offices, rooms and facilities', 'A.7', 920),
    ('A.7.4', 'Physical security monitoring', 'A.7', 930),
    ('A.7.5', 'Protecting against physical and environmental threats', 'A.7', 940),
    ('A.7.6', 'Working in secure areas', 'A.7', 950),
    ('A.7.7', 'Clear desk and clear screen', 'A.7', 960),
    ('A.7.8', 'Equipment siting and protection', 'A.7', 970),
    ('A.7.9', 'Security of assets off-premises', 'A.7', 980),
    ('A.7.10', 'Storage media', 'A.7', 990),
    ('A.7.11', 'Supporting utilities', 'A.7', 1000),
    ('A.7.12', 'Cabling security', 'A.7', 1010),
    ('A.7.13', 'Equipment maintenance', 'A.7', 1020),
    ('A.7.14', 'Secure disposal or re-use of equipment', 'A.7', 1030),
    ('A.8', 'Technological controls', 'A', 1040),
    ('A.8.1', 'User endpoint devices', 'A.8', 1050),
    ('A.8.2', 'Privileged access rights', 'A.8', 1060),
    ('A.8.3', 'Information access restriction', 'A.8', 1070),
    ('A.8.4', 'Access to source code', 'A.8', 1080),
    ('A.8.5', 'Secure authentication', 'A.8', 1090),
    ('A.8.6', 'Capacity management', 'A.8', 1100),
    ('A.8.7', 'Protection against malware', 'A.8', 1110),
    ('A.8.8', 'Management of technical vulnerabilities', 'A.8', 1120),
    ('A.8.9', 'Configuration management', 'A.8', 1130),
    ('A.8.10', 'Information deletion', 'A.8', 1140),
    ('A.8.11', 'Data masking', 'A.8', 1150),
    ('A.8.12', 'Data leakage prevention', 'A.8', 1160),
    ('A.8.13', 'Information backup', 'A.8', 1170),
    ('A.8.14', 'Redundancy of information processing facilities', 'A.8', 1180),
    ('A.8.15', 'Logging', 'A.8', 1190),
    ('A.8.16', 'Monitoring activities', 'A.8', 1200),
    ('A.8.17', 'Clock synchronization', 'A.8', 1210),
    ('A.8.18', 'Use of privileged utility programs', 'A.8', 1220),
    ('A.8.19', 'Installation of software on operational systems', 'A.8', 1230),
    ('A.8.20', 'Networks security', 'A.8', 1240),
    ('A.8.21', 'Security of network services', 'A.8', 1250),
    ('A.8.22', 'Segregation of networks', 'A.8', 1260),
    ('A.8.23', 'Web filtering', 'A.8', 1270),
    ('A.8.24', 'Use of cryptography', 'A.8', 1280),
    ('A.8.25', 'Secure development life cycle', 'A.8', 1290),
    ('A.8.26', 'Application security requirements', 'A.8', 1300),
    ('A.8.27', 'Secure system architecture and engineering principles', 'A.8', 1310),
    ('A.8.28', 'Secure coding', 'A.8', 1320),
    ('A.8.29', 'Security testing in development and acceptance', 'A.8', 1330),
    ('A.8.30', 'Outsourced development', 'A.8', 1340),
    ('A.8.31', 'Separation of development, test and production environments', 'A.8', 1350),
    ('A.8.32', 'Change management', 'A.8', 1360),
    ('A.8.33', 'Test information', 'A.8', 1370),
    ('A.8.34', 'Protection of information systems during audit testing', 'A.8', 1380)
  ) as c(clause_no, title, parent_clause, sort_order)
where s.code = 'ISO27001'
on conflict (standard_id, clause_no) do nothing;


-- ------------------------------------------------------------- C. REGISTERS
-- All five run on the ONE engine (0001 §G). is_system = true means the MR may
-- edit the columns but nobody may delete the register: an auditor asking for
-- the HIRA must never be told somebody removed it.
insert into ims_register_definition (slug, name, sys, description, columns, is_system, sort_order) values
(
  'risk-opportunity', 'Risk & Opportunity Register', 'QMS',
  'ISO 9001 clause 6.1 — the risks and opportunities the QMS plans against, scored and owned.',
  '[{"key":"ref","label":"Ref","type":"text","required":true},
    {"key":"source","label":"Source","type":"select","options":["Context","Interested party","Process","Audit","Incident","Customer","Other"]},
    {"key":"description","label":"Risk / opportunity","type":"text","required":true},
    {"key":"category","label":"Category","type":"select","options":["Strategic","Operational","Quality","Delivery","Financial","Compliance","Reputational"]},
    {"key":"likelihood","label":"Likelihood (1-5)","type":"number"},
    {"key":"severity","label":"Severity (1-5)","type":"number"},
    {"key":"score","label":"Score","type":"number"},
    {"key":"existing_controls","label":"Existing controls","type":"text"},
    {"key":"action","label":"Action","type":"text"},
    {"key":"owner","label":"Owner","type":"user"},
    {"key":"review_date","label":"Review date","type":"date"},
    {"key":"status","label":"Status","type":"select","options":["Open","Mitigated","Accepted","Closed"]}]'::jsonb,
  true, 10
),
(
  'hira', 'HIRA — Hazard Identification & Risk Assessment', 'OHS',
  'ISO 45001 clause 6.1.2 — every activity, its hazards, the controls, and what risk is left after them.',
  '[{"key":"activity","label":"Activity","type":"text","required":true},
    {"key":"hazard","label":"Hazard","type":"text","required":true},
    {"key":"risk","label":"Risk","type":"text"},
    {"key":"persons_affected","label":"Persons affected","type":"text"},
    {"key":"likelihood","label":"Likelihood (1-5)","type":"number"},
    {"key":"severity","label":"Severity (1-5)","type":"number"},
    {"key":"risk_level","label":"Risk level","type":"select","options":["Low","Medium","High","Extreme"]},
    {"key":"controls","label":"Controls","type":"text"},
    {"key":"residual_risk","label":"Residual risk","type":"select","options":["Low","Medium","High","Extreme"]},
    {"key":"owner","label":"Owner","type":"user"},
    {"key":"review_date","label":"Review date","type":"date"}]'::jsonb,
  true, 20
),
(
  'aspect-impact', 'Aspect–Impact Register', 'EMS',
  'ISO 14001 clause 6.1.2 — what the plant does, what it does to the environment, and under which condition.',
  '[{"key":"activity","label":"Activity","type":"text","required":true},
    {"key":"aspect","label":"Environmental aspect","type":"text","required":true},
    {"key":"impact","label":"Impact","type":"text"},
    {"key":"condition","label":"Condition","type":"select","options":["Normal","Abnormal","Emergency"]},
    {"key":"significance","label":"Significance","type":"select","options":["Significant","Not significant"]},
    {"key":"controls","label":"Controls","type":"text"},
    {"key":"owner","label":"Owner","type":"user"}]'::jsonb,
  true, 30
),
(
  'legal-statutory', 'Legal & Statutory Compliance Register', 'IMS',
  'Every licence, consent, NOC and return in one place — Factory Licence, MPCB Consent to Operate, Fire NOC, DG set, lift and hoist licences. The dated ones also belong in Certificates & Statutory, where the expiry scan can see them.',
  '[{"key":"requirement","label":"Requirement","type":"text","required":true},
    {"key":"act_rule","label":"Act / Rule","type":"text"},
    {"key":"applicability","label":"Applicability","type":"text"},
    {"key":"compliance_status","label":"Compliance status","type":"select","options":["Compliant","Partial","Not compliant","Not applicable"]},
    {"key":"evidence","label":"Evidence","type":"file"},
    {"key":"responsible","label":"Responsible","type":"user"},
    {"key":"next_due","label":"Next due","type":"date"}]'::jsonb,
  true, 40
),
(
  'soa', 'Statement of Applicability', 'ISMS',
  'ISO/IEC 27001:2022 Annex A — all 93 controls, pre-seeded. Every one must be answered applicable or not, and justified either way.',
  '[{"key":"control_ref","label":"Control","type":"text","required":true},
    {"key":"control_name","label":"Control name","type":"text","required":true},
    {"key":"applicable","label":"Applicable","type":"bool"},
    {"key":"justification","label":"Justification","type":"text"},
    {"key":"implementation_status","label":"Implementation status","type":"select","options":["Not started","In progress","Implemented","Not applicable"]},
    {"key":"evidence","label":"Evidence","type":"text"}]'::jsonb,
  true, 50
)
on conflict (slug) do update
  set name = excluded.name, sys = excluded.sys, description = excluded.description,
      columns = excluded.columns, is_system = true;

-- The SoA's 93 rows, taken from the clause table rather than retyped — so the
-- register and the clause tree can never disagree about what Annex A contains.
insert into ims_register_entry (register_id, data, status)
select r.id,
       jsonb_build_object(
         'control_ref',  c.clause_no,
         'control_name', c.title,
         'applicable',   null,
         'justification','',
         'implementation_status','Not started',
         'evidence',     ''),
       'open'
from ims_register_definition r
join ims_standard s on s.code = 'ISO27001'
join ims_standard_clause c on c.standard_id = s.id
where r.slug = 'soa'
  -- The 93 CONTROLS: three-part numbers (A.5.1), not the four theme headings.
  and c.clause_no ~ '^A\.[5-8]\.[0-9]+$'
  and not exists (
    select 1 from ims_register_entry e
    where e.register_id = r.id and e.data->>'control_ref' = c.clause_no
  );

-- ------------------------------------------------- D. CERTIFICATION JOURNEY
-- Statuses left as 'target' deliberately. What Nandan already holds is for
-- Dr Raghu to mark achieved as each certificate goes into the Vault — seeding
-- an optimistic 'achieved' would put a claim in the system that no uploaded
-- certificate backs, which is precisely the thing an auditor looks for.
insert into ims_certification (scheme, body, status, sort_order) values
  ('ISO 9001:2015',            '', 'target', 10),
  ('ISO 14001:2015',           '', 'target', 20),
  ('ISO 45001:2018',           '', 'target', 30),
  ('ISO/IEC 27001:2022',       '', 'target', 40),
  ('AWS D1.1',                 '', 'target', 50),
  ('EN 1090-2 EXC3 (CE / FPC)','', 'target', 60),
  ('ZED',                      'QCI', 'target', 70)
on conflict (scheme) do nothing;

-- The implementation path every 'target' gets. Six steps, the same six every
-- scheme is driven through; each one can spawn a task that somebody owns.
insert into ims_certification_path_step (certification_id, seq, title, description)
select c.id, p.seq, p.title, p.description
from ims_certification c,
  (values
    (10, 'Gap assessment',      'Where we stand against every clause today.'),
    (20, 'Documentation',       'Manual, procedures, work instructions and formats written and approved.'),
    (30, 'Implementation',      'The system run for long enough to produce records.'),
    (40, 'Internal audit',      'Full cycle across every clause and department, findings closed.'),
    (50, 'Management review',   'The review the standard requires, minuted, with actions raised.'),
    (60, 'Certification audit', 'Stage 1 and Stage 2 with the certification body.')
  ) as p(seq, title, description)
where c.status = 'target'
  and not exists (
    select 1 from ims_certification_path_step s
    where s.certification_id = c.id and s.seq = p.seq
  );
