import { useEffect, useState } from 'react';
import { COUNTRIES, STATES_BY_COUNTRY } from '../../utils/geoData.js';
import { ico } from './icons.jsx';
import { ZONES, toDateStr } from './dateUtils.js';
import styles from './MeetingModal.module.css';

const TOPIC_OPTIONS = ['EMStride', 'HRIS', 'CMS', 'AI', 'Others'];
const FIXED_TOPICS = TOPIC_OPTIONS.slice(0, -1); // everything except "Others"
const STATUSES = ['Demo Scheduled', 'Demo Completed', 'Demo Canceled'];
const DURATIONS = [15, 30, 45, 60, 90, 120];

function statesForCountry(country) {
  return STATES_BY_COUNTRY[country] || [];
}

/** Splits a "known list, or free text" field into the two pieces this
 *  form's controlled selects need: which option is selected (an actual
 *  entry from `list`, or 'Others'), and the free-text draft to show/use
 *  when 'Others' is picked. Mirrors the original's derivation of
 *  `xIsOther` at render time from the raw stored value. */
function splitOther(list, value) {
  const isOther = Boolean(value) && !list.includes(value);
  return { select: value ? (isOther ? 'Others' : value) : '', other: isOther ? value : '' };
}

function buildInitialForm(initial, defaultPersonId) {
  const m = initial || {
    demo_topic: '', person_id: defaultPersonId, date: toDateStr(new Date()), time: '10:00',
    zone_index: 0, duration: 30, status: 'Demo Scheduled',
    poc_name: '', poc_state: '', poc_email: '', poc_phone: '', poc_country: '',
    poc_state_name: '', poc_population_count: '', poc_county_name: '',
    mom: '', meeting_taken_by: '', meeting_outcome: '', post_demo_actions: '',
  };

  const topic = splitOther(FIXED_TOPICS, m.demo_topic);
  const country = splitOther(COUNTRIES, m.poc_country);
  const stateList = country.select && country.select !== 'Others' ? statesForCountry(country.select) : [];
  const stateNames = stateList.map(([name]) => name);
  const stateName = splitOther(stateNames, m.poc_state_name);
  const stateMatch = stateList.find(([name]) => name === m.poc_state_name);
  const codeIsOther = Boolean(m.poc_state) && !(stateMatch && stateMatch[1] === m.poc_state);
  const stateCode = {
    select: m.poc_state ? (codeIsOther ? 'Others' : m.poc_state) : '',
    other: codeIsOther ? m.poc_state : '',
  };

  return {
    id: m.id,
    demoTopicSelect: topic.select, demoTopicOther: topic.other,
    personId: m.person_id || defaultPersonId,
    status: m.status || 'Demo Scheduled',
    date: m.date || toDateStr(new Date()),
    time: m.time || '10:00',
    zoneIndex: m.zone_index != null ? m.zone_index : 0,
    duration: m.duration || 30,
    pocName: m.poc_name || '', pocPhone: m.poc_phone || '', pocEmail: m.poc_email || '',
    countrySelect: country.select, countryOther: country.other,
    stateNameSelect: stateName.select, stateNameOther: stateName.other,
    stateCodeSelect: stateCode.select, stateCodeOther: stateCode.other,
    pocPopulationCount: m.poc_population_count || '', pocCountyName: m.poc_county_name || '',
    // Carried through untouched by this form, same as the original's
    // `{ ...state.activeModal, ... }` spread in submitModal().
    mom: m.mom || '', meetingTakenBy: m.meeting_taken_by || '',
    meetingOutcome: m.meeting_outcome || '', postDemoActions: m.post_demo_actions || '',
  };
}

/* Create / edit / duplicate form — ported from Meeting Board.html's
   renderModal() + onTopicChange/onCountryChange/onStateChange/
   onStateCodeChange/submitModal(). The original rebuilt <select> DOM
   nodes imperatively on each cascade step; this keeps the same field
   list, validation order and messages, but drives the Country -> State
   -> State code cascade (and the Topic "Others" toggle) through normal
   React state, the same pattern AssigneePage's own country/state
   cascade already uses. */
