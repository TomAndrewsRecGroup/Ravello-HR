// The employee_records row "Mark as Hired" creates.
//
// The modal used to insert `annual_salary` and `reporting_manager`,
// two columns employee_records has never had (015 calls them `salary`
// and `line_manager`), and could send a blank `start_date` into a NOT
// NULL column. Every hire therefore failed at the database, and the
// candidate was never marked hired nor the role filled. Kept pure so
// employeeFromHire.test.ts can check the keys against the migration.

export interface HireForm {
  companyId:      string;
  /** The candidate this record comes from (099). The consumer's
   *  hired-to-employee rule keys on it and creates nothing when set. */
  candidateId?:   string | null;
  fullName:       string;
  email:          string;
  jobTitle:       string;
  department:     string;
  startDate:      string;
  employmentType: string;
  salary:         string;
  lineManager:    string;
}

export type EmployeeInsert = {
  company_id:      string;
  full_name:       string;
  email:           string | null;
  job_title:       string;
  department:      string | null;
  start_date:      string;
  employment_type: string;
  salary:          number | null;
  line_manager:    string | null;
  status:          'active';
  source_candidate_id: string | null;
};

// 015: full_time, part_time, contractor, intern. The form's own
// vocabulary is mapped rather than written raw.
const EMPLOYMENT_TYPES: Record<string, string> = {
  'full-time': 'full_time', 'part-time': 'part_time', contract: 'contractor', 'fixed-term': 'fixed_term',
};

export function buildEmployeeFromHire(f: HireForm): EmployeeInsert {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.startDate)) throw new Error('A start date is required to create the employee record.');
  if (!f.fullName.trim()) throw new Error('A full name is required.');
  if (!f.jobTitle.trim()) throw new Error('A job title is required.');
  const salary = f.salary.trim() === '' ? null : Number(f.salary);
  if (salary !== null && (!Number.isFinite(salary) || salary < 0)) throw new Error('Salary must be a number.');
  return {
    company_id:      f.companyId,
    full_name:       f.fullName.trim(),
    email:           f.email.trim() || null,
    job_title:       f.jobTitle.trim(),
    department:      f.department.trim() || null,
    start_date:      f.startDate,
    employment_type: EMPLOYMENT_TYPES[f.employmentType] ?? f.employmentType,
    salary,
    line_manager:    f.lineManager.trim() || null,
    status:          'active',
    source_candidate_id: f.candidateId ?? null,
  };
}
