import { Link } from 'react-router-dom';
import { AppSwitcher } from './AppSwitcher.jsx';
import logoLight from '../../assets/logo-light.png';
import logoDark from '../../assets/logo-dark-cropped.png';

/** The `.app-header` shell (animated aurora/beam/grid backdrop) copy-pasted
 *  today into Meeting Board, Assignee, US Timer and US Map. Master (the
 *  dashboard) uses the same shell but has no "home" link/brand, since it
 *  IS home — pass showBrand={false} there. `children` is the page's own
 *  header-actions content (bells, toggle, profile, toolbar buttons). */
export function AppHeader({ showBrand = true, children }) {
  return (
    <header className="app-header">
      <div className="header-fx" aria-hidden="true">
        <span className="fx-aurora" />
        <span className="fx-grid" />
        <span className="fx-beam" />
        <span className="fx-line" />
      </div>
      <div className="header-inner">
        {showBrand && (
          <>
            <Link className="home-btn" to="/" title="Home" aria-label="Go to Home">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/></svg>
            </Link>
            <div className="brand">
              <img className="brand-logo on-light" src={logoLight} alt="InfoStride" width="2560" height="349" />
              <img className="brand-logo on-dark" src={logoDark} alt="InfoStride" width="853" height="120" />
            </div>
          </>
        )}

        <div className="header-spacer" />

        <div className="header-actions">
          {showBrand && <AppSwitcher />}
          {children}
        </div>
      </div>
    </header>
  );
}
