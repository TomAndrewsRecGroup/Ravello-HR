# Data Privacy, GDPR & ICO Compliance

**The People System — Admin Portal & Client Portal**
Last updated: April 2026

---

## Overview

The People System processes personal data on behalf of client companies (SMEs with 10–250 employees). This document outlines the technical and organisational measures implemented across both portals to ensure compliance with the **UK General Data Protection Regulation (UK GDPR)**, the **Data Protection Act 2018**, and guidance from the **Information Commissioner's Office (ICO)**.

The People System acts as a **Data Processor** on behalf of its clients (the **Data Controllers**). Where The People System manages its own client relationships and business data, it acts as a **Data Controller** in its own right.

---

## 1. Lawful Basis for Processing

| Data Category | Lawful Basis | Notes |
|---------------|-------------|-------|
| Employee records (name, DOB, NI number, salary) | Legitimate interest / Contract performance | Necessary for HR service delivery on behalf of client companies |
| Candidate data (name, email, CV) | Legitimate interest | Recruitment activities on behalf of clients |
| Client user accounts (email, name, role) | Contract performance | Required for portal access and service delivery |
| Health-related data (sick days, absence records) | Substantial public interest / Employment law obligation | Processed under Schedule 1 of the DPA 2018; necessary for employment management |
| DE&I data (gender, ethnicity, disability status) | Explicit consent / Legitimate interest | Collected for workforce reporting; voluntary disclosure with "Prefer not to say" option on all fields |
| Leave records | Contract performance | Necessary for employment management |

---

## 2. Data Minimisation

### What we collect and why

The portals only collect data that is necessary for HR service delivery:

- **Employee records**: Personal identifiers, employment details, emergency contacts, and leave configuration — all standard for UK employment management
- **Candidate data**: Name, contact details, and application status — minimum required for recruitment
- **Financial data**: Salary and NI numbers — required for payroll and tax compliance
- **No excessive collection**: Fields like gender, ethnicity, and disability status are optional with explicit "Prefer not to say" options

### What we don't collect

- No biometric data
- No location tracking or GPS data
- No browsing behaviour analytics or third-party tracking cookies
- No social media data unless voluntarily provided by candidates

---

## 3. Consent Management

### Technical implementation

The `profiles` table tracks consent per user:

| Field | Purpose |
|-------|---------|
| `privacy_consent_at` | Timestamp when the user consented to the privacy policy |
| `privacy_consent_version` | Version identifier of the privacy policy consented to |
| `marketing_consent` | Explicit opt-in for marketing communications (default: false) |
| `data_processing_consent` | Consent for data processing activities (default: false) |

### Employee data consent

The `employee_records` table includes:

| Field | Purpose |
|-------|---------|
| `data_consent_at` | Timestamp when the employee's data processing was authorised |

### Consent principles

- Consent is **freely given, specific, informed and unambiguous** (GDPR Article 7)
- Marketing consent defaults to `false` (opt-in, not opt-out)
- Consent records are timestamped and versioned for audit purposes
- Withdrawal of consent can be actioned via the data access request system

---

## 4. Data Subject Rights (GDPR Articles 15–22)

The platform implements a formal **Subject Access Request (SAR)** system via the `data_access_requests` table:

| Right | Implementation |
|-------|---------------|
| **Right of Access** (Art. 15) | Users can submit a `request_type: 'access'` request. Administrators process the request and provide data export. |
| **Right to Rectification** (Art. 16) | Users can submit a `request_type: 'rectification'` request. Client admins can update employee records directly. |
| **Right to Erasure** (Art. 17) | Users can submit a `request_type: 'erasure'` request. The `profiles` table tracks `data_erasure_requested_at` and `data_erasure_completed_at`. Employee records support `sensitive_data_redacted` flag for partial erasure. |
| **Right to Data Portability** (Art. 20) | Users can submit a `request_type: 'portability'` request. The HR Reports section provides CSV exports of all personal data. |
| **Right to Restrict Processing** | Account deactivation tracked via `account_deactivated_at` on profiles. |

