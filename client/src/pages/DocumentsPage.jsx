import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, clearToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { AppHeader } from '../components/AppHeader.jsx';
import { AmbientBackdrop } from '../components/AmbientBackdrop.jsx';
import styles from './DocumentsPage.module.css';

const ico = {
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
  ),
  doc: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2.5H6.5A2 2 0 0 0 4.5 4.5v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" /><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h4" /></svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" /></svg>
  ),
  inbox: (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
  ),
};

function humanSize(bytes) {
  if (bytes == null) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes), i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 || n >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* Upload form — admin only. A plain <input type="file"> + optional title,
   submitted as multipart/form-data (apiFetch already leaves FormData
   bodies alone instead of JSON-encoding them). */
function UploadModal({ uploading, onUpload, onClose }) {
  const fileRef = useRef(null);
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');

  function submit(e) {
    e.preventDefault();
    const file = fileRef.current && fileRef.current.files[0];
    if (!file) { alert('Please choose a file.'); return; }
    onUpload(file, title.trim());
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Upload a document">
        <div className={styles.modalHead}>
          <div>
            <h3>Upload a document</h3>
            <p>PDF, Word, PowerPoint, Excel, or an image</p>
          </div>
          <button type="button" className={styles.popClose} onClick={onClose} disabled={uploading} aria-label="Close">&times;</button>
        </div>
        <form className={styles.formShell} onSubmit={submit}>
          <div className={styles.modalBody}>
            <div className={styles.fgroup}>
              <label htmlFor="doc_file">File <span className={styles.reqStar}>*</span></label>
              <input
                id="doc_file"
                type="file"
                className={styles.fileInput}
                ref={fileRef}
                onChange={(e) => setFileName(e.target.files[0] ? e.target.files[0].name : '')}
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
              />
              {fileName && <p className={styles.fieldHint}>{fileName}</p>}
            </div>
            <div className={styles.fgroup}>
              <label htmlFor="doc_title">
                Title <span className={styles.fieldHint} style={{ display: 'inline', textTransform: 'none' }}>(optional — defaults to the file name)</span>
              </label>
              <input
                id="doc_title" type="text" className={styles.control}
                value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Company Brochure 2026"
              />
            </div>
          </div>
          <div className={styles.modalFoot}>
            <button type="button" className="btn" onClick={onClose} disabled={uploading}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? 'Uploading…' : 'Upload'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* Documents & Brochures — a shared file library. Every member can browse
   and download; only admins can add or remove files. Files live in a
   private Supabase Storage bucket, so downloads go through a short-lived
   signed URL minted per request (see server/src/routes/documents.js)
   rather than a public link. */
export function DocumentsPage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const bootstrap = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([apiFetch('/members'), apiFetch('/documents')])
      .then(([membersRes, docsRes]) => {
        setMembers(membersRes);
        setDocs(docsRes);
        setLoading(false);
      })
      .catch((err) => {
        if (err.status === 401) {
          clearToken();
          navigate('/login', { replace: true });
          return;
        }
        setLoadError(err.message || 'Unknown error');
        setLoading(false);
      });
  }, [navigate]);

  useEffect(() => { bootstrap(); }, [bootstrap]);
  useEffect(() => { document.title = 'InfoStride · Documents & Brochures'; }, []);

  function memberName(id) {
    const m = members.find((x) => x.id === id);
    return m ? m.name : 'Unknown';
  }

  function handleDownload(doc) {
    setDownloadingId(doc.id);
    apiFetch(`/documents/${encodeURIComponent(doc.id)}/download`)
      .then(({ url }) => { window.open(url, '_blank', 'noopener'); })
      .catch((err) => alert(err.message || 'Could not download this document.'))
      .finally(() => setDownloadingId(null));
  }

  function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"?\n\nThis cannot be undone.`)) return;
    apiFetch(`/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' })
      .then(() => setDocs((prev) => prev.filter((d) => d.id !== doc.id)))
      .catch((err) => alert(err.message || 'Could not delete this document.'));
  }

  function handleUpload(file, title) {
    const fd = new FormData();
    fd.append('file', file);
    if (title) fd.append('title', title);
    setUploading(true);
    apiFetch('/documents', { method: 'POST', body: fd })
      .then((created) => {
        setDocs((prev) => [created, ...prev]);
        setUploadOpen(false);
      })
      .catch((err) => alert(err.message || 'Could not upload this document.'))
      .finally(() => setUploading(false));
  }

  return (
    <>
      <AmbientBackdrop />
      <AppHeader showBrand>
        {isAdmin && (
          <button type="button" className="btn btn-primary" onClick={() => setUploadOpen(true)} title="Upload a document">
            {ico.plus}<span className="btn-label-sm">Upload</span>
          </button>
        )}
      </AppHeader>

      <main className={styles.main}>
        {loading ? (
          <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>Loading…</div>
        ) : loadError ? (
          <div className={styles.card} style={{ textAlign: 'center', padding: '60px 20px' }}>
            <h4>Could not load this page</h4>
            <p style={{ color: 'var(--muted)', marginTop: 6 }}>{loadError}</p>
          </div>
        ) : docs.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyArt}>{ico.inbox}</div>
            <h4>No documents yet</h4>
            <p>{isAdmin ? 'Upload your first document or brochure to get started.' : 'No documents or brochures have been shared yet.'}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {docs.map((d) => (
              <div className={styles.docCard} key={d.id}>
                <div className={styles.docIcon}>{ico.doc}</div>
                <div className={styles.docBody}>
                  <div className={styles.docTitle} title={d.title}>{d.title}</div>
                  <div className={styles.docMeta}>{humanSize(d.file_size)} &middot; {formatDate(d.created_at)}</div>
                  <div className={styles.docMeta}>Added by {memberName(d.uploaded_by)}</div>
                </div>
                <div className={styles.docActions}>
                  <button type="button" className="btn" disabled={downloadingId === d.id} onClick={() => handleDownload(d)}>
                    {ico.download}<span className="btn-label-sm">{downloadingId === d.id ? 'Preparing…' : 'Download'}</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      title={`Delete ${d.title}`}
                      aria-label={`Delete ${d.title}`}
                      onClick={() => handleDelete(d)}
                    >
                      {ico.trash}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {uploadOpen && (
        <UploadModal uploading={uploading} onUpload={handleUpload} onClose={() => setUploadOpen(false)} />
      )}
    </>
  );
}
