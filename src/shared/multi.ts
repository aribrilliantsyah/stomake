import { newId } from './ids';
import { findPanel, updatePanel } from './model';
import type { Layer, Project } from './types';

/** Multi-layer operations. Groups are flat: a layer has at most one `groupId`, shared by >= 2 layers in the same panel. */

const idSet = (ids: string[]) => new Set(ids);

/** Selecting one member of a group selects the whole group. Order follows `layers` (back → front). */
export function expandGroups(layers: Layer[], ids: string[]): string[] {
  const want = idSet(ids);
  const groups = new Set(layers.filter((l) => want.has(l.id) && l.groupId).map((l) => l.groupId!));
  return layers.filter((l) => want.has(l.id) || (l.groupId && groups.has(l.groupId))).map((l) => l.id);
}

/** Drop group ids that ended up with a single member (after delete, cut, ...). */
function pruneGroups(layers: Layer[]): Layer[] {
  const count = new Map<string, number>();
  for (const l of layers) if (l.groupId) count.set(l.groupId, (count.get(l.groupId) ?? 0) + 1);
  return layers.map((l) => {
    if (!l.groupId || (count.get(l.groupId) ?? 0) >= 2) return l;
    const { groupId: _g, ...rest } = l;
    return rest as Layer;
  });
}

function mapPanel(p: Project, panelId: string, fn: (layers: Layer[]) => Layer[]): Project {
  return updatePanel(p, panelId, (pn) => ({ ...pn, layers: pruneGroups(fn(pn.layers)) }));
}

/**
 * Group the selection (and every group it touches) into one new group.
 * Members are moved next to each other at the position of the front-most member.
 */
export function groupLayers(p: Project, panelId: string, ids: string[]): { project: Project; groupId: string | null } {
  const found = findPanel(p, panelId);
  if (!found) return { project: p, groupId: null };
  const all = idSet(expandGroups(found.panel.layers, ids));
  if (all.size < 2) return { project: p, groupId: null };
  const groupId = newId();
  const project = mapPanel(p, panelId, (layers) => {
    const members = layers.filter((l) => all.has(l.id)).map((l) => ({ ...l, groupId }) as Layer);
    const front = Math.max(...layers.map((l, i) => (all.has(l.id) ? i : -1)));
    const before = layers.slice(0, front + 1).filter((l) => !all.has(l.id));
    const after = layers.slice(front + 1);
    return [...before, ...members, ...after];
  });
  return { project, groupId };
}

export function ungroupLayers(p: Project, panelId: string, ids: string[]): Project {
  const found = findPanel(p, panelId);
  if (!found) return p;
  const want = idSet(ids);
  const groups = new Set(found.panel.layers.filter((l) => want.has(l.id) && l.groupId).map((l) => l.groupId!));
  return mapPanel(p, panelId, (layers) =>
    layers.map((l) => {
      if (!l.groupId || !groups.has(l.groupId)) return l;
      const { groupId: _g, ...rest } = l;
      return rest as Layer;
    }),
  );
}

export function moveLayers(p: Project, panelId: string, ids: string[], dx: number, dy: number): Project {
  const want = idSet(ids);
  return mapPanel(p, panelId, (layers) => layers.map((l) => (want.has(l.id) ? ({ ...l, x: l.x + dx, y: l.y + dy } as Layer) : l)));
}

/** Apply a per-layer patch to several layers in one step (multi-drag / multi-transform end). */
export function patchLayers(p: Project, panelId: string, patches: Record<string, Partial<Layer>>): Project {
  return mapPanel(p, panelId, (layers) => layers.map((l) => (patches[l.id] ? ({ ...l, ...patches[l.id] } as Layer) : l)));
}

export function removeLayers(p: Project, panelId: string, ids: string[]): Project {
  const want = idSet(ids);
  return mapPanel(p, panelId, (layers) => layers.filter((l) => !want.has(l.id)));
}

export function setLayersOpacity(p: Project, panelId: string, ids: string[], percent: number): Project {
  const o = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 100)) / 100;
  const want = idSet(ids);
  return mapPanel(p, panelId, (layers) => layers.map((l) => (want.has(l.id) ? ({ ...l, opacity: o } as Layer) : l)));
}

