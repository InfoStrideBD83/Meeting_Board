import { ZONES, toUTC, fromUTC } from './dateUtils.js';

/* CSV export — ported verbatim from Meeting Board.html's exportToCSV().
   Unlike Assignee.html's Import/Export buttons (which were un-wired
   placeholders that just alert()), this one is real: it builds an
   actual CSV of the currently-filtered meetings (all 5 timezone
   columns pre-converted) and triggers a browser download. */
export function exportMeetingsToCSV(filtered, members, selectedMonth) {
  if (filtered.length === 0) {
    alert('No data to export for the current filters.');
    return;
  }

  const headers = [
    'Demo Topic', 'Person', 'Date', 'Time (Original)', 'Original Zone', 'Duration (Min)', 'Status',
    'EST', 'CST', 'MST', 'PST', 'IST', 'POC Name', 'POC State', 'POC Email', 'POC Phone',
    'MOM', 'Meeting Taken By', 'Meeting Outcome', 'Post-Demo Actions',
  ];

  const rows = filtered.map((m) => {
    const member = members.find((mem) => mem.id === m.person_id) || {};
    const zone = ZONES[m.zone_index] || ZONES[0];
    const startUTC = toUTC(m.date, m.time, zone.iana);
    let takenBy = '';
    try { takenBy = m.meeting_taken_by ? JSON.parse(m.meeting_taken_by).join('; ') : ''; }
    catch { takenBy = m.meeting_taken_by || ''; }
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    return [
      q(m.demo_topic), q(member.name), q(m.date), q(m.time), q(zone.label), q(m.duration), q(m.status),
      q(fromUTC(startUTC, ZONES[0].iana)), q(fromUTC(startUTC, ZONES[1].iana)), q(fromUTC(startUTC, ZONES[2].iana)),
      q(fromUTC(startUTC, ZONES[3].iana)), q(fromUTC(startUTC, ZONES[4].iana)),
      q(m.poc_name), q(m.poc_state), q(m.poc_email), q(m.poc_phone),
      q(m.mom), q(takenBy), q(m.meeting_outcome), q(m.post_demo_actions),
    ];
  });

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `infostride_meetings_${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
