import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import { initPersistence, saveDocNow } from './store/persistence';
import { Sheet } from './dev/Sheet';
import { Viewer } from './viewer/Viewer';
import { useStore } from './store/store';
import type { DiagramDoc } from './model/types';
import { uid } from './model/util';
import { tryNormalizeDoc } from './model/validate';

declare global {
  interface Window { __NETWORKCANVAS_DOC__?: DiagramDoc; __NETWORKCANVAS_VIEW__?: boolean }
}

const root = createRoot(document.getElementById('root')!);
const sheet = new URLSearchParams(location.search).get('sheet');
// interactive HTML exports carry their diagram in a JSON data block (older exports used a global)
function embeddedDoc(): unknown {
  const el = document.getElementById('networkcanvas-doc');
  if (el?.textContent) { try { return JSON.parse(el.textContent); } catch { return undefined; } }
  return window.__NETWORKCANVAS_VIEW__ ? window.__NETWORKCANVAS_DOC__ : undefined;
}
const rawEmbedded = embeddedDoc();
const embedded = rawEmbedded ? tryNormalizeDoc(rawEmbedded) : null;

function bootEditor() {
  initPersistence().finally(() => {
    root.render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  });
}

if (sheet) {
  root.render(<Sheet filter={sheet} />);
} else if (embedded) {
  // interactive export: read-only viewer; "Edit" opens the editor with a copy of the embedded diagram
  const onEdit = () => {
    useStore.setState({ readOnly: false, hideUi: false });
    initPersistence().finally(async () => {
      const copy: DiagramDoc = { ...embedded, id: uid('doc'), updatedAt: Date.now() };
      useStore.getState().loadDoc(copy);
      await saveDocNow(copy);
      root.render(<ErrorBoundary><App /></ErrorBoundary>);
    });
  };
  root.render(<ErrorBoundary><Viewer doc={embedded} onEdit={onEdit} /></ErrorBoundary>);
} else {
  bootEditor();
}
