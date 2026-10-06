-- ═══════════════════════════════════════════════════════════════════
-- 214: seed four starter example document_templates (213)
-- ═══════════════════════════════════════════════════════════════════
-- The user's own recorded decision: the library ships with "a few
-- clearly-marked starter examples", not empty and not a large vetted
-- catalogue. All four rows are inserted with is_example = true (the
-- column default is false — every OTHER template created later, by
-- staff, defaults to NOT an example).
--
-- The "must be reviewed by a qualified advisor" flag lives in
-- `description` (staff-only context) and in the UI's own is_example
-- banner (Group 3), DELIBERATELY NOT baked into `body` itself — body
-- becomes the frozen rendered_body of a real, signed document once a
-- generated instance exists, and a disclaimer permanently embedded in
-- a contract someone has actually signed would be exactly backwards.
-- A genuinely legally-REQUIRED clause (template 4's independent-advice
-- requirement under ERA 1996 s.203) is real content, not a caveat, and
-- stays in the body.
--
-- merge_fields matches MergeFieldDef (lib/documentTemplates/types.ts):
-- {key, label, source: 'employee'|'company'|'date'|'manual',
-- employee_column?}. 'employee' fields read columns that are NOT
-- HR-sensitive (job_title, start_date, work_location, contract_hours,
-- annual_leave_allowance) alongside ones that ARE (salary,
-- salary_currency, pay_frequency) — the generate-document flow (a
-- later group) resolves the sensitive ones via employeePrivate.ts's
-- employee_private_fields(), gated on hr.sensitive.read, never a raw
-- .select().