export function MeetingModal({ meeting, members, isAdmin, currentMemberId, onSave, onClose, onDelete }) {
  const isEdit = Boolean(meeting && meeting.id);
  const defaultPersonId = currentMemberId || (members[0] ? members[0].id : '');
  const [form, setForm] = useState(() => buildInitialForm(meeting, defaultPersonId));

  // Escape-to-close is handled centrally by the parent page (matching the
  // original's single document-level keydown listener, which closes the
  // modal before it ever considers popovers).
  useEffect(() => {
    setTimeout(() => { document.getElementById('m_topic_select')?.focus(); }, 30);
  }, []);

  // Lock background scroll while the modal is open — on a long form, an
  // unlocked page behind it makes it easy to end up scrolling/clicking the
  // backdrop by mistake, which closes the modal.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  function set(patch) { setForm((f) => ({ ...f, ...patch })); }

  function onCountryChange(value) {
    set({ countrySelect: value, countryOther: '', stateNameSelect: '', stateNameOther: '', stateCodeSelect: '', stateCodeOther: '' });
  }
  function onStateNameChange(value) {
    const list = form.countrySelect && form.countrySelect !== 'Others' ? statesForCountry(form.countrySelect) : [];
    const match = value !== 'Others' ? list.find(([name]) => name === value) : null;
    set({
      stateNameSelect: value, stateNameOther: '',
      stateCodeSelect: match ? match[1] : (value ? 'Others' : ''), stateCodeOther: '',
    });
  }

  const stateList = form.countrySelect && form.countrySelect !== 'Others' ? statesForCountry(form.countrySelect) : [];
  const stateMatch = stateList.find(([name]) => name === form.stateNameSelect);

  function submit(e) {
    e.preventDefault();

    if (!members.length) { alert('Add a team member before scheduling a meeting.'); return; }

    const topic = form.demoTopicSelect === 'Others' ? form.demoTopicOther.trim() : form.demoTopicSelect;
    if (!topic) { alert('Please choose a demo topic.'); return; }
    if (!form.personId) { alert('Please choose who is taking the meeting.'); return; }
    if (!form.status) { alert('Please choose a status.'); return; }
    if (!form.date) { alert('Please choose a date.'); return; }
    if (!form.time) { alert('Please choose a start time.'); return; }
    if (form.zoneIndex === '' || form.zoneIndex == null) { alert('Please choose a time zone.'); return; }
    if (!form.duration) { alert('Please choose a duration.'); return; }

    const country = form.countrySelect === 'Others' ? form.countryOther.trim() : form.countrySelect;
    const stateName = form.stateNameSelect === 'Others' ? form.stateNameOther.trim() : form.stateNameSelect;
    const stateCode = form.stateCodeSelect === 'Others' ? form.stateCodeOther.trim() : form.stateCodeSelect;

    const requiredText = [
      [form.pocName, 'the point-of-contact name'],
      [form.pocPhone, 'a phone number'],
      [form.pocEmail, 'an email address'],
    ];
    for (const [v, label] of requiredText) {
      if (!v.trim()) { alert(`Please provide ${label} before saving.`); return; }
    }

    onSave({
      id: form.id,
      demo_topic: topic,
      person_id: form.personId,
      status: form.status,
      date: form.date,
      time: form.time || '10:00',
      zone_index: Number(form.zoneIndex),
      duration: Number(form.duration),
      poc_name: form.pocName.trim(),
      poc_phone: form.pocPhone.trim(),
      poc_email: form.pocEmail.trim(),
      poc_county_name: form.pocCountyName.trim(),
      poc_country: country,
      poc_state_name: stateName,
      poc_state: stateCode,
      poc_population_count: form.pocPopulationCount,
      mom: form.mom,
      meeting_taken_by: form.meetingTakenBy,
      meeting_outcome: form.meetingOutcome,
      post_demo_actions: form.postDemoActions,
    });
  }

  return (
    <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit meeting' : 'New meeting'}>
        <div className={styles.modalHead}>
          <div>
            <h3>{isEdit ? 'Edit meeting' : 'Schedule a meeting'}</h3>
            <p>{isEdit ? 'Update the demo details below' : 'Times convert across all 5 zones automatically'}</p>
          </div>
          <button type="button" className={styles.popClose} onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <form className={styles.formShell} onSubmit={submit}>
          <div className={styles.modalBody}>
            <div className={styles.fieldsetLabel}>Meeting</div>

            <div className={styles.fgroup}>
              <label htmlFor="m_topic_select">Demo topic <span className={styles.reqStar}>*</span></label>
              <select id="m_topic_select" className={styles.control} value={form.demoTopicSelect} onChange={(e) => set({ demoTopicSelect: e.target.value, demoTopicOther: e.target.value === 'Others' ? form.demoTopicOther : '' })}>
                <option value="">Select a topic</option>
                {TOPIC_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.demoTopicSelect === 'Others' && (
              <div className={styles.fgroup}>
                <label htmlFor="m_topic_other">Topic name <span className={styles.reqStar}>*</span></label>
                <input id="m_topic_other" type="text" className={styles.control} value={form.demoTopicOther} onChange={(e) => set({ demoTopicOther: e.target.value })} placeholder="Enter the demo topic" />
              </div>
            )}

            <div className={styles.gridTwo}>
              <div className={styles.fgroup}>
                <label htmlFor="m_person">Scheduled By <span className={styles.reqStar}>*</span></label>
                <select id="m_person" className={styles.control} disabled={!isAdmin} value={form.personId} onChange={(e) => set({ personId: e.target.value })}>
                  {members.map((mem) => <option key={mem.id} value={mem.id}>{mem.name}</option>)}
                </select>
                {!isAdmin && <p className={styles.fieldHint}>Only an admin can reassign this meeting.</p>}
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="m_status">Status <span className={styles.reqStar}>*</span></label>
                <select id="m_status" className={styles.control} value={form.status} onChange={(e) => set({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.gridThree}>
              <div className={styles.fgroup}>
                <label htmlFor="m_date">Date <span className={styles.reqStar}>*</span></label>
                <input id="m_date" type="date" className={styles.control} value={form.date} onChange={(e) => set({ date: e.target.value })} />
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="m_time">Start time <span className={styles.reqStar}>*</span></label>
                <input id="m_time" type="time" className={styles.control} value={form.time} onChange={(e) => set({ time: e.target.value })} />
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="m_zone">Time zone <span className={styles.reqStar}>*</span></label>
                <select id="m_zone" className={styles.control} value={form.zoneIndex} onChange={(e) => set({ zoneIndex: Number(e.target.value) })}>
                  {ZONES.map((z, i) => <option key={z.label} value={i}>{z.label}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.fgroup}>
              <label htmlFor="m_duration">Duration <span className={styles.reqStar}>*</span></label>
              <select id="m_duration" className={styles.control} value={form.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>
                {DURATIONS.map((d) => <option key={d} value={d}>{d} minutes</option>)}
              </select>
            </div>

            <div className={styles.fieldsetLabel}>Point of contact</div>

            <div className={styles.gridTwo}>
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_name">Name <span className={styles.reqStar}>*</span></label>
                <input id="m_poc_name" type="text" className={styles.control} value={form.pocName} onChange={(e) => set({ pocName: e.target.value })} placeholder="Contact person" />
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_phone">Phone <span className={styles.reqStar}>*</span></label>
                <input id="m_poc_phone" type="tel" className={styles.control} value={form.pocPhone} onChange={(e) => set({ pocPhone: e.target.value })} placeholder="+1 (555) 000-0000" />
              </div>
            </div>

            <div className={styles.fgroup}>
              <label htmlFor="m_poc_email">Email <span className={styles.reqStar}>*</span></label>
              <input id="m_poc_email" type="email" className={styles.control} value={form.pocEmail} onChange={(e) => set({ pocEmail: e.target.value })} placeholder="name@company.com" />
            </div>

            <div className={styles.fgroup}>
              <label htmlFor="m_country">Country <span className={styles.fieldHint} style={{ display: 'inline', textTransform: 'none' }}>(optional)</span></label>
              <select id="m_country" className={styles.control} value={form.countrySelect} onChange={(e) => onCountryChange(e.target.value)}>
                <option value="">Select a country</option>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                <option value="Others">Others</option>
              </select>
            </div>
            {form.countrySelect === 'Others' && (
              <div className={styles.fgroup}>
                <label htmlFor="m_country_other">Country name</label>
                <input id="m_country_other" type="text" className={styles.control} value={form.countryOther} onChange={(e) => set({ countryOther: e.target.value })} placeholder="Enter the country" />
              </div>
            )}

            <div className={styles.gridThree}>
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_state_name">State <span className={styles.fieldHint} style={{ display: 'inline', textTransform: 'none' }}>(optional)</span></label>
                <select id="m_poc_state_name" className={styles.control} value={form.stateNameSelect} onChange={(e) => onStateNameChange(e.target.value)}>
                  <option value="">Select a state</option>
                  {stateList.map(([name]) => <option key={name} value={name}>{name}</option>)}
                  <option value="Others">Others</option>
                </select>
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_state_code">State code <span className={styles.fieldHint} style={{ display: 'inline', textTransform: 'none' }}>(optional)</span></label>
                <select id="m_poc_state_code" className={styles.control} value={form.stateCodeSelect} onChange={(e) => set({ stateCodeSelect: e.target.value, stateCodeOther: '' })}>
                  <option value="">Select a code</option>
                  {stateMatch && <option value={stateMatch[1]}>{stateMatch[1]}</option>}
                  <option value="Others">Others</option>
                </select>
              </div>
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_population_count">Population <span className={styles.fieldHint} style={{ display: 'inline', textTransform: 'none' }}>(optional)</span></label>
                <input id="m_poc_population_count" type="text" className={styles.control} value={form.pocPopulationCount} onChange={(e) => set({ pocPopulationCount: e.target.value })} placeholder="39,500,000" />
              </div>
            </div>
            {form.stateNameSelect === 'Others' && (
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_state_other">State name</label>
                <input id="m_poc_state_other" type="text" className={styles.control} value={form.stateNameOther} onChange={(e) => set({ stateNameOther: e.target.value })} placeholder="Enter the state / province" />
              </div>
            )}
            {form.stateCodeSelect === 'Others' && (
              <div className={styles.fgroup}>
                <label htmlFor="m_poc_state_code_other">State code</label>
                <input id="m_poc_state_code_other" type="text" className={styles.control} value={form.stateCodeOther} onChange={(e) => set({ stateCodeOther: e.target.value })} placeholder="e.g. CA" />
              </div>
            )}

            <div className={styles.fgroup}>
              <label htmlFor="m_poc_county_name">County / Company <span className={styles.fieldHint} style={{ display: 'inline', textTransform: 'none' }}>(optional)</span></label>
              <input id="m_poc_county_name" type="text" className={styles.control} value={form.pocCountyName} onChange={(e) => set({ pocCountyName: e.target.value })} placeholder="Los Angeles County" />
            </div>
          </div>

          <div className={styles.modalFoot}>
            {isEdit && (
              <button type="button" className={`btn ${styles.dangerText}`} onClick={() => { onClose(); onDelete(form.id); }}>
                {ico.trash} Delete
              </button>
            )}
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">{isEdit ? 'Save changes' : 'Create meeting'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
