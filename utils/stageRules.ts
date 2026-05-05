// utils/stageRules.ts
// ─────────────────────────────────────────────────────────────────────────────
// RENAX Cross-App Stage Truth Rules
// Single source of truth shared by Customer, Admin, and Rider apps.
// All stage classification, proof requirements, trust scoring, and display
// labels for "arrived_at" suggestion stages live here.
//
// Import from this file instead of duplicating logic in each app.
// ─────────────────────────────────────────────────────────────────────────────

import type { DispatchStage, RoutingMode } from './routingService';

// ─── Suggestion-only stages ───────────────────────────────────────────────────
// These stages can only be SET by the system as a suggestion.
// They are NEVER written directly to shipments.dispatch_stage.
// Riders/admin see them as hints — customer sees them as informational arrivals.
export const SUGGESTION_ONLY_STAGES = new Set([
  'arrived_at_pickup',
  'arrived_at_delivery',
] as const);

export type SuggestionOnlyStage = 'arrived_at_pickup' | 'arrived_at_delivery';

// ─── Stages that require a verifiable proof ───────────────────────────────────
// Advancing to these stages without proof lowers trust score significantly.
// The UI should enforce at least one proof entry before allowing progression.
export const PROOF_REQUIRED_STAGES = new Set<DispatchStage>([
  'out_for_delivery',    // requires pickup_otp or gps_ping
  'delivered',           // requires delivery_otp (mandatory)
  'received_at_source_terminal',       // requires hub_check_in
  'received_at_destination_terminal',  // requires hub_check_in
]);

// ─── Stages that require admin approval before transition ─────────────────────
// These cannot be advanced by rider action alone; admin must confirm or AI
// suggestion must be accepted.
export const ADMIN_APPROVAL_REQUIRED_STAGES = new Set<DispatchStage>([
  'pending_routing',            // admin or system must classify routing
  'received_at_source_terminal',        // hub intake must be admin-confirmed
  'received_at_destination_terminal',   // hub delivery must be admin-confirmed
  'linehaul_in_transit',        // linehaul dispatch is admin-initiated
  'awaiting_final_mile_rider',  // final-mile release is admin-controlled
]);

// ─── Stages valid only for relay shipments ────────────────────────────────────
export const RELAY_ONLY_STAGES = new Set<DispatchStage>([
  'awaiting_source_terminal',
  'received_at_source_terminal',
  'linehaul_in_transit',
  'received_at_destination_terminal',
  'awaiting_final_mile_rider',
]);

// ─── Stages valid only for local shipments ────────────────────────────────────
export const LOCAL_ONLY_STAGES = new Set<DispatchStage>([
  // local shipments skip all terminal stages — none are local-only exclusives
  // but local flow does NOT include any relay stages.
]);

// ─── Proof type → base confidence score ──────────────────────────────────────
// These are the CANONICAL baseline scores used by all three apps.
// Do not define confidence numbers elsewhere — import from here.
export const PROOF_BASE_CONFIDENCE: Record<string, number> = {
  pickup_otp:      0.98,  // sender provided OTP at handoff — very high trust
  delivery_otp:    0.99,  // recipient provided OTP at delivery — highest trust
  hub_check_in:    0.88,  // hub staff scanned at intake
  hub_release:     0.86,  // hub staff confirmed outbound
  rider_acceptance:0.80,  // rider accepted the job
  admin_override:  0.75,  // admin forced a stage change — moderate trust
  gps_ping:        0.72,  // live GPS position at milestone
  gps_geofence:    0.84,  // geofence trigger (with dwell + accuracy + speed)
  geofence_auto:   0.84,  // alias used in some proof records
  photo:           0.90,  // proof photo attached
  signature:       0.95,  // recipient/sender signature captured
  system_signal:   0.55,  // system fallback — low trust
  manual_admin:    0.75,  // admin manual entry
};

// ─── Confidence band interpretation ──────────────────────────────────────────
// Used consistently in Customer tracking, Admin suggestions, and Rider screen.
export type TrustBand = 'verified' | 'high' | 'moderate' | 'pending' | 'low';

export function getTrustBand(score: number): TrustBand {
  if (score >= 0.95) return 'verified';
  if (score >= 0.82) return 'high';
  if (score >= 0.68) return 'moderate';
  if (score >= 0.50) return 'pending';
  return 'low';
}

export const TRUST_BAND_LABELS: Record<TrustBand, string> = {
  verified: 'Fully Verified',
  high:     'High Confidence',
  moderate: 'Moderate Evidence',
  pending:  'Pending Verification',
  low:      'Low Evidence',
};

