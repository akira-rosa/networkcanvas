import { useState } from 'react';
import { useStore } from '../store/store';
import { resolveConflict, saveDocNow, saveToFile } from '../store/persistence';
import './banner.css';

/** Problems with saving that the user must see: a failed save, a conflict with another tab, the same diagram open twice. */
export function SaveBanner() {
  const saveError = useStore((s) => s.saveError);
  const conflict = useStore((s) => s.saveConflict);
  const elsewhere = useStore((s) => s.openElsewhere);
  const home = useStore((s) => s.home);
  const storageOk = useStore((s) => s.storageOk);
  const [hideElsewhere, setHideElsewhere] = useState(false);
  if (conflict && !home) {
    return (
      <div className="banner error" role="alert">
        <span><b>Your latest changes are not saved.</b> This diagram was changed in another tab or window after you opened it here.</span>
        <button className="btn sm" onClick={() => resolveConflict('mine')}>Keep my version as a copy</button>
        <button className="btn sm" onClick={() => resolveConflict('theirs')}>Load the other version</button>
      </div>
    );
  }
  if (!storageOk) {
    return (
      <div className="banner error" role="alert">
        <span><b>This browser is not keeping your diagrams</b> (storage is blocked or this is a private window). Save every diagram to a file before closing.</span>
        {!home && <button className="btn sm" onClick={() => saveToFile()}>Save to file</button>}
      </div>
    );
  }
  if (saveError) {
    return (
      <div className="banner error" role="alert">
        <span><b>{saveError}</b> {home ? '' : 'Your work is only in this tab: save it to a file now.'}</span>
        {!home && <button className="btn sm primary" onClick={() => saveToFile()}>Save to file</button>}
        {!home && <button className="btn sm" onClick={() => saveDocNow(useStore.getState().doc)}>Try again</button>}
      </div>
    );
  }
  if (elsewhere && !home && !hideElsewhere) {
    return (
      <div className="banner warn" role="status">
        <span>This diagram is also open in another tab or window. Edit it in one place only; if both are changed, you will be asked which version to keep.</span>
        <button className="btn sm ghost" onClick={() => setHideElsewhere(true)}>Dismiss</button>
      </div>
    );
  }
  return null;
}
