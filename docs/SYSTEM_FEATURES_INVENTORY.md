# Ravello HR — System Features Inventory

**As of 24 September 2026.** Covers both apps: the **Admin app** (People System staff) and the **Client Portal** (client companies).

## How each feature is rated

| Column | What it means | How it was checked |
|---|---|---|
| **Built** | ✅ Complete: works end to end · 🟡 Partial: works but part is missing, or it depends on an integration that isn't set up · ❌ Broken: a defect stops it working | Every page, button and back-end route in both apps was read |
| **Tested** | ✅ Automated tests cover it · 🟡 Partly covered · — No automated tests | All test suites run today. **Admin: 359 tests pass. Portal: 27 tests pass.** No record of manual testing exists in the system, so this column covers automated tests only |
| **In use** | ✅ Live: real records in the live database · ⚪ Not used yet: zero records · 🔒 Not switched on: needs an account or key first (e.g. Stripe) | Row counts read directly from the live database today |

## Headline picture

- **In real daily use.** Three things carry the platform today:
  - **Referral pipeline:** 1,510 applicants processed, 736 invites sent, runs every hour.
  - **Publishing roles to Manatal.**
  - **Athletes To Industry:** 18 athletes and 11 development plans.
- **Built but never used.** The HR consultancy side has **zero records** so far: tickets, service requests, compliance, documents, employee records, leave, onboarding/offboarding, reviews, training, BD pipeline, tasks and billing. The code is there, but no client has used it yet.
- **Live clients:** 2 companies (Andrews Recruitment Group and Old Albanians Rugby) and 6 user logins (2 staff, 4 client admins). Both clients last logged in on 22 Sep.
- **Payments (Stripe):** built, but no payment or subscription has ever been recorded.
- **Tests:** concentrated on the referral pipeline, Manatal publishing and email branding. Most other features have no automated tests, and the portal has almost none.

---

## ⚠️ Issues found during this review (fix before relying on these features)

| # | App | Issue in plain terms | Impact |
|---|---|---|---|
| 1 | Portal | **The employee "request leave" link does not work.** Employees who open their personal leave link are sent to the login screen instead of the form. That page is missing from the list of pages allowed without a login. | Employees cannot request leave through the link at all |
| 2 | Portal | **Leave is recorded in two separate places that never meet.** Leave requested or approved through the link or the Absence page is not shown on the Calendar or in HR Reports leave balances, which read a different table. | Leave balances and calendar will be wrong once used |
| 3 | Admin | **The Roadmap page is broken.** It asks the database for a column (`track`) that does not exist, so the page errors or shows nothing. | Cross-client roadmap unusable |
| 4 | Portal | **Candidates an admin "Sends" to a client get no Approve/Reject buttons.** The buttons only appear for candidates in "pending" status. The admin Send button marks candidates "shared", so the client sees the candidate and a badge but cannot act. | Clients cannot give feedback on candidates sent the normal way |
| 5 | Admin | **Replying to a client's service request never emails the client.** The notes are saved and the email template exists, but nothing sends it. | Client doesn't know you've responded unless they log in |
| 6 | Both | **Module switches only hide menu items.** Most client pages still open if someone types the web address directly, even with that module switched off. Many finer-grained switches (org chart, skills, calendar, benchmarks and others) are never checked at all. | Clients could reach modules they haven't paid for |
| 7 | Portal | **Seven finished pages have no link to them:** HR Dashboard, Performance Reviews, Training Needs, Skills Matrix, Absence, Employee Documents, People Roadmap (plus Hiring Analytics). | Clients can't find them |
| 8 | Email | **The daily email sending limit was hit on 22–23 Sep.** 24 candidates' invites failed. 21 went through on a later attempt and **3 never received theirs**. | Plan upgrade may be needed as volume grows |
| 9 | Portal | The Protect Reports upgrade link points to `hello@thepeopleoffice.co.uk`, which looks like the wrong domain. | Upgrade enquiries could go nowhere |
| 10 | Portal | The role page's "recruiter notes" and "interview stages" sections always show empty (the data is never fetched). | Clients never see those notes |