export const TRUST_BAND_COLORS: Record<TrustBand, string> = {
  verified: '#047857',
  high:     '#004d3d',
  moderate: '#B45309',
  pending:  '#6B7280',
  low:      '#DC2626',
};

// ─── Arrived-at suggestion display model ─────────────────────────────────────
// For Customer and Admin — "arrived_at_pickup" and "arrived_at_delivery"
// are NOT real dispatch stages but appear in tracking as informational milestones.

export type SuggestionDisplayEntry = {
  stage: SuggestionOnlyStage;
  label: string;
  icon: string;
  trustBand: TrustBand;
  description: string;
  isVerified: false; // suggestions are never verified — always false
  routingModes: RoutingMode[];
};

export const ARRIVED_AT_DISPLAY_MODEL: SuggestionDisplayEntry[] = [
  {
    stage: 'arrived_at_pickup',
    label: 'Rider Near Pickup',
    icon: 'map-pin',
    trustBand: 'moderate',
    description: 'The rider's GPS suggests they are near the pickup address. This is auto-detected — awaiting OTP confirmation.',
    isVerified: false,
    routingModes: ['last_mile_local', 'relay_terminal', 'manual_review'],
  },
  {
    stage: 'arrived_at_delivery',
    label: 'Rider Near Delivery',
    icon: 'navigation',
    trustBand: 'moderate',
    description: 'The rider's GPS suggests they are near the delivery address. This is auto-detected — awaiting OTP confirmation.',
    isVerified: false,
    routingModes: ['last_mile_local', 'relay_terminal', 'manual_review'],
  },
];

// ─── Stage classification helpers ─────────────────────────────────────────────

export function isSuggestionOnlyStage(stage: string): stage is SuggestionOnlyStage {
  return SUGGESTION_ONLY_STAGES.has(stage as SuggestionOnlyStage);
}

export function requiresProof(stage: DispatchStage): boolean {
  return PROOF_REQUIRED_STAGES.has(stage);
}

export function requiresAdminApproval(stage: DispatchStage): boolean {
  return ADMIN_APPROVAL_REQUIRED_STAGES.has(stage);
}

export function isRelayOnlyStage(stage: DispatchStage): boolean {
  return RELAY_ONLY_STAGES.has(stage);
}

export function isStageValidForRouting(stage: DispatchStage, routingMode: RoutingMode): boolean {
  if (routingMode === 'last_mile_local' && RELAY_ONLY_STAGES.has(stage)) return false;
  return true;
}

// ─── Canonical proof confidence resolution ────────────────────────────────────
// Given a proof type, return the canonical confidence score.
// Callers should prefer this over hardcoded numbers.
export function canonicalConfidence(proofType: string, override?: number): number {
  if (override != null && override > 0) return Number(Math.min(1, Math.max(0, override)).toFixed(2));
  return PROOF_BASE_CONFIDENCE[proofType] ?? 0.70;
}

// ─── Stage flow by routing mode ───────────────────────────────────────────────
export const STAGE_FLOW_BY_MODE: Record<RoutingMode, DispatchStage[]> = {
  last_mile_local: [
    'pending_routing',
    'awaiting_rider_acceptance',
    'out_for_delivery',
    'delivered',
  ],
  relay_terminal: [
    'pending_routing',
    'awaiting_rider_acceptance',
    'awaiting_source_terminal',
    'received_at_source_terminal',
    'linehaul_in_transit',
    'received_at_destination_terminal',
    'awaiting_final_mile_rider',
    'out_for_delivery',
    'delivered',
  ],
  manual_review: [
    'pending_routing',
    'awaiting_rider_acceptance',
    'out_for_delivery',
    'delivered',
  ],
};

// ─── Idempotency key for proof creation ──────────────────────────────────────
// Used client-side to de-duplicate proof inserts before they reach the DB.
// Format: {shipmentId}:{stage}:{proofType}:{dayBucket}
export function proofIdempotencyKey(shipmentId: string, stage: string, proofType: string): string {
  const dayBucket = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `${shipmentId}:${stage}:${proofType}:${dayBucket}`;
}

// In-memory seen-set for the current session (prevents double-taps from submitting twice)
const _seenProofKeys = new Set<string>();

export function isProofDuplicate(key: string): boolean {
  return _seenProofKeys.has(key);
}

export function markProofSeen(key: string): void {
  _seenProofKeys.add(key);
  // Auto-clear after 10 minutes to avoid stale blocks
  setTimeout(() => _seenProofKeys.delete(key), 10 * 60 * 1000);
}
