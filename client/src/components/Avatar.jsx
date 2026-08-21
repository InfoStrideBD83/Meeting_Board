import { initials } from '../utils/avatarColor.js';

/** Same `.avatar` circle used for the header profile avatar (no color prop
 *  -> default accent gradient from theme.css) and per-member chips
 *  (color prop overrides with an AVATAR_COLORS entry). */
export function Avatar({ name, color, size, className = '' }) {
  const style = {};
  if (color) style.background = color;
  if (size) { style.width = size; style.height = size; style.fontSize = Math.round(size * 0.39); }

  return (
    <span className={`avatar ${className}`} style={style}>
      {initials(name)}
    </span>
  );
}
