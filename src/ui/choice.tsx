import { create } from 'zustand';
import { Modal } from './controls';

// A small "choose one of these" dialog that code can await, for decisions that must not be
// guessed (replace a stored diagram or keep both, for example).

export interface ChoiceOption<T extends string> { value: T; label: string; primary?: boolean }
interface Pending { title: string; message: string; options: ChoiceOption<string>[]; resolve: (v: string | null) => void }

const useChoice = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Shows the dialog and resolves with the chosen value, or null when it is dismissed. */
export function askChoice<T extends string>(title: string, message: string, options: ChoiceOption<T>[]): Promise<T | null> {
  return new Promise((resolve) => {
    useChoice.getState().pending?.resolve(null);
    useChoice.setState({ pending: { title, message, options, resolve: (v) => resolve(v as T | null) } });
  });
}

export function ChoiceHost() {
  const pending = useChoice((s) => s.pending);
  if (!pending) return null;
  const done = (v: string | null) => { useChoice.setState({ pending: null }); pending.resolve(v); };
  return (
    <Modal title={pending.title} onClose={() => done(null)} width={480}
      footer={<>
        <button className="btn ghost" onClick={() => done(null)}>Cancel</button>
        {pending.options.map((o) => (
          <button key={o.value} className={'btn' + (o.primary ? ' primary' : '')} onClick={() => done(o.value)} autoFocus={o.primary}>{o.label}</button>
        ))}
      </>}>
      <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{pending.message}</p>
    </Modal>
  );
}
