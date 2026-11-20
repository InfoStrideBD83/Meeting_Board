import { useEffect, useState } from 'react';
import styles from './InstallAppButton.module.css';

/** A floating "Install app" affordance — this is as close as a website can
 *  get to the "pin it to the taskbar" of a native app like Teams. Browsers
 *  deliberately don't expose any API for a page to install or pin itself
 *  without the person's own click on a native browser-chrome prompt (that's
 *  a hard security boundary, not a gap in this implementation) — what this
 *  button does is surface that native prompt as soon as the browser
 *  considers the site installable, rather than making someone dig through
 *  a browser menu to find "Install Meeting Board" themselves. Once
 *  installed, it opens in its own window and (on Windows) can be pinned to
 *  the taskbar the same way any other installed app can. */
export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
  );

  useEffect(() => {
    function onBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  async function install() {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <button type="button" className={styles.installBtn} onClick={install} title="Install as a desktop app">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
      <span>Install app</span>
    </button>
  );
}