/** Move the selection as a block; relative order inside the block is kept. */
export function reorderLayers(p: Project, panelId: string, ids: string[], dir: 'up' | 'down' | 'top' | 'bottom'): Project {
  const want = idSet(ids);
  return mapPanel(p, panelId, (layers) => {
    const sel = layers.filter((l) => want.has(l.id));
    if (!sel.length) return layers;
    const rest = layers.filter((l) => !want.has(l.id));
    let at: number;
    if (dir === 'top') at = rest.length;
    else if (dir === 'bottom') at = 0;
    else {
      // index in `rest` where the block currently starts / ends
      const first = layers.findIndex((l) => want.has(l.id));
      const last = layers.length - 1 - [...layers].reverse().findIndex((l) => want.has(l.id));
      const restBeforeFirst = layers.slice(0, first).filter((l) => !want.has(l.id)).length;
      const restBeforeLast = layers.slice(0, last).filter((l) => !want.has(l.id)).length;
      at = dir === 'up' ? Math.min(rest.length, restBeforeLast + 1) : Math.max(0, restBeforeFirst - 1);
      // never split a group we're not part of: step over it as a whole
      const own = new Set(sel.map((l) => l.groupId).filter(Boolean));
      if (dir === 'up') {
        const g = rest[at - 1]?.groupId;
        if (g && !own.has(g)) while (at < rest.length && rest[at].groupId === g) at++;
      } else {
        const g = rest[at]?.groupId;
        if (g && !own.has(g)) while (at > 0 && rest[at - 1].groupId === g) at--;
      }
    }
    return [...rest.slice(0, at), ...sel, ...rest.slice(at)];
  });
}

/**
 * Drag-and-drop in the layer list: put `ids` directly in front of / behind `anchorId`.
 * `intoGroup` = dropped among the members of that group (the moved layers join it); otherwise a
 * partially-moved group's members leave it, a wholly-moved group stays a group.
 */
export function moveLayersTo(p: Project, panelId: string, ids: string[], anchorId: string, side: 'front' | 'back', intoGroup: string | null): Project {
  const found = findPanel(p, panelId);
  const want = idSet(ids);
  if (!found || want.has(anchorId) || !found.panel.layers.some((l) => l.id === anchorId)) return p;
  const all = found.panel.layers;
  const size = new Map<string, number>();
  for (const l of all) if (l.groupId) size.set(l.groupId, (size.get(l.groupId) ?? 0) + 1);
  const movedPerGroup = new Map<string, number>();
  for (const l of all) if (want.has(l.id) && l.groupId) movedPerGroup.set(l.groupId, (movedPerGroup.get(l.groupId) ?? 0) + 1);
  return mapPanel(p, panelId, (layers) => {
    const moving = layers
      .filter((l) => want.has(l.id))
      .map((l) => {
        if (intoGroup) return { ...l, groupId: intoGroup } as Layer;
        if (l.groupId && movedPerGroup.get(l.groupId) === size.get(l.groupId)) return l;
        const { groupId: _g, ...rest } = l;
        return rest as Layer;
      });
    const rest = layers.filter((l) => !want.has(l.id));
    const ai = rest.findIndex((l) => l.id === anchorId);
    const at = side === 'front' ? ai + 1 : ai;
    return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  });
}

/** Paste copies (new ids, groups re-created with fresh ids); +40,+40 when pasting into the source panel. */
export function pasteLayers(p: Project, panelId: string, src: Layer[], sameSource: boolean): { project: Project; layerIds: string[] } {
  const remap = new Map<string, string>();
  const copies = src.map((l) => {
    const c = { ...structuredClone(l), id: newId() } as Layer;
    if (l.groupId) {
      if (!remap.has(l.groupId)) remap.set(l.groupId, newId());
      c.groupId = remap.get(l.groupId);
    }
    if (sameSource) {
      c.x += 40;
      c.y += 40;
    }
    return c;
  });
  const project = mapPanel(p, panelId, (layers) => [...layers, ...copies]);
  return { project, layerIds: copies.map((c) => c.id) };
}

export interface Box {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** ids of boxes intersecting the (possibly negative-size) marquee rect */
export function layersInRect(boxes: Box[], rect: Omit<Box, 'id'>): string[] {
  const x1 = Math.min(rect.x, rect.x + rect.width);
  const x2 = Math.max(rect.x, rect.x + rect.width);
  const y1 = Math.min(rect.y, rect.y + rect.height);
  const y2 = Math.max(rect.y, rect.y + rect.height);
  return boxes.filter((b) => b.x < x2 && b.x + b.width > x1 && b.y < y2 && b.y + b.height > y1).map((b) => b.id);
}
