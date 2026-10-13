import type { ShapeKind } from '../../shared/types';

export const SHAPES: { kind: ShapeKind; icon: string; label: string }[] = [
  { kind: 'rect', icon: '□', label: 'Kotak' },
  { kind: 'roundRect', icon: '▢', label: 'Kotak tumpul' },
  { kind: 'ellipse', icon: '○', label: 'Elips' },
  { kind: 'line', icon: '─', label: 'Garis' },
  { kind: 'arrow', icon: '→', label: 'Panah' },
  { kind: 'doubleArrow', icon: '↔', label: 'Panah 2 arah' },
  { kind: 'target', icon: '◎', label: 'Target' },
  { kind: 'cross', icon: '✕', label: 'Silang' },
  { kind: 'star', icon: '☆', label: 'Bintang' },
  { kind: 'bubble', icon: '💬', label: 'Balon kata' },
];

export function ShapeMenu({ onPick, onClose }: { onPick: (k: ShapeKind) => void; onClose: () => void }) {
  return (
    <div className="menu shape-menu" onMouseLeave={onClose}>
      {SHAPES.map((s) => (
        <button key={s.kind} title={s.label} onClick={() => onPick(s.kind)}>
          <span className="shape-icon">{s.icon}</span>
          <span className="shape-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
