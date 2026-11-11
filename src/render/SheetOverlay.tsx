import { memo } from 'react';
import type { DiagramDoc, Page, SheetSetup } from '../model/types';
import { MARGIN, tiles } from '../model/sheet';
import { SheetFrame, sheetInfos } from './SheetFrame';
import type { CanvasTheme } from './theme';

/** the page's drawing sheets drawn behind the diagram, so people see what will print where */
export const SheetOverlay = memo(function SheetOverlay({ doc, page, sheet, theme }: { doc: DiagramDoc; page: Page; sheet: SheetSetup; theme: CanvasTheme }) {
  const k = sheet.unitsPerMm;
  const ts = tiles(sheet);
  const infos = sheetInfos(doc, page, sheet);
  return (
    <g pointerEvents="none">
      {ts.map((t, i) => (
        <g key={i} transform={`translate(${t.frame.x - MARGIN.left * k} ${t.frame.y - MARGIN.top * k}) scale(${k})`}>
          <SheetFrame info={infos[i]} theme={theme} preview />
        </g>
      ))}
    </g>
  );
});
