import { Component, type ReactNode } from 'react';

// Keeps a rendering bug from leaving a blank screen. Diagrams are already
// autosaved in the browser, so reloading is safe.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 40, maxWidth: 640, margin: '10vh auto', fontFamily: 'system-ui', color: 'var(--text)' }}>
        <h2>Something went wrong</h2>
        <p style={{ color: 'var(--text-2)' }}>Your diagram is saved in this browser. Reload to continue.</p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: 'var(--bg-2)', padding: 12, borderRadius: 8 }}>{String(this.state.error.stack || this.state.error)}</pre>
        <button className="btn primary" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