### Request workflow

1. User submits a data access request (type: access, erasure, rectification, or portability)
2. Request logged with timestamp in `data_access_requests` table
3. Administrators review and process the request
4. Status transitions: `pending` → `processing` → `completed` (or `rejected` with reason)
5. `completed_at` timestamp recorded for audit trail

---

## 5. Data Security Measures

### Authentication & Authorisation

| Measure | Implementation |
|---------|---------------|
| **Authentication** | Supabase Auth with email/password. Magic link invites for new users. Session-based with HTTP-only cookies. |
| **Role-based access control** | 5 roles: `ravello_admin`, `ravello_recruiter`, `client_admin`, `client_viewer`, `client_user`. Each role has defined permissions. |
| **Row-Level Security (RLS)** | PostgreSQL RLS policies on all 47 tables ensure users can only access data belonging to their company. Ravello staff have cross-company access for service delivery. |
| **API route authentication** | All API routes verify the caller is authenticated and has the correct role before processing requests. |
| **Feature flag enforcement** | Server-side feature flag checks redirect users away from features not enabled for their company. |

### Transport & Storage Security

| Measure | Implementation |
|---------|---------------|
| **HTTPS only** | `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` enforced via HTTP headers |
| **Clickjacking protection** | `X-Frame-Options: DENY` prevents embedding in iframes |
| **Content type sniffing** | `X-Content-Type-Options: nosniff` prevents MIME-type attacks |
| **XSS protection** | `X-XSS-Protection: 1; mode=block` plus React's built-in output escaping |
| **Referrer policy** | `strict-origin-when-cross-origin` limits referrer leakage |
| **Permissions policy** | Camera, microphone, and geolocation access disabled |
| **Database encryption** | Supabase encrypts data at rest (AES-256) and in transit (TLS 1.2+) |

### Development Security

| Measure | Implementation |
|---------|---------------|
| **Dev bypass protection** | Development-only authentication bypass is gated behind `NODE_ENV !== 'production'` and cannot be activated in production environments |
| **Service role key isolation** | The Supabase service role key is only used in server-side API routes, never exposed to the client |
| **Input validation** | All API routes validate required fields and enforce constraints (e.g., password minimum length) |

---

## 6. Audit Trail

### Activity logging

The `activity_log` table records data access and changes:

| Field | Purpose |
|-------|---------|
| `company_id` | Which company's data was accessed |
| `user_id` | Who performed the action |
| `event_type` | What action was taken (login, role_created, ticket_resolved, etc.) |
| `title` | Human-readable description of the event |
| `metadata` | Additional context (JSONB) |
| `ip_address` | IP address of the user (for security audit) |
| `user_agent` | Browser/device information |
| `data_category` | Classification: personal_data, employee_data, financial_data, health_data |
| `created_at` | Timestamp of the event |

### Client notes

The `client_notes` table provides an auditable record of all interactions between The People System staff and client companies, including calls, meetings, emails, and decisions.

---

## 7. Data Retention

### Retention principles

- Active employee records are retained for the duration of employment plus the legally required retention period
- Candidate data is retained for the duration of the recruitment process
- Terminated employee records can be redacted using the `sensitive_data_redacted` flag while preserving non-personal aggregate data for reporting
- Audit logs are retained for the legally required period to support compliance verification

### Erasure implementation

When a data erasure request is processed:

1. `data_erasure_requested_at` is set on the user's profile
2. Personal data fields are cleared or anonymised
3. `sensitive_data_redacted` is set to `true` on employee records
4. `data_erasure_completed_at` is set to confirm completion
5. Aggregate/anonymised data may be retained for statistical purposes per GDPR Recital 26

---

## 8. Third-Party Data Processors

