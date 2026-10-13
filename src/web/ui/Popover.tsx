import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * Place a menu under (or above) its anchor and keep it fully inside the viewport.
 * align 'start' = left edges aligned, 'end' = right edges aligned.
 */
export function placePopover(anchor: Rect, vw: number, vh: number, w: number, h: number, align: 'start' | 'end' = 'start'): { left: number; top: number; maxHeight: number } {
  const margin = 8;
  let left = align === 'end' ? anchor.right - w : anchor.left;
  left = Math.max(margin, Math.min(left, vw - w - margin));
  const below = vh - anchor.bottom - margin;
  const above = anchor.top - margin;
  let top: number;
  let maxHeight: number;
  if (below >= Math.min(h, 240) || below >= above) {
    maxHeight = Math.max(80, Math.min(h, below));
    top = anchor.bottom + 2;
  } else {
    maxHeight = Math.max(80, Math.min(h, above));
    top = anchor.top - 2 - maxHeight;
  }
  maxHeight = Math.min(maxHeight, vh - 2 * margin);
  top = Math.max(margin, Math.min(top, vh - margin - maxHeight));
  return { left, top, maxHeight };
}

interface Props {
  anchor: HTMLElement | null;
  open: boolean;
  onClose(): void;
  /** px; also used for placement */
  width?: number;
  /** max height in px before scrolling */
  height?: number;
  align?: 'start' | 'end';
  className?: string;
  children: React.ReactNode;
}

/** Menu rendered in a portal with position: fixed, so panels with overflow never clip it. */
export function Popover({ anchor, open, onClose, width = 220, height = 360, align = 'start', className = '', children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const update = () => setPos(placePopover(anchor.getBoundingClientRect(), window.innerWidth, window.innerHeight, width, height, align));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchor, width, height, align]);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  const p = pos ?? { left: 0, top: 0, maxHeight: height };
  return createPortal(
    <div
      ref={ref}
      className={`popover ${className}`}
      style={{ position: 'fixed', left: p.left, top: p.top, width, maxHeight: p.maxHeight, visibility: pos ? 'visible' : 'hidden' }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Small helper: a button that toggles a Popover anchored to itself. */
export function useAnchor<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [open, setOpen] = useState(false);
  return { ref: setEl, el, open, setOpen, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}
