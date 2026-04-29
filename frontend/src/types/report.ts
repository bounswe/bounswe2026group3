// Matches ObstacleCategory enum in backend apps/reports/models.py
export type ObstacleCategory =
  // Outdoor
  | 'BROKEN_RAMP'
  | 'NARROW_SIDEWALK'
  | 'DAMAGED_SURFACE'
  | 'ROAD_CONSTRUCTION'
  | 'BLOCKED_PATH'
  // Indoor
  | 'BROKEN_ELEVATOR'
  | 'INACCESSIBLE_RESTROOM'
  | 'NARROW_CORRIDOR'
  | 'HEAVY_DOOR'
  | 'SLIPPERY_FLOOR'
  // Shared
  | 'OTHER';

// Required by API spec §4.4 — note: DB Report model is missing this field (needs migration)
export type ReportContext = 'OUTDOOR' | 'INDOOR';

// POST /reports request body — API spec §4.4
export interface SubmitReportPayload {
  location: { lat: number; lng: number };
  context: ReportContext;
  category: ObstacleCategory | null;
  description: string;
  photos: string[]; // base64-encoded image strings
  buildingName?: string;
  floor?: string;
  isIndoor?: boolean;
}

// POST /reports success response — API spec §4.4
export interface SubmitReportResponse {
  reportId: string;
  status: 'UNVERIFIED';
  autoVerified: boolean;
  duplicateCandidate: string | null;
  createdAt: string;
}