| Processor | Purpose | Data Shared | Safeguards |
|-----------|---------|-------------|------------|
| **Supabase** | Database hosting, authentication, file storage | All application data | SOC 2 Type II certified. Data encrypted at rest and in transit. EU/UK data residency available. |
| **Vercel** | Application hosting and deployment | Application code, session data | SOC 2 Type II certified. GDPR DPA available. |
| **Stripe** | E-learning payment processing | Payment details (not stored in our DB) | PCI DSS Level 1 certified. We do not store card numbers — Stripe handles all payment data directly. |
| **IvyLens** | Friction scoring and job analysis | Job description text only (no personal data) | No personal data is shared. Only anonymised role data is transmitted. |
| **Manatal** | ATS integration | Candidate pipeline data | Data processing agreement in place. |

All third-party processors have appropriate Data Processing Agreements (DPAs) in place as required by GDPR Article 28.

---

## 9. International Data Transfers

- Primary data storage is with Supabase, which offers UK/EU region hosting
- Vercel edge functions may process requests in multiple regions but do not persist personal data
- No personal data is transferred to countries without adequate data protection unless appropriate safeguards (Standard Contractual Clauses) are in place
- Stripe processes payment data under their own GDPR compliance framework

---

## 10. Breach Notification

In the event of a personal data breach:

1. **Detection**: Supabase provides real-time monitoring and alerting for unusual database access patterns
2. **Assessment**: The People System team assesses the nature, scope, and risk of the breach
3. **ICO notification**: If the breach is likely to result in a risk to individuals' rights and freedoms, the ICO is notified within **72 hours** as required by GDPR Article 33
4. **Data subject notification**: If the breach is likely to result in a **high risk** to individuals, affected data subjects are notified without undue delay as required by GDPR Article 34
5. **Client notification**: As a data processor, The People System notifies affected client companies (data controllers) without undue delay

---

## 11. Data Protection by Design and Default (GDPR Article 25)

| Principle | Implementation |
|-----------|---------------|
| **Minimisation** | Only necessary data fields are collected. Optional fields clearly marked. |
| **Purpose limitation** | Data is only used for the stated purpose (HR service delivery). Feature flags control which modules each client can access. |
| **Access control** | Role-based permissions ensure users only see what they need. RLS policies enforce this at the database level. |
| **Pseudonymisation** | Employee records support redaction. Aggregate reporting uses anonymised data. |
| **Secure defaults** | Marketing consent defaults to false. New features default to disabled until explicitly enabled. |

---

## 12. ICO Registration

The People System is registered with the Information Commissioner's Office as a data controller and data processor. The registration covers:

- HR consultancy and recruitment services
- Processing of employee data on behalf of client companies
- Direct marketing activities (with consent)

---

## 13. Data Protection Officer

For data protection queries, subject access requests, or to report a concern:

- Contact: [data-protection@thepeoplesystem.co.uk]
- Supervisory authority: Information Commissioner's Office (ICO), https://ico.org.uk

---

## 14. Technical Summary

| Area | Status |
|------|--------|
| Consent tracking | Implemented (profiles table) |
| Subject Access Requests | Implemented (data_access_requests table) |
| Right to erasure | Implemented (erasure fields + redaction flag) |
| Data portability | Implemented (CSV exports in HR Reports) |
| Audit trail | Implemented (activity_log table) |
| Role-based access | Implemented (5 roles + RLS on all tables) |
| API authentication | Implemented (all routes verified) |
| Security headers | Implemented (HSTS, CSP, X-Frame-Options, etc.) |
| Encryption at rest | Via Supabase (AES-256) |
| Encryption in transit | TLS 1.2+ enforced |
| Breach notification process | Documented (72-hour ICO timeline) |
| Third-party DPAs | Required for all processors |
| Development bypass protection | Gated behind NODE_ENV |

---

*This document should be reviewed and updated whenever significant changes are made to data processing activities, third-party integrations, or the technical architecture of the platform.*
