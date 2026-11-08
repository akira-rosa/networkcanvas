import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

/** Lets scrubbable controls record one undo step per drag gesture (provided by the inspector / editor). */
export const GestureContext = createContext<{ begin: () => void; end: () => void } | null>(null);

export function Section({ title, children, actions, collapsible = false }: { title: string; children: React.ReactNode; actions?: React.ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="insp-section">
      <header onClick={collapsible ? () => setOpen(!open) : undefined} style={collapsible ? { cursor: 'pointer' } : undefined}>
        <span>{title}</span>
        <div className="insp-actions" onClick={(e) => e.stopPropagation()}>{actions}</div>
      </header>
      {open && <div className="insp-body">{children}</div>}
    </section>
  );
}

export function Row({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="insp-row">
      {label && <label>{label}</label>}
      <div className="insp-row-fields">{children}</div>
    </div>
  );
}

/** Text input that commits on blur/Enter (keeps undo history clean). */
export function TextInput({
  value, onChange, placeholder, mono, className, prefix, autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; className?: string; prefix?: React.ReactNode; autoFocus?: boolean }) {
  const [v, setV] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setV(value), [value]);
  return (
    <div className={'input-wrap ' + (className ?? '')}>
      {prefix && <span className="input-prefix">{prefix}</span>}
      <input
        className={'input' + (mono ? ' mono' : '')}
        value={v}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (cancelled.current) { cancelled.current = false; setV(value); return; } if (v !== value) onChange(v); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { cancelled.current = true; setV(value); (e.target as HTMLInputElement).blur(); }
        }}
      />
    </div>
  );
}

export function TextArea({ value, onChange, rows = 3, placeholder }: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const [v, setV] = useState(value);
  const cancelled = useRef(false);
  useEffect(() => setV(value), [value]);
  return (
    <textarea className="input textarea" rows={rows} value={v} placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { if (cancelled.current) { cancelled.current = false; setV(value); return; } if (v !== value) onChange(v); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { cancelled.current = true; setV(value); (e.target as HTMLTextAreaElement).blur(); } }} />
  );
}

/** Number field with Figma-style drag-to-scrub label. */
export function NumInput({
  value, onChange, label, step = 1, min, max, precision = 1, suffix,
}: { value: number; onChange: (v: number) => void; label?: string; step?: number; min?: number; max?: number; precision?: number; suffix?: string }) {
  const fmt = (n: number) => String(Math.round(n * 10 ** precision) / 10 ** precision);
  const [v, setV] = useState(fmt(value));
  useEffect(() => setV(fmt(value)), [value]);
  const clampV = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const drag = useRef<{ x: number; v: number; begun: boolean } | null>(null);
  const cancelled = useRef(false);
  const gesture = useContext(GestureContext);
  return (
    <div className="input-wrap num">
      {label && (
        <span
          className="input-prefix scrub"
          onPointerDown={(e) => { drag.current = { x: e.clientX, v: value, begun: false }; (e.target as Element).setPointerCapture(e.pointerId); }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            if (!d.begun) { d.begun = true; gesture?.begin(); }
            onChange(clampV(d.v + Math.round((e.clientX - d.x) / 2) * step));
          }}
          onPointerUp={() => { if (drag.current?.begun) gesture?.end(); drag.current = null; }}
        >
          {label}
        </span>
      )}
      <input
        className="input"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (cancelled.current) { cancelled.current = false; setV(fmt(value)); return; } const n = parseFloat(v); if (!isNaN(n) && n !== value) onChange(clampV(n)); else setV(fmt(value)); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { cancelled.current = true; setV(fmt(value)); (e.target as HTMLInputElement).blur(); }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            onChange(clampV(value + d));
          }
        }}
      />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <select className={'input select ' + (className ?? '')} value={value} onChange={(e) => onChange(e.target.value as T)} onKeyDown={(e) => e.stopPropagation()}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track"><span className="toggle-thumb" /></span>
      {label && <span className="toggle-label">{label}</span>}
    </label>
  );
}

export function ColorInput({ value, onChange, allowNone, tokens }: { value?: string; onChange: (v: string | undefined) => void; allowNone?: boolean; tokens?: string[] }) {
  const isHex = !!value && value.startsWith('#');
  return (
    <div className="color-input">
      <label className="swatch" style={{ background: isHex ? value : value?.startsWith('accent') ? 'linear-gradient(135deg,#1a8fd8,#0d5c8f)' : 'transparent' }}>
        <input type="color" value={isHex ? value!.slice(0, 7) : '#1a8fd8'} onChange={(e) => onChange(e.target.value)} />
        {!value && <span className="swatch-none" />}
      </label>
      <TextInput value={value ?? ''} placeholder={allowNone ? 'auto' : ''} onChange={(v) => onChange(v.trim() || undefined)} mono />
      {tokens && (
        <select className="input select token-select" value={value?.startsWith('accent') ? value : ''} onChange={(e) => e.target.value && onChange(e.target.value)}>
          <option value="">token…</option>
          {tokens.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      )}
    </div>
  );
}

export function IconButton({
  title, onClick, children, active, disabled, className, shortcut,
}: { title: string; onClick?: (e: React.MouseEvent) => void; children: React.ReactNode; active?: boolean; disabled?: boolean; className?: string; shortcut?: string }) {
  return (
    <button
      className={'icon-btn' + (active ? ' active' : '') + (className ? ' ' + className : '')}
      title={shortcut ? `${title} (${shortcut})` : title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function Modal({ title, children, onClose, width = 640, footer }: { title: string; children: React.ReactNode; onClose: () => void; width?: number; footer?: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}
