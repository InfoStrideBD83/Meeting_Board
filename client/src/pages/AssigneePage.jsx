import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch, clearToken } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { AppHeader } from '../components/AppHeader.jsx';
import { AmbientBackdrop } from '../components/AmbientBackdrop.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { avatarColor } from '../utils/avatarColor.js';
import { COUNTRIES, STATES_BY_COUNTRY } from '../utils/geoData.js';
import styles from './AssigneePage.module.css';

const TOPIC_OPTIONS = ['EMStride', 'HRIS', 'CMS', 'AI', 'Others'];

function statesForCountry(country) {
  return STATES_BY_COUNTRY[country] || [];
}

/* ══════════════════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════════════════ */
export function AssigneePage() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [currentMember, setCurrentMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [activeFilter, setActiveFilter] = useState(null); // member id, or null = everyone
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ assignedTo: '', topic: '', subTopic: '', country: '', stateName: '' });

  const fileInputRef = useRef(null);

  const canManageAssignment = useCallback(
    (a) => isAdmin || Boolean(currentMember && a.assigned_to === currentMember.id),
    [isAdmin, currentMember]
  );

  const bootstrap = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    Promise.all([apiFetch('/auth/me'), apiFetch('/members'), apiFetch('/assignments')])
      .then(([meRes, membersRes, assignmentsRes]) => {
        setMembers(membersRes);
        setCurrentMember(membersRes.find((m) => m.id === meRes.member.id) || null);
        setAssignments(assignmentsRes);
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

  useEffect(() => {
    document.title = 'InfoStride · Assignee';
  }, []);

  /* ── Filter ─────────────────────────────────────────────────────── */
  function toggleFilter(memberId) {
    setActiveFilter((prev) => (prev === memberId ? null : memberId));
  }
  function resetFilter() { setActiveFilter(null); }

  const filteredAssignments = useMemo(
    () => (activeFilter ? assignments.filter((a) => a.assigned_to === activeFilter) : assignments),
    [assignments, activeFilter]
  );

  /* ── Modal ──────────────────────────────────────────────────────── */
  function openAssignModal(id) {
    if (id) {
      const existing = assignments.find((a) => a.id === id);
      if (!existing || !canManageAssignment(existing)) {
        alert('Only the assignee or an admin can edit this assignment.');
        return;
      }
      setForm({
        assignedTo: existing.assigned_to,
        topic: existing.topic,
        subTopic: existing.sub_topic || '',
        country: existing.country,
        stateName: existing.state || '',
      });
      setEditingId(id);
    } else {
      setForm({ assignedTo: '', topic: '', subTopic: '', country: '', stateName: '' });
      setEditingId(null);
    }
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
  }

  useEffect(() => {
    if (!modalOpen) return undefined;
    function escToClose(e) { if (e.key === 'Escape') closeModal(); }
    window.addEventListener('keydown', escToClose);
    return () => window.removeEventListener('keydown', escToClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  function onCountryChange(e) {
    const country = e.target.value;
    setForm((prev) => ({ ...prev, country, stateName: '' }));
  }

  const stateOptions = useMemo(() => statesForCountry(form.country), [form.country]);

  function saveAssignment(e) {
    e.preventDefault();
    const { assignedTo, topic, subTopic, country, stateName } = form;

    if (!assignedTo || !topic || !country) {
      alert('Work Assigned To, Topic, and Country are required.');
      return;
    }

    const payload = { assigned_to: assignedTo, topic, sub_topic: subTopic.trim(), country, state: stateName };

    if (editingId) {
      const beingEdited = assignments.find((a) => a.id === editingId);
      if (!beingEdited || !canManageAssignment(beingEdited)) {
        alert('Only the assignee or an admin can edit this assignment.');
        return;
      }
      apiFetch('/assignments/' + encodeURIComponent(editingId), { method: 'PATCH', body: payload })
        .then((saved) => {
          setAssignments((prev) => prev.map((a) => (a.id === saved.id ? saved : a)));
          closeModal();
        })
        .catch((err) => alert(err.message || 'Could not save this assignment.'));
    } else {
      apiFetch('/assignments', { method: 'POST', body: payload })
        .then((saved) => {
          setAssignments((prev) => [saved, ...prev]);
          closeModal();
        })
        .catch((err) => alert(err.message || 'Could not save this assignment.'));
    }
  }

  function deleteAssignment(id) {
    const a = assignments.find((x) => x.id === id);
    if (!a) return;
    if (!canManageAssignment(a)) {
      alert('Only the assignee or an admin can delete this assignment.');
      return;
    }
    const who = members.find((m) => m.id === a.assigned_to);
    if (window.confirm('Remove this assignment' + (who ? ' for ' + who.name : '') + '?\n\nThis cannot be undone.')) {
      apiFetch('/assignments/' + encodeURIComponent(id), { method: 'DELETE' })
        .then(() => setAssignments((prev) => prev.filter((x) => x.id !== id)))
        .catch((err) => alert(err.message || 'Could not delete this assignment.'));
    }
  }

  /* ── Import / Export — placeholders, matching the original page's
     un-wired-up buttons exactly (they just alert). ─────────────────── */
  function triggerImport() {
    if (fileInputRef.current) fileInputRef.current.click();
  }
  function handleImportFile(e) {
    const input = e.target;
    if (!input.files || !input.files[0]) return;
    alert('CSV import isn’t wired up yet.');
    input.value = '';
  }
  function exportData() {
    alert('CSV export isn’t wired up yet.');
  }

  const editing = editingId ? assignments.find((a) => a.id === editingId) : null;

  return (
    <>
      <AmbientBackdrop />
      <AppHeader showBrand>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={handleImportFile}
        />
        <button className="btn" type="button" onClick={triggerImport} title="Import assignments from a CSV file">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span className="btn-label-sm">Import</span>
        </button>
        <button className="btn" type="button" onClick={exportData} title="Export current view to CSV">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          <span className="btn-label-sm">Export</span>
        </button>
        <button className="btn btn-primary" type="button" onClick={() => openAssignModal()} title="Add assigned work">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          <span className="btn-label-sm">Assign Work</span>
        </button>
      </AppHeader>

      <main className={styles.main}>
        <div className={styles.mainContent}>
          {loading ? (
            <div className={`${styles.card} ${styles.empty}`}><h4>Loading…</h4></div>
          ) : loadError ? (
            <div className={`${styles.card} ${styles.empty}`}>
              <h4>Could not load this page</h4>
              <p>{loadError}</p>
            </div>
          ) : (
            <>
              <div className={`${styles.card} ${styles.toolbar}`}>
                {!members.length ? (
                  <div className={styles.toolbarRow}>
                    <span className={styles.filterLabel}>Team</span>
                    <span className="field-hint">No approved team members yet — approve sign-ups from the bell on the Home page.</span>
                  </div>
                ) : (
                  <div className={styles.toolbarRow}>
                    <span className={styles.filterLabel}>Team</span>
                    <div className={styles.chipScroller}>
                      {members.map((m) => {
                        const count = assignments.filter((a) => a.assigned_to === m.id).length;
                        const pressed = activeFilter === null || activeFilter === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className={styles.chip}
                            aria-pressed={pressed}
                            onClick={() => toggleFilter(m.id)}
                          >
                            <Avatar name={m.name} color={avatarColor(m.id, members)} size={20} />
                            {m.name}
                            <span className={styles.chipCount}>{count}</span>
                          </button>
                        );
                      })}
                    </div>
                    {activeFilter && (
                      <button type="button" className={styles.linkBtn} onClick={resetFilter}>Show all</button>
                    )}
                  </div>
                )}
              </div>

              {!filteredAssignments.length ? (
                <div className={`${styles.card} ${styles.empty}`}>
                  <div className={styles.emptyArt}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="17" rx="2.2"/><path d="M9 2.6h6a1 1 0 0 1 1 1V6H8V3.6a1 1 0 0 1 1-1Z"/><path d="M8.5 12.4l2 2 4-4"/><path d="M8.5 17h5"/></svg>
                  </div>
                  <h4>{activeFilter ? 'No work assigned to this person yet' : 'No work assigned yet'}</h4>
                  <p>Click “Assign Work” above to give a team member their first task.</p>
                </div>
              ) : (
                <div className={styles.tableCard}>
                  <div className={styles.tableScroll}>
                    <table className={styles.tbl}>
                      <thead>
                        <tr>
                          <th className={styles.c}>Assigned To</th>
                          <th className={styles.c}>Topic</th>
                          <th className={styles.c}>Sub Topic</th>
                          <th className={styles.c}>Country</th>
                          <th className={styles.c}>State</th>
                          <th className={styles.c}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAssignments.map((a) => {
                          const m = members.find((x) => x.id === a.assigned_to);
                          const manageable = canManageAssignment(a);
                          return (
                            <tr key={a.id}>
                              <td className={styles.c}>
                                <span className={styles.personCell}>
                                  <Avatar name={m ? m.name : '?'} color={avatarColor(a.assigned_to, members)} size={26} />
                                  <span className={styles.personName}>{m ? m.name : 'Unknown'}</span>
                                </span>
                              </td>
                              <td className={styles.c}>{a.topic}</td>
                              <td className={styles.c}>{a.sub_topic ? a.sub_topic : <span className={styles.dash}>—</span>}</td>
                              <td className={styles.c}>{a.country}</td>
                              <td className={styles.c}>{a.state ? a.state : <span className={styles.dash}>—</span>}</td>
                              <td className={styles.c}>
                                {!manageable ? (
                                  <span className={styles.dash} title="Only the assignee or an admin can manage this assignment">—</span>
                                ) : (
                                  <span className={styles.actionsWrap}>
                                    <button
                                      type="button"
                                      className={`${styles.iconBtn} edit`}
                                      title="Edit"
                                      onClick={() => openAssignModal(a.id)}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button
                                      type="button"
                                      className={`${styles.iconBtn} del`}
                                      title="Delete"
                                      onClick={() => deleteAssignment(a.id)}
                                    >
                                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                                    </button>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {modalOpen && (
        <div
          className={styles.overlay}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Assign work">
            <div className={styles.modalHead}>
              <h3>{editing ? 'Edit assignment' : 'Assign work'}</h3>
              <button className={styles.iconBtn} type="button" onClick={closeModal} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <form onSubmit={saveAssignment}>
              <div className={styles.modalBody}>
                <div className={styles.fgroup}>
                  <label htmlFor="a_assignedTo">Work Assigned To<span className={styles.reqStar}>*</span></label>
                  <select
                    className={styles.control}
                    id="a_assignedTo"
                    required
                    disabled={!members.length}
                    value={form.assignedTo}
                    onChange={(e) => setForm((prev) => ({ ...prev, assignedTo: e.target.value }))}
                  >
                    <option value="">{members.length ? 'Select a team member' : 'No approved members yet'}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.fgroup}>
                  <label htmlFor="a_topic">Topic<span className={styles.reqStar}>*</span></label>
                  <select
                    className={styles.control}
                    id="a_topic"
                    required
                    value={form.topic}
                    onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                  >
                    <option value="">Select a topic</option>
                    {TOPIC_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.fgroup}>
                  <label htmlFor="a_subTopic">Sub Topic</label>
                  <input
                    className={styles.control}
                    type="text"
                    id="a_subTopic"
                    placeholder="Optional details"
                    value={form.subTopic}
                    onChange={(e) => setForm((prev) => ({ ...prev, subTopic: e.target.value }))}
                  />
                </div>
                <div className={styles.gridTwo}>
                  <div className={styles.fgroup}>
                    <label htmlFor="a_country">Country<span className={styles.reqStar}>*</span></label>
                    <select
                      className={styles.control}
                      id="a_country"
                      required
                      value={form.country}
                      onChange={onCountryChange}
                    >
                      <option value="">Select a country</option>
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.fgroup}>
                    <label htmlFor="a_state">State</label>
                    <select
                      className={styles.control}
                      id="a_state"
                      disabled={!stateOptions.length}
                      value={form.stateName}
                      onChange={(e) => setForm((prev) => ({ ...prev, stateName: e.target.value }))}
                    >
                      <option value="">{stateOptions.length ? 'Select a state' : (form.country ? 'No states listed' : 'Select a country first')}</option>
                      {stateOptions.map((pair) => (
                        <option key={pair[0]} value={pair[0]}>{pair[0]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className={styles.modalFoot}>
                <button type="button" className="btn" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editing ? 'Save changes' : 'Assign'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
