import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import styles from './NotepadWidget.module.css';

const STORAGE_KEY = 'infostride-notepad-v1';
const SAVE_DEBOUNCE_MS = 500;
const MAX_HISTORY = 20;

const SWATCHES = [
  { key: 'auto', label: 'Theme ink', value: null },
  { key: 'red', label: 'Red', value: '#e11d48' },
  { key: 'blue', label: 'Blue', value: '#2563eb' },
  { key: 'green', label: 'Green', value: '#059669' },
  { key: 'amber', label: 'Amber', value: '#d97706' },
];

const ico = {
  pen: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>,
  eraser: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H9l-6-6a2 2 0 0 1 0-2.8L13.2 2a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8L12 19" /></svg>,
  text: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 4 4 20 4 20 7" /><line x1="9" y1="20" x2="15" y2="20" /><line x1="12" y1="4" x2="12" y2="20" /></svg>,
  undo: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10h10a5 5 0 0 1 0 10H9" /><polyline points="7 6 3 10 7 14" /></svg>,
  trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" /></svg>,
  note: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="M15 5l4 4" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
};

function themeInk() {
  const css = getComputedStyle(document.documentElement);
  return (css.getPropertyValue('--text').trim() || '#111726');
}

/** A floating whiteboard — freehand drawing (mouse or touch) plus a text
 *  tool for typed notes, both on the same canvas. Pen/eraser/text all
 *  draw onto one transparent-background canvas sitting over a themed
 *  panel, so "auto" ink color and the board background both pick up
 *  light/dark automatically with no extra plumbing. Saves to
 *  localStorage (per browser, not shared across the team) so a note
 *  survives closing the panel or reloading the page. */
export function NotepadWidget() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState('pen');
  const [colorKey, setColorKey] = useState('auto');
  const [size, setSize] = useState(3);
  const [textBox, setTextBox] = useState(null); // { x, y, value }

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const historyRef = useRef([]);
  const saveTimerRef = useRef(null);

  const currentColor = useCallback(() => {
    const sw = SWATCHES.find((s) => s.key === colorKey);
    return (sw && sw.value) || themeInk();
  }, [colorKey]);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const prev = canvas.toDataURL ? canvas.toDataURL() : null;
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = wrap;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (prev && w > 0 && h > 0) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = prev;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try { window.localStorage.setItem(STORAGE_KEY, canvas.toDataURL()); } catch { /* ignore */ }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current.push(canvas.toDataURL());
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  }, []);

  function undo() {
    const canvas = canvasRef.current;
    if (!canvas || historyRef.current.length === 0) return;
    const prevData = historyRef.current.pop();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    const img = new Image();
    img.onload = () => { ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr); scheduleSave(); };
    img.src = prevData;
  }

  function clearBoard() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    pushHistory();
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    scheduleSave();
  }

  function pointFromEvent(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    if (tool === 'text') {
      const p = pointFromEvent(e);
      setTextBox({ x: p.x, y: p.y, value: '' });
      return;
    }
    pushHistory();
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(e);
    canvasRef.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const p = pointFromEvent(e);
    const last = lastPointRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = size * 4;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = size;
      ctx.strokeStyle = currentColor();
    }
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    scheduleSave();
  }

  function commitText() {
    if (!textBox) return;
    const text = textBox.value.trim();
    if (text) {
      pushHistory();
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = currentColor();
      ctx.font = `${12 + size * 3}px Inter, sans-serif`;
      ctx.textBaseline = 'top';
      text.split('\n').forEach((line, i) => {
        ctx.fillText(line, textBox.x, textBox.y + i * (16 + size * 3));
      });
      scheduleSave();
    }
    setTextBox(null);
  }

  useEffect(() => {
    if (!open) return undefined;
    resizeCanvas();
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
        img.src = saved;
      }
    } catch { /* ignore */ }
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [open, resizeCanvas]);

  if (!isAuthenticated) return null;

  return (
    <>
      <button
        type="button"
        className={styles.launcher}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close notepad' : 'Open notepad'}
        title="Notepad"
      >
        {ico.note}
      </button>

      {open && (
        <div className={styles.panel} role="dialog" aria-label="Notepad">
          <div className={styles.panelHead}>
            <div className={styles.panelTitle}>Notepad</div>
            <button type="button" className={styles.iconBtn} onClick={() => setOpen(false)} aria-label="Close notepad">{ico.close}</button>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.toolGroup} role="group" aria-label="Tool">
              <button type="button" className={styles.toolBtn} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')} title="Pen">{ico.pen}</button>
              <button type="button" className={styles.toolBtn} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser">{ico.eraser}</button>
              <button type="button" className={styles.toolBtn} aria-pressed={tool === 'text'} onClick={() => setTool('text')} title="Type text">{ico.text}</button>
            </div>
            <div className={styles.swatches} role="group" aria-label="Color">
              {SWATCHES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  className={styles.swatch}
                  aria-pressed={colorKey === s.key}
                  aria-label={s.label}
                  title={s.label}
                  style={{ background: s.value || 'var(--text)' }}
                  onClick={() => setColorKey(s.key)}
                />
              ))}
            </div>
            <input
              className={styles.sizeSlider}
              type="range"
              min="1" max="10" value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              aria-label="Pen size"
              title="Pen size"
            />
            <div className={styles.toolGroup}>
              <button type="button" className={styles.toolBtn} onClick={undo} title="Undo">{ico.undo}</button>
              <button type="button" className={styles.toolBtn} onClick={clearBoard} title="Clear board">{ico.trash}</button>
            </div>
          </div>

          <div className={styles.boardWrap} ref={wrapRef}>
            <canvas
              ref={canvasRef}
              className={`${styles.board} ${tool === 'text' ? styles.textCursor : ''}`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            {textBox && (
              <textarea
                className={styles.textInput}
                style={{ left: textBox.x, top: textBox.y, fontSize: `${12 + size * 3}px` }}
                autoFocus
                value={textBox.value}
                onChange={(e) => setTextBox((t) => ({ ...t, value: e.target.value }))}
                onBlur={commitText}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitText(); } if (e.key === 'Escape') setTextBox(null); }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
