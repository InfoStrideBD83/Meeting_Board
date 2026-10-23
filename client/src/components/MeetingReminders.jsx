import { useCallback, useEffect, useRef } from 'react';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { getMeetingUTCRange, toDateStr } from '../pages/meetingBoard/dateUtils.js';

const POLL_MS = 30000;
const REMINDER_WINDOW_MIN = 5;

function describeMeeting(m) {
  return `${m.demo_topic || 'Meeting'} at ${m.time || '—'}`;
}

function popNotification(title, body, tag) {
  try {
    const notif = new Notification(title, { body, icon: '/apple-touch-icon.png', tag });
    notif.onclick = () => { window.focus(); notif.close(); };
  } catch { /* some embedded browsers throw on `new Notification(...)` despite reporting support */ }
}

/** Renders nothing — a background poller, mounted once at the app root
 *  alongside MessagingWidget, that raises a browser Notification for the
 *  signed-in member's own meetings scheduled for today: once when a new
 *  one shows up on today's list, and again a few minutes before it starts.
 *  Same ground rules as MessagingWidget's message notifications: only
 *  pops while this tab is hidden/unfocused (otherwise the in-app "Today's
 *  meetings" bell already covers it), and only reaches a browser that's
 *  open somewhere — it can't wake up a fully closed one. Permission is
 *  requested from the "Today's meetings" bell's onOpen in MasterPage.jsx,
 *  not here, since a silent request with no user gesture is ignored by
 *  most browsers. */
export function MeetingReminders() {
  const { isAuthenticated, member } = useAuth();

  // null = no baseline yet, so the first poll of a session never notifies
  // about meetings that were already on today's list before this tab opened.
  const seenIdsRef = useRef(null);
  const remindedIdsRef = useRef(new Set());

  const poll = useCallback(() => {
    if (!member) return;
    const today = toDateStr(new Date());
    apiFetch(`/meetings?date=${encodeURIComponent(today)}&person_id=${encodeURIComponent(member.id)}`)
      .then((meetings) => {
        const supported = typeof Notification !== 'undefined';
        const canNotify = supported && Notification.permission === 'granted';
        const tabHidden = supported && (document.hidden || !document.hasFocus());

        const prevIds = seenIdsRef.current;
        const isFirstRun = prevIds === null;
        seenIdsRef.current = new Set(meetings.map((m) => m.id));

        if (!canNotify || !tabHidden) return;

        if (!isFirstRun) {
          for (const m of meetings) {
            if (!prevIds.has(m.id)) {
              popNotification('New meeting scheduled', describeMeeting(m), `meeting-new-${m.id}`);
            }
          }
        }

        const now = Date.now();
        for (const m of meetings) {
          if (remindedIdsRef.current.has(m.id)) continue;
          const { startUTC } = getMeetingUTCRange(m);
          const minsUntil = (startUTC.getTime() - now) / 60000;
          if (minsUntil > 0 && minsUntil <= REMINDER_WINDOW_MIN) {
            popNotification('Meeting starting soon', describeMeeting(m), `meeting-reminder-${m.id}`);
            remindedIdsRef.current.add(m.id);
          }
        }
      })
      .catch(() => { /* transient — next poll retries */ });
  }, [member]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [isAuthenticated, poll]);

  return null;
}
