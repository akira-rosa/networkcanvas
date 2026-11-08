// Contact sheet for validating icons: open NetCanvas with ?sheet=iso | detailed | all | id1,id2
import { ALL_BUILTIN } from '../library';
import { DeviceGraphic } from '../render/ShapeView';
import { DeviceLabel } from '../render/DiagramLayer';
import { canvasThemes, MEDIA_COLORS } from '../render/theme';
import { portWorld } from '../model/geometry';
import type { DeviceDef, DeviceNode } from '../model/types';

function Render({ def, scale, theme, label, ports = true }: { def: DeviceDef; scale: number; theme: 'dark' | 'light'; label?: boolean; ports?: boolean }) {
  const t = canvasThemes[theme];
  const w = def.w * scale, h = def.h * scale;
  const node: DeviceNode = { kind: 'device', id: 'x', defId: def.id, x: 0, y: 0, w, h, name: def.prefix ? def.prefix + '01' : 'dev01', addresses: [{ id: 'a', vlan: undefined, value: '192.168.150.10' }], props: {}, labelPos: 'bottom' };
  const padX = Math.max(30, (150 - w) / 2);
  const W = w + padX * 2, H = h + (label ? 48 : 16) + 12;
  return (
    <svg width={W} height={H} viewBox={`${-padX} -10 ${W} ${H}`} style={{ background: t.bg, borderRadius: 6, display: 'block' }}>
      <DeviceGraphic def={def} x={0} y={0} w={w} h={h} />
      {ports && def.ports.map((p) => { const pw = portWorld(node, def, p); return <circle key={p.id} cx={pw.x} cy={pw.y} r={2.4} fill={t.portFill} stroke={MEDIA_COLORS[p.media]} strokeWidth={1.2} />; })}
      {label && <DeviceLabel n={node} vlans={[]} theme={t} />}
    </svg>
  );
}

export function Sheet({ filter }: { filter: string }) {
  const ids = filter.includes(',') || !['iso', 'detailed', 'all'].includes(filter) ? new Set(filter.split(',')) : null;
  const defs = ALL_BUILTIN.filter((d) => (ids ? ids.has(d.id) : filter === 'all' || d.style === filter));
  return (
    <div style={{ padding: 16, background: '#151618', minHeight: '100vh', fontFamily: 'system-ui', color: '#ddd' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {defs.map((d) => {
          const big = Math.min(170 / d.w, 130 / d.h);
          return (
            <div key={d.id} style={{ width: 300, background: '#202124', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{d.name} <span style={{ color: '#888', fontWeight: 400 }}>· {d.id} · {d.w}×{d.h} · {d.ports.length}p</span></div>
              <div style={{ display: 'flex', justifyContent: 'center' }}><Render def={d} scale={big} theme="dark" /></div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <Render def={d} scale={1.25} theme="dark" label ports={false} />
                <Render def={d} scale={1.25} theme="light" label ports={false} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