INSERT INTO public.document_templates (title, category, description, body, merge_fields, requires_signature, is_example, status)
VALUES
(
  'Employment Contract',
  'contract',
  'Full employment contract shell for a permanent UK hire. Example content — have a qualified employment solicitor or HR adviser review and adapt before use with a real employee.',
  $tpl$CONTRACT OF EMPLOYMENT

This Contract of Employment is made between {{company_name}} ("the Employer") and {{employee_name}} ("the Employee").

1. JOB TITLE
The Employee is employed as {{job_title}}.

2. COMMENCEMENT OF EMPLOYMENT
Employment under this contract begins on {{start_date}}. No employment with a previous employer counts towards the Employee's period of continuous employment with the Employer unless otherwise agreed in writing.

3. PROBATIONARY PERIOD
The first {{probation_period}} of employment is a probationary period, during which either party may terminate employment on {{notice_period}} written notice.

4. PLACE OF WORK
The Employee's normal place of work is {{work_location}}. The Employer may require the Employee to work at other locations from time to time.

5. HOURS OF WORK
The Employee's normal hours of work are {{contract_hours}} hours per week, exclusive of breaks, at times to be agreed with the Employee's manager.

6. REMUNERATION
The Employee will be paid a salary of {{salary_currency}}{{salary}} per annum, paid {{pay_frequency}}, by credit transfer to a bank account nominated by the Employee.

7. HOLIDAY ENTITLEMENT
The Employee is entitled to {{annual_leave_allowance}} days' paid holiday per leave year, in addition to public holidays, calculated and taken in accordance with the Employer's holiday policy.

8. NOTICE PERIOD
After the probationary period, either party must give {{notice_period}} written notice to terminate this contract, subject to the statutory minimum notice periods under the Employment Rights Act 1996.

9. CONFIDENTIALITY
The Employee must not, during or after employment, disclose any confidential information belonging to the Employer or its clients, except as required by law or with the Employer's prior written consent.

10. GOVERNING LAW
This contract is governed by the law of England and Wales.

I confirm that I have read, understood and agree to the terms of this contract.

Employee: {{employee_name}}
Date: {{today_date}}

For and on behalf of {{company_name}}
Date: {{today_date}}$tpl$,
  '[
    {"key":"employee_name","label":"Employee name","source":"employee","employee_column":"full_name"},
    {"key":"job_title","label":"Job title","source":"employee","employee_column":"job_title"},
    {"key":"company_name","label":"Company name","source":"company"},
    {"key":"start_date","label":"Start date","source":"employee","employee_column":"start_date"},
    {"key":"work_location","label":"Place of work","source":"employee","employee_column":"work_location"},
    {"key":"contract_hours","label":"Weekly contracted hours","source":"employee","employee_column":"contract_hours"},
    {"key":"salary","label":"Annual salary","source":"employee","employee_column":"salary"},
    {"key":"salary_currency","label":"Salary currency symbol","source":"employee","employee_column":"salary_currency"},
    {"key":"pay_frequency","label":"Pay frequency","source":"employee","employee_column":"pay_frequency"},
    {"key":"annual_leave_allowance","label":"Annual leave allowance (days)","source":"employee","employee_column":"annual_leave_allowance"},
    {"key":"notice_period","label":"Notice period","source":"manual"},
    {"key":"probation_period","label":"Probationary period length","source":"manual"},
    {"key":"today_date","label":"Today''s date","source":"date"}
  ]'::jsonb,
  true, true, 'active'
),
(
  'Written Statement of Particulars',
  'contract',
  'The statutory minimum "Section 1" statement every UK employer must give a worker on or before their first day (Employment Rights Act 1996, sections 1-3, as amended). Shorter than a full contract. Example content — have this reviewed before use.',
  $tpl$WRITTEN STATEMENT OF EMPLOYMENT PARTICULARS

Issued by {{company_name}} to {{employee_name}} in accordance with sections 1 to 3 of the Employment Rights Act 1996 (as amended).

1. EMPLOYER
{{company_name}}

2. EMPLOYEE
{{employee_name}}

3. JOB TITLE
{{job_title}}

4. DATE EMPLOYMENT BEGINS
{{start_date}}. This statement is issued on or before this date, as required by law.

5. PLACE OF WORK
{{work_location}}.

6. HOURS OF WORK
{{contract_hours}} hours per week.

7. PAY
Salary of {{salary_currency}}{{salary}} per annum, paid {{pay_frequency}}.

8. HOLIDAY ENTITLEMENT AND HOLIDAY PAY
{{annual_leave_allowance}} days per leave year, in addition to public holidays. Holiday pay is calculated in accordance with the Employer's current holiday policy.

9. NOTICE PERIOD
{{notice_period}} notice is required by either party to terminate employment, subject to the statutory minimum under the Employment Rights Act 1996.

10. COLLECTIVE AGREEMENTS
There are no collective agreements affecting the terms of this employment.

11. PENSIONS
Details of the Employer's pension arrangements are provided separately, in accordance with the Employer's auto-enrolment duties under the Pensions Act 2008.

12. DISCIPLINARY AND GRIEVANCE PROCEDURES
Full details of the Employer's disciplinary and grievance procedures are available separately and do not form part of this statement.

I acknowledge receipt of this written statement of particulars.

Employee: {{employee_name}}
Date: {{today_date}}$tpl$,
  '[
    {"key":"employee_name","label":"Employee name","source":"employee","employee_column":"full_name"},
    {"key":"job_title","label":"Job title","source":"employee","employee_column":"job_title"},
    {"key":"company_name","label":"Company name","source":"company"},
    {"key":"start_date","label":"Start date","source":"employee","employee_column":"start_date"},
    {"key":"work_location","label":"Place of work","source":"employee","employee_column":"work_location"},
    {"key":"contract_hours","label":"Weekly contracted hours","source":"employee","employee_column":"contract_hours"},
    {"key":"salary","label":"Annual salary","source":"employee","employee_column":"salary"},
    {"key":"salary_currency","label":"Salary currency symbol","source":"employee","employee_column":"salary_currency"},
    {"key":"pay_frequency","label":"Pay frequency","source":"employee","employee_column":"pay_frequency"},
    {"key":"annual_leave_allowance","label":"Annual leave allowance (days)","source":"employee","employee_column":"annual_leave_allowance"},
    {"key":"notice_period","label":"Notice period","source":"manual"},
    {"key":"today_date","label":"Today''s date","source":"date"}
  ]'::jsonb,
  true, true, 'active'
);