---

# ADMIN APP (People System staff)

### Dashboard
| Feature | Built | Tested | In use |
|---|---|---|---|
| See headline numbers (clients, open roles, tickets, users) and alerts (overdue compliance, expiring documents, pending absences, open requests) | ✅ | — | ✅ (mostly zeros today) |
| "New Client" shortcut into the onboarding wizard | ✅ | — | ✅ |

### Clients
| Feature | Built | Tested | In use |
|---|---|---|---|
| List all clients with health indicators, search and filter | ✅ | — | ✅ (2 clients) |
| Onboard a new client, a 5-step wizard: details, modules, billing, users, review. It creates the client, a Manatal organisation, a Stripe subscription and a welcome email, and invites users | ✅ (Stripe part 🔒) | — | ✅ |
| Switch a client active/inactive; archive, unarchive or permanently delete (wipes their files) | ✅ | — | ✅ |
| Upload the client's logo | ✅ | — | ✅ |
| Link the client to Manatal (enter an ID or "Create in Manatal") | ✅ | — | ✅ |
| Set the monthly retainer, which creates or updates the Stripe subscription and sends a billing email | 🟡 needs Stripe | — | 🔒 |
| Raise a one-off invoice and view past invoices | 🟡 needs Stripe | — | 🔒 (0 invoices) |
| Invite a portal user for the client and choose their role | ✅ | — | ✅ (4 client users) |
| Turn modules on/off per client (feature switches) | ✅ | — | ✅ |
| Internal notes timeline: add, pin, delete | ✅ | — | ⚪ |
| See the log of emails sent to the client; email any client user | ✅ | — | ✅ |
| Client's roles list | ✅ | — | ✅ |
| Add candidates for a client; mark "approved for client" | ✅ | 🟡 | ✅ |
| Client documents: view, download, approve | ✅ | 🟡 | ⚪ |
| Client roadmap milestones: add, change status (quarters fixed to 2026, owners fixed to Lucy/Tom) | 🟡 | — | ⚪ |
| Client action items: add, mark complete | ✅ | — | ⚪ |
| Client compliance items: add, change status | ✅ | — | ⚪ |
| LEAD tab: training needs and review reminders | ✅ | — | ⚪ |
| PROTECT tab: upload employee documents; approve/reject absence | ✅ | 🟡 | ⚪ |
| Friction tab: company friction items, mark resolved | ✅ | — | ⚪ |
| **Users page:** list all users, change role, resend invite, send password reset, delete user, email user | ✅ | 🟡 | ✅ |
| **Engagement page:** logins and activity per client | ✅ | 🟡 | ✅ (view only) |
| **Feature Flags page:** set modules for every client in one place | ✅ | — | ✅ |

