export type AssetRef = `global:${string}` | `project:${string}`;

export type Background =
  | { kind: 'color'; color: string }
  | { kind: 'asset'; ref: AssetRef; fit: 'cover' | 'contain' };

export interface Project {
  version: 1;
  name: string;
  createdAt: string;
  updatedAt: string;
  pageBackground: Background;
  pages: Page[];
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

export type FontName = 'Coming Soon' | 'Bangers' | 'Inter';

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

export type Layer = ImageLayer | TextLayer | ArrowLayer | EmojiLayer;

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
  updatedAt: string;
}
