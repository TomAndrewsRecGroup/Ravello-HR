'use client';

import { useState } from 'react';
import { Check, ExternalLink, Plus, Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { revalidateAdminPath } from '@/app/actions';

import { ABSENCE_TYPE_LABELS, EMPLOYEE_DOC_TYPE_LABELS, ABSENCE_STATUS_LABELS, labelFor } from '@/lib/ui/statusMaps';
interface Props {
  companyId: string;
  initialAbsenceRecords: any[];
  initialEmpDocs: any[];
}

export default function ProtectTab({ companyId, initialAbsenceRecords, initialEmpDocs }: Props) {
  const supabase = createClient();
  const [absenceRecords, setAbsenceRecords] = useState<any[]>(initialAbsenceRecords);
  const [empDocs] = useState<any[]>(initialEmpDocs);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    employee_name: '',
    doc_type:      'right_to_work',
    title:         '',
    expiry_date:   '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function uploadEmployeeDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadForm.employee_name.trim()) { setUploadError('Employee name is required.'); return; }
    if (!file) { setUploadError('Pick a file to upload.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('company_id',    companyId);
      fd.append('employee_name', uploadForm.employee_name.trim());
      fd.append('doc_type',      uploadForm.doc_type);
      fd.append('title',         uploadForm.title.trim() || file.name);
      if (uploadForm.expiry_date) fd.append('expiry_date', uploadForm.expiry_date);

      const res = await fetch('/api/admin/employee-documents', { method: 'POST', body: fd });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Upload failed');

      setUploadForm({ employee_name: '', doc_type: 'right_to_work', title: '', expiry_date: '' });
      setFile(null);
      setShowUpload(false);
      revalidateAdminPath(`/clients/${companyId}`);
    } catch (e: any) {
      setUploadError(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function updateAbsenceStatus(id: string, status: string) {
    const { error } = await supabase.from('absence_records').update({ status }).eq('id', id);
    if (!error) {
      setAbsenceRecords(prev => prev.map(a => a.id === id ? { ...a, status } : a));
      revalidateAdminPath('/clients');
    }
  }

  return (
    <div className="space-y-8">
      {/* Absence Records */}
      <div>
        <h2 className="font-display font-semibold text-sm mb-4" style={{ color: 'var(--ink)' }}>
          Absence Records
          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(217,119,6,0.1)', color: 'var(--amber)' }}>
            {absenceRecords.filter(a => a.status === 'pending').length} pending approval
          </span>
        </h2>
        {absenceRecords.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>No absence records.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Start</th>
                  <th>End</th>
                  <th>Days</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {absenceRecords.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{a.employee_name}</p>
                      {a.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{a.department}</p>}
                    </td>
                    <td style={{ color: 'var(--ink-soft)' }} className="capitalize">{labelFor(ABSENCE_TYPE_LABELS, a.absence_type)}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{a.start_date ? new Date(a.start_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{a.end_date ? new Date(a.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}</td>
                    <td style={{ color: 'var(--ink-soft)' }}>{a.days ?? '-'}</td>
                    <td>
                      {a.status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => updateAbsenceStatus(a.id, 'approved')}
                            className="btn-sm btn-secondary text-[11px] flex items-center gap-1"
                            style={{ color: 'var(--emerald)' }}
                          >
                            <Check size={11} /> Approve
                          </button>
                          <button
                            onClick={() => updateAbsenceStatus(a.id, 'rejected')}
                            className="btn-sm btn-ghost text-[11px]"
                            style={{ color: 'var(--rose)' }}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                          style={
                            a.status === 'approved' ? { background: 'rgba(22,163,74,0.1)', color: 'var(--emerald)' } :
                            a.status === 'rejected' ? { background: 'rgba(220,38,38,0.1)', color: 'var(--rose)' } :
                            { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' }
                          }
                        >
                          {a.status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee Documents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            Employee Documents
            {empDocs.filter(d => d.status === 'expired').length > 0 && (
              <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full" style={{ background: 'rgba(220,38,38,0.1)', color: 'var(--rose)' }}>
                {empDocs.filter(d => d.status === 'expired').length} expired
              </span>
            )}
          </h2>
          {!showUpload && (
            <button onClick={() => setShowUpload(true)} className="btn-cta btn-sm flex items-center gap-1.5">
              <Plus size={13} /> Upload document
            </button>
          )}
        </div>

        {showUpload && (
          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>New employee document</p>
              <button onClick={() => { setShowUpload(false); setUploadError(''); }} className="btn-icon btn-ghost" aria-label="Close">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={uploadEmployeeDoc} className="grid sm:grid-cols-2 gap-3">
              <div className="form-group sm:col-span-2">
                <label className="label">Employee name *</label>
                <input className="input" value={uploadForm.employee_name} onChange={e => setUploadForm(f => ({ ...f, employee_name: e.target.value }))} placeholder="e.g. Jane Smith" />
              </div>
              <div className="form-group">
                <label className="label">Document type</label>
                <select className="input" value={uploadForm.doc_type} onChange={e => setUploadForm(f => ({ ...f, doc_type: e.target.value }))}>
                  <option value="right_to_work">Right to work</option>
                  <option value="contract">Contract</option>
                  <option value="passport">Passport</option>
                  <option value="visa">Visa</option>
                  <option value="dbs">DBS check</option>
                  <option value="qualification">Qualification</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Expiry date</label>
                <input type="date" className="input" value={uploadForm.expiry_date} onChange={e => setUploadForm(f => ({ ...f, expiry_date: e.target.value }))} />
              </div>
              <div className="form-group sm:col-span-2">
                <label className="label">Title (optional — uses filename if blank)</label>
                <input className="input" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. UK Passport - Smith" />
              </div>
              <div className="form-group sm:col-span-2">
                <label className="label">File *</label>
                <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="input" accept="application/pdf,image/*" />
              </div>
              {uploadError && <p className="sm:col-span-2 text-xs p-2.5 rounded-[8px]" style={{ background: 'rgba(217,68,68,0.08)', color: 'var(--red)' }}>{uploadError}</p>}
              <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => { setShowUpload(false); setUploadError(''); }} className="btn-secondary btn-sm" disabled={uploading}>Cancel</button>
                <button type="submit" className="btn-cta btn-sm" disabled={uploading}>
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : null}
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        )}
        {empDocs.length === 0 ? (
          <div className="card p-12 empty-state"><p className="text-sm">No employee documents yet.</p></div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Expiry</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {empDocs.map((d: any) => {
                  const isExpired = d.status === 'expired' || (d.expiry_date && new Date(d.expiry_date) < new Date());
                  return (
                    <tr key={d.id}>
                      <td>
                        <p className="font-medium text-sm" style={{ color: 'var(--ink)' }}>{d.employee_name}</p>
                        {d.department && <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>{d.department}</p>}
                      </td>
                      <td>
                        {d.file_url ? (
                          <a href={d.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm" style={{ color: 'var(--purple)' }}>
                            {d.title} <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-sm" style={{ color: 'var(--ink-soft)' }}>{d.title}</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--ink-soft)' }} className="capitalize">{labelFor(EMPLOYEE_DOC_TYPE_LABELS, d.doc_type)}</td>
                      <td style={{ color: isExpired ? 'var(--rose)' : 'var(--ink-soft)', fontWeight: isExpired ? 600 : undefined }}>
                        {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                        {isExpired && d.expiry_date && <span className="ml-1 text-[10px]">EXPIRED</span>}
                      </td>
                      <td>
                        <span
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
                          style={
                            d.status === 'active'           ? { background: 'rgba(22,163,74,0.1)',    color: 'var(--emerald)' } :
                            d.status === 'expired'          ? { background: 'rgba(220,38,38,0.1)',   color: 'var(--rose)' } :
                            d.status === 'pending_renewal'  ? { background: 'rgba(217,119,6,0.1)',   color: 'var(--amber)' } :
                            { background: 'rgba(148,163,184,0.1)', color: 'var(--slate)' }
                          }
                        >
                          {labelFor(ABSENCE_STATUS_LABELS, d.status)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