### Hiring
| Feature | Built | Tested | In use |
|---|---|---|---|
| All roles across clients: filter, sort, search | ✅ | — | ✅ (3 roles) |
| Create a new role (full form, start from a JD template, instant friction score from IvyLens) | ✅ | — | ✅ |
| Role page: change hiring stage, assign recruiter | ✅ | 🟡 | ✅ |
| Edit job-board details (headcount, currency, hourly/annual, salary visible) | ✅ | ✅ | ✅ |
| **Publish / re-publish the role to Manatal** (formatted advert, salary, location, criteria) | ✅ | ✅ | ✅ (11 publishes) |
| "Diagnose" why a role won't publish | ✅ | ✅ | ✅ |
| Analyse / re-analyse the role in IvyLens | ✅ | 🟡 | ✅ |
| See live Manatal applicants (25 per page, newest first) and move their stage in Manatal | ✅ | ✅ | ✅ |
| Scan one candidate's CV against the role and save them | ✅ | 🟡 | ✅ |
| "Scan applicants now" (run the referral scan for this role on demand) | ✅ | ✅ | ✅ |
| Referral settings per role: partner, link, score thresholds, dry run, blocked countries, must-have criteria | ✅ | ✅ | ✅ (3 roles configured) |
| "Email me a preview" of the referral invite | ✅ | ✅ | ✅ |
| Record offers and change their status | ✅ | — | ⚪ |
| Schedule interviews, record outcome and feedback | ✅ | — | ⚪ |
| Role's candidate list (25 per page; referral candidates show their referral outcome) | ✅ | 🟡 | ✅ (2,226 candidates) |
| Hiring analytics (pipeline, offers) | ✅ | — | ⚪ (little data) |
| JD templates: create, edit, delete, use | ✅ | — | ⚪ |
| All Candidates: edit screening score and stage; **Send candidate to client** by email | ✅ | — | ✅ |
| Salary benchmarks: add/delete (no edit) | ✅ | — | ⚪ |
| IvyLens market salary lookup | ✅ | 🟡 | ✅ (1 lookup) |

### Referrals (automated referral pipeline)
| Feature | Built | Tested | In use |
|---|---|---|---|
| **Hourly automatic scan:** reads new Manatal applicants, checks country, IvyLens-scores the CV, checks must-haves, emails qualifiers the partner referral link | ✅ | ✅ | ✅ **476 successful runs; 1,510 applicants; 736 invites sent** |
| Referral funnel and review queue: sort, filter, page, see scan details | ✅ | 🟡 | ✅ |
| Approve/Reject review-queue candidates; "Send invite" to held candidates; "send anyway" override | ✅ | ✅ | ✅ |
| Move a referral on to later stages (applied, accepted, etc.) | ✅ | ✅ | ⚪ (none past "email sent" yet) |

### Intelligence
| Feature | Built | Tested | In use |
|---|---|---|---|
| BD pipeline: prospect list or drag-and-drop board, notes, status, IvyLens leads | ✅ | — | ⚪ (0 prospects) |
| Convert a prospect into a client (auto-creates compliance items and a welcome action) | ✅ | — | ⚪ |
| BD Roles: scanned job adverts from prospects | ✅ (relies on an outside scraper) | 🟡 | ⚪ (0 roles) |
| Health Status: IvyLens call volume, errors, speed; "Run probe" test | ✅ | — | ✅ (3,330 calls logged) |
| Per-client red/amber/green health and database security check | ✅ | — | ✅ (view only) |

### Operations
| Feature | Built | Tested | In use |
|---|---|---|---|
| Internal task board (To Do / In Progress / Done) | ✅ | 🟡 | ⚪ |
| Activity feed (last 7 days) | ✅ | — | ✅ (view only) |
| Enquiries inbox and top-bar enquiries drop-down | ✅ (nothing feeds it yet) | — | ⚪ |
| Service requests: view, change status, write response notes | 🟡 client not emailed (Issue 5) | — | ⚪ |
| Support tickets: view, reply, change status | ✅ | 🟡 | ⚪ |
| Broadcast an action item to many clients at once (emails them) | ✅ | 🟡 | ⚪ |
| Cross-client compliance dashboard: add, complete, delete items; document expiry alerts | ✅ | — | ⚪ |

