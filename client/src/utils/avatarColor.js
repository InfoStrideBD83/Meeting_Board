// Ported from Assignee.html / Meeting Board.html — color is picked by a
// member's position in the current members list, not a hash of their id.
export const AVATAR_COLORS = [
  '#818cf8', '#34d399', '#fbbf24', '#fb7185', '#38bdf8',
  '#f472b6', '#a78bfa', '#22d3ee', '#fb923c', '#4ade80',
];

export function avatarColor(id, members) {
  const idx = members.findIndex((m) => m.id === id);
  return AVATAR_COLORS[(idx < 0 ? 0 : idx) % AVATAR_COLORS.length];
}

export function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2)
    .map((w) => w.charAt(0)).join('').toUpperCase();
}

export function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || 'there';
}
