import { useEffect, useRef, useState } from 'react';
import styles from './InstallGate.module.css';

function isStandalone() {
  return Boolean(
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
    || window.navigator.standalone === true // iOS Safari's own flag for "added to home screen"
  );
}

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iPhone|iPad|iPod/i.test(ua);
const isSafari = /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
const isFirefox = /firefox/i.test(ua);

// How long to wait for the browser to offer its own install prompt before
// concluding it doesn't have one at all. Chrome/Edge fire this essentially
// immediately once the page's installability criteria are met; Firefox
// desktop and Safari never fire it, so this timer is really just "don't
// show the fallback instructions for an instant before Chrome's own event
// has a chance to arrive."
const PROMPT_GRACE_MS = 1500;

function Instructions() {
  if (isIOS && isSafari) {
    return <p>Tap the <strong>Share</strong> icon, then <strong>Add to Home Screen</strong>.</p>;
  }
  if (isSafari) {
    return <p>Open the <strong>File</strong> menu and choose <strong>Add to Dock</strong> (Safari 17+), or use Chrome/Edge to install it as an app.</p>;
  }
  if (isFirefox) {
    return <p>Firefox doesn't support installing web apps. Use Chrome or Edge to install Meeting Board as an app.</p>;
  }
  return <p>Look for an "Install" or "Add to Home Screen" option in your browser's menu.</p>;
}

/** Wraps the entire app (see main.jsx) and blocks it behind an install
 *  prompt until the app is actually running installed/standalone — as
 *  close to "compulsory" as a website can get, since no web API can force
 *  an install or a taskbar pin without the person's own action.
 *
 *  On a browser that can't install web apps at all (Firefox desktop,
 *  Safari), there is no prompt to force here, so after a short grace
 *  period this shows manual per-browser instructions plus a one-time-per-
 *  load "Continue without installing" escape hatch — without it, anyone on
 *  those browsers would be completely locked out with no way in at all. */
export function InstallGate({ children }) {
  const [installed, setInstalled] = useState(isStandalone);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [promptUnsupported, setPromptUnsupported] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const [installing, setInstalling] = useState(false);
  // Mirrors deferredPrompt for the grace-period timer below, which needs the
  // LATEST value at the moment it fires rather than whatever was captured
  // in its closure when the effect first ran.
  const deferredPromptRef = useRef(null);

  useEffect(() => {
    if (installed) return undefined;

    function onBeforeInstall(e) {
      e.preventDefault();
      deferredPromptRef.current = e;
      setDeferredPrompt(e);
      setPromptUnsupported(false);
    }
    function onInstalled() { setInstalled(true); }
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia('(display-mode: standalone)');
    function onDisplayModeChange(e) { if (e.matches) setInstalled(true); }
    if (mq.addEventListener) mq.addEventListener('change', onDisplayModeChange);
    else mq.addListener(onDisplayModeChange);

    const timer = setTimeout(() => {
      if (!deferredPromptRef.current) setPromptUnsupported(true);
    }, PROMPT_GRACE_MS);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if (mq.removeEventListener) mq.removeEventListener('change', onDisplayModeChange);
      else mq.removeListener(onDisplayModeChange);
      clearTimeout(timer);
    };
  }, [installed]);

  if (installed || bypassed) return children;

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstalling(false);
    if (choice.outcome !== 'accepted') setDeferredPrompt(null);
  }

  return (
    <div className={styles.wrap} role="alertdialog" aria-label="Install required">
      <div className={styles.card}>
        <h1 className={styles.title}>Install Meeting Board to continue</h1>
        <p className={styles.body}>This app needs to be installed and pinned like a desktop app before you can use it.</p>

        {deferredPrompt ? (
          <button type="button" className="btn btn-primary" onClick={install} disabled={installing}>
            {installing ? 'Opening install prompt…' : 'Install app'}
          </button>
        ) : promptUnsupported ? (
          <>
            <div className={styles.instructions}><Instructions /></div>
            <button type="button" className="btn" onClick={() => setBypassed(true)}>
              Continue without installing
            </button>
          </>
        ) : (
          <p className={styles.waiting}>Checking install support…</p>
        )}
      </div>
    </div>
  );
}
