// Catalog of accessibility-standard violation entries, keyed by ObstacleCategory.
// Source of truth: context/accessibility_standards.json at the repo root
// (uncommitted). The bundled JSON next to this file is a copy that must be
// kept in sync.

import catalog from './accessibilityStandards.json';
import type { ObstacleCategory } from '../types/report';

export interface AccessibilityStandard {
  code: string;
  label: string;
  short: string;
  requirement: string;
  why: string;
  pdfRef: string;
}

type StandardsMap = Partial<Record<ObstacleCategory, AccessibilityStandard[]>>;

export const STANDARDS_BY_CATEGORY: StandardsMap =
  (catalog as { standards: StandardsMap }).standards ?? {};

export function getStandardsForCategory(
  category: ObstacleCategory | null,
): AccessibilityStandard[] {
  if (!category) return [];
  return STANDARDS_BY_CATEGORY[category] ?? [];
}

export function getStandardByCode(code: string): AccessibilityStandard | null {
  for (const entries of Object.values(STANDARDS_BY_CATEGORY)) {
    const hit = entries?.find((e) => e.code === code);
    if (hit) return hit;
  }
  return null;
}
