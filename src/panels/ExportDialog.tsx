import { useState } from 'react';
import { Download, FileImage, FileCode2, Printer, Globe, Table2 } from 'lucide-react';
import { useStore } from '../store/store';
import { Modal, Row, Select, Toggle, NumInput } from '../ui/controls';
import { exportCableScheduleCsv, exportInventoryCsv, exportPdf, exportPng, exportSvg, exportViewerHtml } from '../export/exporters';
import type { ThemeName } from '../render/theme';

type Format = 'png' | 'svg' | 'pdf' | 'html' | 'csv-devices' | 'csv-cables';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [format, setFormat] = useState<Format>('png');
  const [theme, setTheme] = useState<ThemeName | 'current'>('current');
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState(true);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [allPages, setAllPages] = useState(s.doc.pages.length > 1);
  const [padding, setPadding] = useState(40);
  const [busy, setBusy] = useState(false);

  const opts = { theme: theme === 'current' ? s.theme : theme, background, selectionOnly: selectionOnly && !!s.selection.length, scale, padding };
  const run = async () => {
    setBusy(true);
    try {
      if (format === 'png') await exportPng(opts);
      else if (format === 'svg') await exportSvg(opts);
      else if (format === 'pdf') await exportPdf({ ...opts, allPages });
      else if (format === 'html') exportViewerHtml();
      else if (format === 'csv-devices') exportInventoryCsv();
      else if (format === 'csv-cables') exportCableScheduleCsv();
      onClose();
    } catch (e: any) {
      s.toast('Export failed: ' + (e?.message ?? e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const formats: { id: Format; label: string; hint: string; icon: React.ReactNode }[] = [
    { id: 'png', label: 'PNG image', hint: 'Raster image for slides, wikis and chat', icon: <FileImage size={18} /> },
    { id: 'svg', label: 'SVG vector', hint: 'Crisp at any size; fonts embedded; editable in Inkscape/Illustrator', icon: <FileCode2 size={18} /> },
    { id: 'pdf', label: 'PDF / print', hint: 'One sheet per page via the browser print dialog', icon: <Printer size={18} /> },
    { id: 'html', label: 'Interactive HTML', hint: 'Self-contained viewer: pan, zoom, search, hover details — opens offline', icon: <Globe size={18} /> },
    { id: 'csv-devices', label: 'Device inventory (CSV)', hint: 'Every device with type, addresses, VLANs and properties', icon: <Table2 size={18} /> },
    { id: 'csv-cables', label: 'Cable schedule (CSV)', hint: 'Every link with both ends, ports, media, speed, VLANs and cable IDs', icon: <Table2 size={18} /> },
  ];
  const isImage = format === 'png' || format === 'svg' || format === 'pdf';

  return (
    <Modal title="Export" onClose={onClose} width={720}
      footer={<>
        <span className="hint">{format === 'html' ? 'The viewer file is the whole app: recipients can also switch to editing.' : format === 'pdf' ? 'Choose “Save as PDF” as the printer.' : ''}</span>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={run}><Download size={14} /> Export</button>
      </>}
    >
      <div className="export-grid">
        <div className="export-formats">
          {formats.map((f) => (
            <button key={f.id} className={'export-format' + (format === f.id ? ' active' : '')} onClick={() => setFormat(f.id)}>
              <span className="export-icon">{f.icon}</span>
              <span className="grow"><div className="export-label">{f.label}</div><div className="hint">{f.hint}</div></span>
            </button>
          ))}
        </div>
        <div className="export-options">
          {isImage && (
            <>
              <Row label="Theme">
                <Select value={theme} onChange={setTheme} options={[{ value: 'current', label: `Current (${s.theme})` }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
              </Row>
              {format === 'png' && <Row label="Scale"><Select value={String(scale)} onChange={(v) => setScale(Number(v))} options={[{ value: '1', label: '1× (screen)' }, { value: '2', label: '2× (default)' }, { value: '3', label: '3×' }, { value: '4', label: '4× (print)' }]} /></Row>}
              <Row label="Padding"><NumInput value={padding} min={0} max={400} precision={0} onChange={setPadding} suffix="px" /></Row>
              {format !== 'pdf' && <Row><Toggle label="Background colour (off = transparent)" checked={background} onChange={setBackground} /></Row>}
              {format !== 'pdf' && <Row><Toggle label={`Selection only${s.selection.length ? ` (${s.selection.length} objects)` : ' — nothing selected'}`} checked={selectionOnly && !!s.selection.length} onChange={setSelectionOnly} /></Row>}
              {format === 'pdf' && s.doc.pages.length > 1 && <Row><Toggle label={`All ${s.doc.pages.length} pages`} checked={allPages} onChange={setAllPages} /></Row>}
            </>
          )}
          {format === 'html' && (
            <div className="hint" style={{ lineHeight: 1.6 }}>
              Produces one <b>.html</b> file (~1 MB) with the diagram embedded. Anyone can open it in a browser with no install or internet:
              pan and zoom, switch pages, search devices, hover for addresses and properties, click a device for its full details and ports,
              print, or download the diagram as a NetCanvas file. An “Edit” button turns it into the full editor.
            </div>
          )}
          {(format === 'csv-devices' || format === 'csv-cables') && (
            <div className="hint" style={{ lineHeight: 1.6 }}>UTF-8 CSV with a header row, one row per {format === 'csv-devices' ? 'device' : 'link'} across all pages. Opens directly in Excel / LibreOffice.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