### Programmes — Athletes To Industry and Development Plans
| Feature | Built | Tested | In use |
|---|---|---|---|
| Copy a client's athlete sign-up and partner enquiry links | ✅ | — | ✅ |
| Industry partners: add, edit, turn on/off, delete, logo, roles | ✅ | — | ✅ (6 partners) |
| Training providers: add, edit, delete, offerings | ✅ | — | ✅ (2 providers) |
| Add an athlete with CV; welcome email sent automatically | ✅ | ✅ | ✅ (18 athletes) |
| Upload/replace/view CV; delete athlete; filter by client | ✅ | 🟡 | ✅ |
| Resend athlete welcome email | ✅ | ✅ | ✅ (12 athlete emails) |
| Match athletes to partner roles or training offerings; track interest status | ✅ | — | ✅ (5 interests) |
| Athlete profile: mark called, phone, plans, email history | ✅ | — | ✅ |
| Development plans: list, create with the wizard, edit content, milestones and strengths chart, brand styling (pull branding from a website) | ✅ | 🟡 | ✅ (11 plans, 35 milestones) |
| Save a plan as a template; delete; email from the plan; print/PDF preview | ✅ | — | ✅ (1 template) |

### Business
| Feature | Built | Tested | In use |
|---|---|---|---|
| Revenue dashboard (monthly recurring revenue, at-risk subscriptions) | 🟡 needs Stripe | — | 🔒 |
| Value Reports: monthly client value report as a PDF | ✅ | 🟡 | ⚪ (no client data yet) |
| Cross-client Roadmap | ❌ (Issue 3) | 🟡 | ⚪ |
| CSV exports (roles, candidates, compliance, tickets) | ✅ | 🟡 | ✅ available |
| Upload a report for a client | ✅ | 🟡 | ⚪ |
| All documents: view, download, upload for a client | ✅ | 🟡 | ⚪ |
| Latest Updates: add news items from links; publish/hide | ✅ | — | ⚪ |
| News feed sources pulled in hourly (RSS/website) | ✅ | 🟡 | ⚪ (no sources set up) |
| E-learning content: add, publish, feature (no edit/delete) | 🟡 limited | 🟡 | ✅ (1 course) |

### Account, shell and automations
| Feature | Built | Tested | In use |
|---|---|---|---|
| Staff login / sign out; non-staff blocked (no "forgot password" on admin login) | ✅ | ✅ | ✅ |
| Your own email-sending settings (SMTP) with a test send | ✅ | — | ✅ (athlete emails go via SMTP) |
| "Send email" pop-up from any page, with attachments; every send logged | ✅ | ✅ | ✅ (1,469 emails logged) |
| Global search; notification bell; client switcher | ✅ | — | ✅ |
| Sidebar navigation and breadcrumbs | ✅ | ✅ | ✅ |
| Error monitoring (Sentry) | 🟡 not connected | ✅ | 🔒 |
| Usage limits to protect paid services | ✅ | — | ✅ |
| Stripe payment sync (automatic) | 🟡 needs Stripe | ✅ | 🔒 (0 events) |
| Nightly clean-up of old news and email attachments | ✅ | ✅ | ✅ |

---

# CLIENT PORTAL (client companies)

### Every page
| Feature | Built | Tested | In use |
|---|---|---|---|
| Menu with red badges (actions, tickets, candidates to review) | ✅ | — | ✅ |
| Reorder or hide menu items ("Customise menu") | ✅ | — | ✅ |
| Locked modules show "not in your package" with account manager contact | ✅ | — | ✅ (Old Albanians) |
| Quick Actions button (raise role, log leave, ticket, upload, add employee…), customisable | ✅ | — | ✅ |
| Notification bell | ✅ | — | ⚪ (0 notifications) |
| Open private files through secure time-limited links | ✅ | — | ⚪ |
| Archived clients are locked out; new paid clients go to the setup wizard first | ✅ | — | ✅ |

### Dashboard
| Feature | Built | Tested | In use |
|---|---|---|---|
| Greeting and stat cards (roles, tickets, compliance, documents, actions) | ✅ | — | ✅ |
| Company Friction Score card or "Get your score" | ✅ | — | ⚪ (0 assessments) |
| "Needs your attention" strip; live roles carousel; compliance, tickets and documents panels; active services | ✅ | — | ✅ (mostly empty) |
| LEAD/PROTECT summary cards (training, absences) | 🟡 data fetched but never shown | — | ⚪ |

