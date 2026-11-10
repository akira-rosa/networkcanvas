import { Component, type ReactNode } from 'react';
import { useStore } from './store/store';
import { downloadText } from './model/util';
import { safeName } from './store/persistence';

/**
 * Keeps a rendering bug from leaving a blank screen. `fallback` replaces the failed part only
 * (a start-screen preview, say); without it the whole-app screen offers a way back and a way to
 * keep the diagram as a file.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: (error: Error) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(error); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error);
    const doc = useStore.getState().doc;
    const home = useStore.getState().home;
    return (
      <div style={{ padding: 40, maxWidth: 640, margin: '10vh auto', fontFamily: 'system-ui', color: 'var(--text)' }}>
        <h2>Network Canvas hit a problem</h2>
        <p style={{ color: 'var(--text-2)' }}>
          {home
            ? 'The start screen could not be shown.'
            : `“${doc.name}” could not be shown. Download it as a file to keep a copy, then go back to your diagrams.`}
        </p>
        <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
          {!home && (
            <button className="btn" onClick={() => downloadText(safeName(doc.name) + '.networkcanvas.json', JSON.stringify(doc, null, 1))}>Download this diagram</button>
          )}
          <button className="btn primary" onClick={() => { useStore.setState({ home: true, modal: null, editor: null }); this.setState({ error: null }); }}>Back to your diagrams</button>
          <button className="btn ghost" onClick={() => location.reload()}>Reload</button>
        </div>
        <details>
          <summary style={{ cursor: 'pointer', color: 'var(--text-3)' }}>Technical details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg-2)', padding: 12, borderRadius: 8 }}>{String(error.stack || error)}</pre>
        </details>
      </div>
    );
  }
}
