const MailIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="4.5" width="19" height="15" rx="2.4"/><path d="M3.5 6 12 12.5 20.5 6"/></svg>;
const PhoneIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 3.5h4l1.6 5-2.4 1.6a13.3 13.3 0 0 0 6.2 6.2l1.6-2.4 5 1.6v4a1.6 1.6 0 0 1-1.7 1.6A17.6 17.6 0 0 1 3 5.2 1.6 1.6 0 0 1 4.5 3.5Z"/></svg>;
const PinIcon = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-6.6 7-12a7 7 0 1 0-14 0c0 5.4 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>;

const ITEMS = [
  { icon: null, text: 'InfoStride, Inc.', strong: true, live: true },
  { icon: null, text: 'Technology Solutions · Digital Transformation · IT Services' },
  { icon: MailIcon, text: 'reachus@infostride.com' },
  { icon: MailIcon, text: 'govt@infostride.com' },
  { icon: PhoneIcon, text: '+1-415-360-1700' },
  { icon: PhoneIcon, text: '+1-510-305-1160' },
  { icon: PinIcon, text: 'USA — 7000 N Mopac Expressway, Suite 200, Austin, TX 78731, USA' },
  { icon: PinIcon, text: 'India (Mohali) — WorldTech Square, 2nd Floor, Plot No. I-15, IT City Road, Sector 83, Mohali, Punjab 140306' },
  { icon: PinIcon, text: 'India (Noida) — 502, 5th Floor, Regus Tower, Infostride Technologies Pvt. Ltd., Sector 142, Noida, Uttar Pradesh 201305' },
  { icon: null, text: '© 2026 InfoStride, Inc. All rights reserved.' },
];

function Track() {
  return (
    <span className="footer-track">
      {ITEMS.map((item, i) => (
        <span className="footer-item" key={i}>
          {item.live && <span className="footer-live" aria-hidden="true" />}
          {item.icon && <span className={`footer-icon footer-icon-p${i % 3}`}>{item.icon}</span>}
          <span className={item.strong ? 'footer-strong' : ''}>{item.text}</span>
        </span>
      ))}
    </span>
  );
}

/** A persistent, theme-matched marquee footer — mounted once at the app
 *  root (see App.jsx) so it appears on every page without each page
 *  needing to render it itself. Two identical copies of the track sit
 *  side by side and the whole strip scrolls by exactly one copy's
 *  width, so the loop is seamless. Layered with the same animated-glass
 *  effects (aurora drift, sweeping beam, traveling top highlight) as
 *  the app's headers, plus a pulsing "live" dot and softly breathing
 *  icons, so it doesn't read as flat scrolling text. */
export function Footer() {
  return (
    <footer className="app-footer" aria-label="Company contact information">
      <div className="footer-fx" aria-hidden="true">
        <span className="footer-fx-aurora" />
        <span className="footer-fx-beam" />
        <span className="footer-fx-line" />
      </div>
      <div className="footer-marquee">
        <div className="footer-marquee-track">
          <Track />
          <Track />
        </div>
      </div>
    </footer>
  );
}