### HIRE
| Feature | Built | Tested | In use |
|---|---|---|---|
| See all roles with stage | ✅ | — | ✅ |
| Raise a new role (template, JD upload, IvyLens analysis fills the form) | ✅ (analysis needs IvyLens) | — | ⚪ (no client-raised roles yet) |
| Role page: details, stage tracker, friction score | ✅ | — | ✅ |
| **Review shortlisted candidates: view CV, approve, reject, ask for info** | 🟡 (Issue 4) | — | ⚪ |
| Mark a candidate hired (creates employee, fills role) | ✅ | — | ⚪ |
| See interview schedule | ✅ | — | ⚪ |
| Create offers and track status | ✅ | — | ⚪ |
| Live Manatal pipeline: see candidates by stage, move stage | ✅ (needs Manatal link) | — | ✅ (ARG only) |
| Internal roles: internal applicants, stages, convert to employee, upgrade to a managed search | ✅ | — | ⚪ |
| Cost of hire calculator (NI, pension; 2025/26 rates fixed in code) | ✅ | — | ✅ available |
| Cost of an unfilled vacancy calculator | ✅ | — | ✅ available |
| Friction Lens company assessment (questionnaire, score, retake) | 🟡 needs IvyLens | — | ⚪ |
| Metrics dashboard (hiring, candidates, compliance, support, LEAD/PROTECT) | ✅ | — | ✅ (little data) |
| Salary benchmarks comparison | ✅ | — | ⚪ (0 benchmarks) |
| Hiring analytics (funnel, time to fill) | ✅ but no link to it | 🟡 | ⚪ |

### LEAD (people)
| Feature | Built | Tested | In use |
|---|---|---|---|
| Employee records: add, edit, search (job, salary, diversity, leave allowance) | ✅ | — | ⚪ (0 employees) |
| Share / regenerate an employee's personal leave link | ✅ but the link is broken (Issue 1) | — | ⚪ |
| Org chart: view, search, drag to change manager, import from CSV | ✅ | — | ⚪ |
| Onboarding checklists: templates, start, tick tasks, complete | ✅ | — | ⚪ |
| Company documents: browse by category, upload | ✅ | — | ⚪ |
| Policy sign-off requests and tracking | 🟡 no email or signing page for employees; admin marks it for them | — | ⚪ |
| E-learning: browse, search, filter, recommendations, course pages | ✅ | — | ✅ (1 course) |
| Free course access (7 days) | ✅ | — | ⚪ |
| Buy a course by card | 🟡 needs Stripe | — | 🔒 |
| HR reports (growth, diversity, leave balances, departments) with CSV export | ✅ (leave figures affected by Issue 2) | — | ⚪ |
| Performance reviews | ✅ but no link to it | — | ⚪ |
| Training needs | ✅ but no link to it | — | ⚪ |
| Skills matrix (add only, no edit/delete) | 🟡 no link to it | — | ⚪ |
| People roadmap (view only) | ✅ but no link to it | — | ⚪ |

### PROTECT (compliance and risk)
| Feature | Built | Tested | In use |
|---|---|---|---|
| Action items from The People System: complete, snooze 7 days | ✅ | — | ⚪ |
| Compliance tracker: move items through pending, in review, complete | ✅ | — | ⚪ |
| Offboarding checklists: templates, start (sets leaver date), tasks, exit notes | ✅ | — | ⚪ |
| Reports: CSV exports and download reports published by The People System | ✅ (Issue 9) | — | ⚪ |
| Absence: log, approve, deny with reason | ✅ but no link to it (Issue 2) | — | ⚪ |
| Employee documents with expiry (paste a link, no file upload) | 🟡 no link to it | — | ⚪ |
| HR dashboard (headcount, turnover, absence KPIs) | ✅ but no link to it | — | ⚪ |