INSERT INTO public.document_templates (title, category, description, body, merge_fields, requires_signature, is_example, status)
VALUES
(
  'Disciplinary Hearing Invitation Letter',
  'letter',
  'Invitation to a disciplinary hearing, following the ACAS Code of Practice on disciplinary and grievance procedures. Example content — the allegation, evidence and procedure must be reviewed by HR/legal before sending to a real employee; getting this step wrong is one of the most common causes of an unfair dismissal finding.',
  $tpl$PRIVATE AND CONFIDENTIAL

Dear {{employee_name}},

INVITATION TO A DISCIPLINARY HEARING

I am writing to invite you to a disciplinary hearing to discuss the following allegation(s):

{{allegation_summary}}

The hearing will take place on {{meeting_date}} at {{meeting_time}}, at {{meeting_location}}. It will be conducted by {{investigating_manager_name}}.

If the allegation(s) are upheld, the possible outcomes of this hearing range from no action to a formal warning, up to and including dismissal, depending on the severity of the matter and your explanation.

You have the right to be accompanied at this hearing by a trade union representative or a colleague of your choosing, in accordance with the Employment Relations Act 1999.

Please let me know as soon as possible if you are unable to attend on the date given, so that an alternative time can be arranged. If you fail to attend without good reason, a decision may be made in your absence based on the information available.

If you have any questions before the hearing, please contact me.

Yours sincerely,

{{investigating_manager_name}}
On behalf of {{company_name}}

Date: {{today_date}}$tpl$,
  '[
    {"key":"employee_name","label":"Employee name","source":"employee","employee_column":"full_name"},
    {"key":"company_name","label":"Company name","source":"company"},
    {"key":"meeting_date","label":"Hearing date","source":"manual"},
    {"key":"meeting_time","label":"Hearing time","source":"manual"},
    {"key":"meeting_location","label":"Hearing location","source":"manual"},
    {"key":"allegation_summary","label":"Allegation summary","source":"manual"},
    {"key":"investigating_manager_name","label":"Conducting manager''s name","source":"manual"},
    {"key":"today_date","label":"Today''s date","source":"date"}
  ]'::jsonb,
  false, true, 'active'
),
(
  'Settlement Agreement (Shell)',
  'contract',
  'A skeleton only, not a complete settlement agreement. A settlement agreement is legally binding ONLY if the employee has received advice from a relevant independent adviser (normally a solicitor) on its terms and effect, per section 203 of the Employment Rights Act 1996 — without that advice and a signed adviser certificate, this document has no legal effect. This shell must be completed and reviewed by a qualified employment solicitor before use; do not send to an employee as drafted.',
  $tpl$SETTLEMENT AGREEMENT

This Agreement is made between {{company_name}} ("the Company") and {{employee_name}} ("the Employee").

BACKGROUND

The Employee's employment with the Company will terminate on {{termination_date}}. The parties wish to settle, on the terms set out below, any and all claims the Employee has or may have arising from their employment or its termination.

1. TERMINATION PAYMENT
In full and final settlement of all claims referred to in this Agreement, the Company will pay the Employee the sum of {{settlement_sum}}, subject to the tax treatment set out below.

2. TAX
The parties agree the tax treatment of the payments under this Agreement, to be confirmed with the Employee's independent adviser and the Company's own advisers before signature.

3. WAIVER OF CLAIMS
The Employee agrees to waive the claims listed in the Schedule to this Agreement, to the extent permitted by law, in consideration of the payment above.

4. INDEPENDENT LEGAL ADVICE
The Employee confirms that they have received advice from {{legal_adviser_name}}, a relevant independent adviser as defined by section 203 of the Employment Rights Act 1996, on the terms and effect of this Agreement and its effect on their ability to pursue a claim before an employment tribunal. This Agreement has no effect until the adviser has signed the certificate attached to this Agreement.

5. CONFIDENTIALITY
The parties agree to keep the terms of this Agreement, and the circumstances leading to it, confidential, save as required by law or to their own professional advisers.

6. REFERENCE
The Company agrees to provide a reference in the agreed form attached to this Agreement, on request.

SIGNED:

Employee: {{employee_name}}
Date: {{today_date}}

For and on behalf of {{company_name}}
Date: {{today_date}}

(The Employee's independent adviser's certificate is completed separately and attached to this Agreement.)$tpl$,
  '[
    {"key":"employee_name","label":"Employee name","source":"employee","employee_column":"full_name"},
    {"key":"company_name","label":"Company name","source":"company"},
    {"key":"termination_date","label":"Termination date","source":"manual"},
    {"key":"settlement_sum","label":"Settlement sum","source":"manual"},
    {"key":"legal_adviser_name","label":"Employee''s independent adviser","source":"manual"},
    {"key":"today_date","label":"Today''s date","source":"date"}
  ]'::jsonb,
  true, true, 'active'
);
