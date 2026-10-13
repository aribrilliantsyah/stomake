import { z } from 'zod';
import { migrateProject } from './migrate';
import { SHAPE_KINDS, type Project } from './types';

const assetRef = z
  .string()
  .regex(/^(global|project|clip):[^/\\]+$/, 'asset ref must start with global:, project: or clip:');

const background = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('color'), color: z.string() }),
  z.object({ kind: z.literal('asset'), ref: assetRef, fit: z.enum(['cover', 'contain']) }),
]);

const base = {
  id: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  groupId: z.string().optional(),
};

const layer = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('image'),
    ref: assetRef,
    width: z.number().positive(),
    height: z.number().positive(),
    flipX: z.boolean(),
    flipY: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal('text'),
    text: z.string(),
    font: z.string().min(1),
    fontSize: z.number().positive(),
    fill: z.string(),
    stroke: z.string().nullable(),
    strokeWidth: z.number().min(0),
  }),
  z.object({
    ...base,
    type: z.literal('arrow'),
    points: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    strokeWidth: z.number().positive(),
    color: z.string(),
  }),
  z.object({ ...base, type: z.literal('emoji'), char: z.string().min(1), size: z.number().positive() }),
  z.object({
    ...base,
    type: z.literal('shape'),
    shape: z.enum(SHAPE_KINDS as [string, ...string[]]),
    width: z.number().min(0),
    height: z.number().min(0),
    fill: z.string().nullable(),
    stroke: z.string().nullable(),
    strokeWidth: z.number().min(0),
    dash: z.boolean(),
  }),
]);

const panel = z.object({ id: z.string(), background, layers: z.array(layer) });

const scene = z
  .object({
    id: z.string(),
    note: z.string(),
    subtitle: z.string(),
    split: z.boolean(),
    panels: z.array(panel),
  })
  .refine((s) => s.panels.length === (s.split ? 2 : 1), { message: 'panels length must match split' });

const page = z.object({
  id: z.string(),
  background: background.nullable(),
  scenes: z.array(scene).min(1).max(3),
});

const cover = z.object({ id: z.string(), title: z.string(), panel });

export const projectSchema = z.object({
  version: z.literal(2),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  pageBackground: background,
  cover: cover.nullable(),
  archived: z.boolean().optional(),
  pages: z.array(page).min(1),
});

export function parseProject(x: unknown): Project {
  return projectSchema.parse(migrateProject(x)) as Project;
}
