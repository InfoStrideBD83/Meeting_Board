import { ZONES, toUTC, fromUTCFull } from '../meetingBoard/dateUtils.js';

/* The slot grid is always anchored to CST, regardless of which index the
   shared ZONES list happens to put it at. */
export const CST_ZONE_IDX = ZONES.findIndex((z) => z.label === 'CST');
const CST = ZONES[CST_ZONE_IDX];

export const SLOT_START_MIN = 8 * 60; // 8:00 AM CST
export const SLOT_END_MIN = 13 * 60; // 1:00 PM CST

/* 8:00 AM through 12:30 PM CST in 30-minute steps — 10 slots, the last
   one covering 12:30–1:00 PM. */
export const SLOTS = Array.from({ length: (SLOT_END_MIN - SLOT_START_MIN) / 30 }, (_, i) => {
  const totalMin = SLOT_START_MIN + i * 30;
  return { hour: Math.floor(totalMin / 60), minute: totalMin % 60, index: i };
});

export function slotTimeStr(slot) {
  return `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
}

function fmt12(hour, minute) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ap = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ap}`;
}

/** For a given calendar date + CST slot, what that same instant reads as
 *  in every configured zone — so a row can show "8:00 AM CST" next to
 *  what EST/MST/PST/IST clocks show at that same moment. */
export function slotZoneTimes(refDateStr, slot) {
  const utc = toUTC(refDateStr, slotTimeStr(slot), CST.iana);
  return ZONES.map((z) => {
    const p = fromUTCFull(utc, z.iana);
    return { label: z.label, text: fmt12(p.hour, p.minute) };
  });
}
