import { Circle, MessageSquare, Minus, MoveHorizontal, MoveRight, Square, SquareRoundCorner, Star, Target, X, type LucideIcon } from 'lucide-react';
import type { ShapeKind } from '../../shared/types';

export const SHAPES: { kind: ShapeKind; icon: LucideIcon; label: string }[] = [
  { kind: 'rect', icon: Square, label: 'Kotak' },
  { kind: 'roundRect', icon: SquareRoundCorner, label: 'Kotak tumpul' },
  { kind: 'ellipse', icon: Circle, label: 'Elips' },
  { kind: 'line', icon: Minus, label: 'Garis' },
  { kind: 'arrow', icon: MoveRight, label: 'Panah' },
  { kind: 'doubleArrow', icon: MoveHorizontal, label: 'Panah 2 arah' },
  { kind: 'target', icon: Target, label: 'Target' },
  { kind: 'cross', icon: X, label: 'Silang' },
  { kind: 'star', icon: Star, label: 'Bintang' },
  { kind: 'bubble', icon: MessageSquare, label: 'Balon kata' },
];

export function ShapeMenu({ onPick }: { onPick: (k: ShapeKind) => void }) {
  return (
    <div className="shape-menu">
      {SHAPES.map((s) => (
        <button key={s.kind} title={s.label} onClick={() => onPick(s.kind)}>
          <span className="shape-icon"><s.icon size={18} strokeWidth={1.75} aria-hidden /></span>
          <span className="shape-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
