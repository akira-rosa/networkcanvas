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

declare global {
  interface Window { __NETCANVAS_DOC__?: DiagramDoc; __NETCANVAS_VIEW__?: boolean }
}

const root = createRoot(document.getElementById('root')!);
const sheet = new URLSearchParams(location.search).get('sheet');
const embedded = window.__NETCANVAS_DOC__;

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
} else if (embedded && window.__NETCANVAS_VIEW__) {
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