### Athletes To Industry and Development Plans
| Feature | Built | Tested | In use |
|---|---|---|---|
| Athlete roster, view CVs | ✅ | 🟡 | ✅ |
| Add/edit athlete with CV (welcome email next business day) | ✅ | ✅ | ✅ |
| Copy athlete sign-up and partner enquiry links | ✅ | — | ✅ |
| Browse partners and their roles; register interest for an athlete | ✅ | — | ✅ |
| Browse training providers; register interest | ✅ | — | ✅ |
| View development plans assigned by The People System; print/PDF | ✅ | — | ✅ |

### Calendar
| Feature | Built | Tested | In use |
|---|---|---|---|
| Month view of company events and leave | ✅ | — | ⚪ |
| Add company event; log employee leave (admin only) | ✅ (Issue 2) | — | ⚪ |

### Support
| Feature | Built | Tested | In use |
|---|---|---|---|
| See my tickets and service requests with The People System's responses | ✅ | — | ⚪ |
| Raise a request: policy update, salary benchmark, manager support, book strategic review, HR audit, general query | ✅ | — | ⚪ (0 requests) |
| Read and reply to a ticket thread | ✅ | — | ⚪ |
| IvyLens product support tickets | 🟡 needs IvyLens | — | ⚪ |
| Automatic ticket-update notifications | ❌ never runs (nothing triggers it) | — | ⚪ |

### Billing (client admins, paid clients only)
| Feature | Built | Tested | In use |
|---|---|---|---|
| See retainer/subscription status and "Pay now" for unpaid invoices | 🟡 needs Stripe | — | 🔒 |
| Manage card and invoices (Stripe billing portal) | 🟡 needs Stripe | — | 🔒 |

### Settings
| Feature | Built | Tested | In use |
|---|---|---|---|
| Edit company profile (name, sector, size, hours, timezone, currency) | ✅ | — | ✅ |
| Edit own name; customise Quick Actions | ✅ | — | ✅ |
| Email notification preferences | 🟡 saved in the browser only ("coming soon") | — | ⚪ |
| Team list with seats used; invite a team member (seat limit applies) | ✅ | ✅ (invite email) | ✅ |

### First-login setup wizard (paid clients)
| Feature | Built | Tested | In use |
|---|---|---|---|
| Welcome: name, sector, size | ✅ | — | ⚪ (both clients "not started") |
| Friction Lens assessment (optional, skippable) | 🟡 needs IvyLens | — | ⚪ |
| Invite a colleague; add first employee; finish | ✅ | — | ⚪ |

### Public pages (no login needed)
| Feature | Built | Tested | In use |
|---|---|---|---|
| Athlete sign-up form via a client's link (with CV; welcome email sent) | ✅ | ✅ (email) | ✅ |
| Partner enquiry form via a client's link (emails Tom) | ✅ | ✅ (email) | ✅ (nothing stored to count) |
| Employee leave request via a personal link | ❌ (Issue 1) | — | ⚪ |

### Login
| Feature | Built | Tested | In use |
|---|---|---|---|
| Log in; sign out | ✅ | — | ✅ |
| Forgotten password (6-digit emailed code) | ✅ | — | ✅ |
| Accept invite and set password | ✅ | — | ✅ |

---

## Summary counts

| | Admin | Portal |
|---|---|---|
| Features listed | 89 | 75 |
| Built but not fully working (🟡 or ❌) | 9 | 14 (plus 8 finished pages with no link to them) |
| Covered by automated tests (✅ or 🟡) | 42 | 6 |
| In live use today | 55 | 28 (mostly Athletes To Industry, settings and the shell) |

**Integrations not switched on:** Stripe (payments, billing, revenue), Sentry (error monitoring). IvyLens and Manatal are live. Resend email is live but hit its daily limit (Issue 8).

**Suggested priority before onboarding a real HR client:** fix Issues 1, 2, 4, 5 and 6. Then add links to the orphaned portal pages (Issue 7) and connect Stripe if clients will pay through the portal.
