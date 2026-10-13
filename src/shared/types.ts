export type AssetRef = `global:${string}` | `project:${string}`;

export type Background =
  | { kind: 'color'; color: string }
  | { kind: 'asset'; ref: AssetRef; fit: 'cover' | 'contain' };

export interface Project {
  version: 2;
  name: string;
  createdAt: string;
  updatedAt: string;
  pageBackground: Background;
  /** optional "VISUAL ASLI" style first page; not counted as a scene */
  cover: Cover | null;
  /** hidden from the default (active) project list */
  archived?: boolean;
  pages: Page[];
}

export interface Cover {
  id: string;
  title: string;
  /** panel space 1080 x 1920, never split */
  panel: Panel;
}

export interface Page {
  id: string;
  /** null = follow project.pageBackground */
  background: Background | null;
  scenes: Scene[];
}

export interface Scene {
  id: string;
  note: string;
  subtitle: string;
  split: boolean;
  panels: Panel[];
}

export interface Panel {
  id: string;
  background: Background;
  /** layers[0] is the back-most */
  layers: Layer[];
}

export interface LayerBase {
  id: string;
  /** center point, in panel space (1080 x 1920, or 1080 x 960 when split) */
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

export interface ImageLayer extends LayerBase {
  type: 'image';
  ref: AssetRef;
  width: number;
  height: number;
  flipX: boolean;
  flipY: boolean;
}

export type FontName = string;

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  font: FontName;
  fontSize: number;
  fill: string;
  stroke: string | null;
  strokeWidth: number;
}

export interface ArrowLayer extends LayerBase {
  type: 'arrow';
  /** relative to x,y */
  points: [number, number, number, number];
  strokeWidth: number;
  color: string;
}

export interface EmojiLayer extends LayerBase {
  type: 'emoji';
  char: string;
  size: number;
}

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'line' | 'arrow' | 'doubleArrow' | 'target' | 'cross' | 'star' | 'bubble';

export const SHAPE_KINDS: readonly ShapeKind[] = ['rect', 'roundRect', 'ellipse', 'line', 'arrow', 'doubleArrow', 'target', 'cross', 'star', 'bubble'];

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  shape: ShapeKind;
  /** bounding box, centered on x,y */
  width: number;
  height: number;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  dash: boolean;
}

export type Layer = ImageLayer | TextLayer | ArrowLayer | EmojiLayer | ShapeLayer;

export interface AssetInfo {
  ref: AssetRef;
  name: string;
  width: number;
  height: number;
  url: string;
}

export interface ProjectSummary {
  slug: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  scenes: number;
  pages: number;
  archived: boolean;
  hasCover: boolean;
  /** project.json could not be read */
  broken?: boolean;
}

export type ProjectSort = 'updated' | 'name' | 'created' | 'scenes';
export type ProjectStatus = 'active' | 'archived' | 'all';

export interface ProjectQuery {
  q?: string;
  status?: ProjectStatus;
  sort?: ProjectSort;
  /** only projects updated in the last N days */
  since?: number;
  page?: number;
  size?: number;
}

export interface ProjectPage {
  items: ProjectSummary[];
  total: number;
  page: number;
  size: number;
}

export interface Settings {
  mcp: { enabled: boolean };
}

export interface SettingsView {
  mcp: { enabled: boolean; url: string; lastCallAt: string | null };
}
