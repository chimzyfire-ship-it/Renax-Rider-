// utils/routingService.ts
// ──────────────────────────────────────────────────────────────────────────────
// RENAX Shared Routing Engine
// Used by: Customer (at shipment creation), Admin (dispatch override), Rider (job filtering)
// ──────────────────────────────────────────────────────────────────────────────

import { supabase } from '../supabase';

export type RoutingMode = 'last_mile_local' | 'relay_terminal' | 'manual_review';

export type DispatchStage =
  | 'pending_routing'
  | 'awaiting_rider_acceptance'
  | 'awaiting_source_terminal'
  | 'received_at_source_terminal'
  | 'linehaul_in_transit'
  | 'received_at_destination_terminal'
  | 'awaiting_final_mile_rider'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'exception';

export interface Terminal {
  id: string;
  name: string;
  code: string;
  state: string;
  city: string;
  address: string;
  status: string;
}

export interface RoutingResult {
  routing_mode: RoutingMode;
  dispatch_stage: DispatchStage;
  source_terminal_id: string | null;
  destination_terminal_id: string | null;
  pickup_state: string;
  pickup_city: string;
  delivery_state: string;
  delivery_city: string;
  reason: string; // human-readable explanation
}

const RELAY_STAGE_FLOW: DispatchStage[] = [
  'pending_routing',
  'awaiting_rider_acceptance',
  'awaiting_source_terminal',
  'received_at_source_terminal',
  'linehaul_in_transit',
  'received_at_destination_terminal',
  'awaiting_final_mile_rider',
  'out_for_delivery',
  'delivered',
];

const LOCAL_STAGE_FLOW: DispatchStage[] = [
  'pending_routing',
  'awaiting_rider_acceptance',
  'out_for_delivery',
  'delivered',
];

const STAGE_COLORS: Record<string, string> = {
  pending_routing: '#F59E0B',
  awaiting_rider_acceptance: '#F59E0B',
  awaiting_source_terminal: '#3B82F6',
  received_at_source_terminal: '#8B5CF6',
  linehaul_in_transit: '#7C3AED',
  received_at_destination_terminal: '#2563EB',
  awaiting_final_mile_rider: '#0EA5E9',
  out_for_delivery: '#10B981',
  delivered: '#047857',
  cancelled: '#DC2626',
  exception: '#DC2626',
};

// ── Nigerian state list (canonical) ──────────────────────────────────────────
const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT',
  'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi',
  'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo',
  'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara', 'Abuja',
];

// Alias map: if the address contains any of these, treat it as the canonical state
const STATE_ALIASES: Record<string, string> = {
  'abuja': 'FCT',
  'federal capital territory': 'FCT',
  'port harcourt': 'Rivers',
  'ph': 'Rivers',
  'benin city': 'Edo',
  'benin': 'Edo',
  'ibadan': 'Oyo',
  'abeokuta': 'Ogun',
  'ilorin': 'Kwara',
  'owerri': 'Imo',
  'calabar': 'Cross River',
  'uyo': 'Akwa Ibom',
  'yola': 'Adamawa',
  'maiduguri': 'Borno',
  'jalingo': 'Taraba',
  'lafia': 'Nasarawa',
  'jos': 'Plateau',
  'makurdi': 'Benue',
  'lokoja': 'Kogi',
  'ado ekiti': 'Ekiti',
  'abakaliki': 'Ebonyi',
  'umuahia': 'Abia',
  'awka': 'Anambra',
  'onitsha': 'Anambra',
  'asaba': 'Delta',
  'warri': 'Delta',
  'sokoto': 'Sokoto',
  'birnin kebbi': 'Kebbi',
  'gusau': 'Zamfara',
  'bauchi': 'Bauchi',
  'gombe': 'Gombe',
  'damaturu': 'Yobe',
  'dutse': 'Jigawa',
  'katsina': 'Katsina',
  'kaduna': 'Kaduna',
  'kano': 'Kano',
  'minna': 'Niger',
};

/**
 * Extract the Nigerian state from a free-text address string.
 * Returns empty string if no state is detected.
 */
export function extractStateFromAddress(address: string): string {
  const lower = address.toLowerCase();

  // Check alias map first (city-level detection)
  for (const [alias, state] of Object.entries(STATE_ALIASES)) {
    if (lower.includes(alias)) return state;
  }

  // Then check canonical state names
  for (const state of NIGERIAN_STATES) {
    if (lower.includes(state.toLowerCase())) return state;
  }

  return '';
}

/**
 * Extract a best-guess city from a free-text address string.
 * Uses the first meaningful comma-separated segment.
 */
export function extractCityFromAddress(address: string): string {
  if (!address) return '';

  // Try to find known city aliases first
  const lower = address.toLowerCase();
  for (const alias of Object.keys(STATE_ALIASES)) {
    if (lower.includes(alias)) {
      return alias
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  // Fallback: first non-number segment before a comma
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length > 0) return parts[0];

  return address;
}

/**
 * Fetch all active terminals from Supabase.
 */
export async function fetchTerminals(): Promise<Terminal[]> {
  const { data, error } = await supabase
    .from('terminals')
    .select('*')
    .eq('status', 'active');

  if (error || !data) return [];
  return data as Terminal[];
}

/**
 * Find the best terminal for a given state from the terminal list.
 */
export function findTerminalForState(
  state: string,
  terminals: Terminal[]
): Terminal | null {
  if (!state) return null;
  const lower = state.toLowerCase();

  // Direct state match
  const direct = terminals.find(t => t.state.toLowerCase() === lower);
  if (direct) return direct;

  // Fallback: check FCT for Abuja
  if (lower === 'abuja' || lower === 'fct') {
    return terminals.find(t => t.state.toLowerCase() === 'fct') || null;
  }

  return null;
}

/**
 * Core routing decision function.
 * Returns a RoutingResult that can be spread directly into a shipment insert/update.
 */
export async function resolveRouting(
  pickupAddress: string,
  deliveryAddress: string
): Promise<RoutingResult> {
  const pickupState = extractStateFromAddress(pickupAddress);
  const deliveryState = extractStateFromAddress(deliveryAddress);
  const pickupCity = extractCityFromAddress(pickupAddress);
  const deliveryCity = extractCityFromAddress(deliveryAddress);

  // ── Cannot parse one or both addresses ───────────────────────────
  if (!pickupState || !deliveryState) {
    return {
      routing_mode: 'manual_review',
      dispatch_stage: 'pending_routing',
      source_terminal_id: null,
      destination_terminal_id: null,
      pickup_state: pickupState,
      pickup_city: pickupCity,
      delivery_state: deliveryState,
      delivery_city: deliveryCity,
      reason: 'Could not detect state from one or both addresses. Sent to admin review.',
    };
  }

  // ── Same state — local delivery (same city or within state) ──────
  if (pickupState.toLowerCase() === deliveryState.toLowerCase()) {
    return {
      routing_mode: 'last_mile_local',
      dispatch_stage: 'awaiting_rider_acceptance',
      source_terminal_id: null,
      destination_terminal_id: null,
      pickup_state: pickupState,
      pickup_city: pickupCity,
      delivery_state: deliveryState,
      delivery_city: deliveryCity,
      reason: `Same state (${pickupState}). Routed to local rider marketplace.`,
    };
  }

  // ── Different states — find source & destination terminals ────────
  const terminals = await fetchTerminals();
  const srcTerminal = findTerminalForState(pickupState, terminals);
  const dstTerminal = findTerminalForState(deliveryState, terminals);

  if (srcTerminal && dstTerminal) {
    return {
      routing_mode: 'relay_terminal',
      dispatch_stage: 'awaiting_rider_acceptance', // first-mile rider to source terminal
      source_terminal_id: srcTerminal.id,
      destination_terminal_id: dstTerminal.id,
      pickup_state: pickupState,
      pickup_city: pickupCity,
      delivery_state: deliveryState,
      delivery_city: deliveryCity,
      reason: `Cross-state: ${pickupState} → ${deliveryState}. Relay via ${srcTerminal.name} → ${dstTerminal.name}.`,
    };
  }

  // ── Terminals missing for one or both states ──────────────────────
  return {
    routing_mode: 'manual_review',
    dispatch_stage: 'pending_routing',
    source_terminal_id: srcTerminal?.id || null,
    destination_terminal_id: dstTerminal?.id || null,
    pickup_state: pickupState,
    pickup_city: pickupCity,
    delivery_state: deliveryState,
    delivery_city: deliveryCity,
    reason: `No terminal found for ${!srcTerminal ? pickupState : deliveryState}. Sent to admin review.`,
  };
}

/**
 * Log a shipment stage transition to shipment_events.
 */
export async function logShipmentEvent(
  shipmentId: string,
  stage: DispatchStage,
  locationName?: string,
  actorId?: string,
  actorRole?: string,
  notes?: string
): Promise<void> {
  await supabase.from('shipment_events').insert({
    shipment_id: shipmentId,
    stage,
    location_name: locationName || null,
    actor_id: actorId || null,
    actor_role: actorRole || 'system',
    notes: notes || null,
  });
}

export function stageColor(stage: DispatchStage | string): string {
  return STAGE_COLORS[stage] || '#6B7280';
}

export function stageProgress(stage: DispatchStage | string, routingMode: RoutingMode | string = 'last_mile_local'): number {
  const flow = routingMode === 'relay_terminal' ? RELAY_STAGE_FLOW : LOCAL_STAGE_FLOW;
  const index = flow.indexOf(stage as DispatchStage);
  if (index === -1) {
    if (stage === 'cancelled' || stage === 'exception') return 0;
    return 5;
  }
  if (flow.length === 1) return 100;
  return Math.round((index / (flow.length - 1)) * 100);
}

export function shipmentStatusFromStage(
  stage: DispatchStage | string,
  routingMode: RoutingMode | string = 'last_mile_local'
): string {
  const statusMap: Record<string, string> = {
    pending_routing: routingMode === 'manual_review' ? 'Pending Review' : 'Pending Routing',
    awaiting_rider_acceptance: routingMode === 'relay_terminal' ? 'Awaiting First-Mile Rider' : 'Awaiting Rider',
    awaiting_source_terminal: 'En Route to Source Hub',
    received_at_source_terminal: 'At Source Hub',
    linehaul_in_transit: 'Linehaul In Transit',
    received_at_destination_terminal: 'At Destination Hub',
    awaiting_final_mile_rider: 'Awaiting Final-Mile Rider',
    out_for_delivery: 'Out for Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
    exception: 'Exception',
  };
  return statusMap[stage] || stageLabel(stage);
}

export function nextStageForShipment(
  currentStage: DispatchStage,
  routingMode: RoutingMode | string = 'last_mile_local'
): DispatchStage {
  if (routingMode === 'relay_terminal') {
    const relayNextStageMap: Partial<Record<DispatchStage, DispatchStage>> = {
      pending_routing: 'awaiting_rider_acceptance',
      awaiting_rider_acceptance: 'awaiting_source_terminal',
      awaiting_source_terminal: 'received_at_source_terminal',
      received_at_source_terminal: 'linehaul_in_transit',
      linehaul_in_transit: 'received_at_destination_terminal',
      received_at_destination_terminal: 'awaiting_final_mile_rider',
      awaiting_final_mile_rider: 'out_for_delivery',
      out_for_delivery: 'delivered',
    };
    return relayNextStageMap[currentStage] || currentStage;
  }

  if (routingMode === 'manual_review') {
    const manualNextStageMap: Partial<Record<DispatchStage, DispatchStage>> = {
      pending_routing: 'awaiting_rider_acceptance',
      awaiting_rider_acceptance: 'out_for_delivery',
      out_for_delivery: 'delivered',
    };
    return manualNextStageMap[currentStage] || currentStage;
  }

  const localNextStageMap: Partial<Record<DispatchStage, DispatchStage>> = {
    pending_routing: 'awaiting_rider_acceptance',
    awaiting_rider_acceptance: 'out_for_delivery',
    out_for_delivery: 'delivered',
  };
  return localNextStageMap[currentStage] || currentStage;
}

/**
 * Advance a shipment to the next logical dispatch stage.
 * Returns the new stage.
 */
export async function advanceShipmentStage(
  shipmentId: string,
  currentStage: DispatchStage,
  routingMode?: RoutingMode | string,
  actorId?: string,
  actorRole?: string
): Promise<DispatchStage> {
  let resolvedRoutingMode = routingMode;
  if (!resolvedRoutingMode) {
    const { data } = await supabase
      .from('shipments')
      .select('routing_mode')
      .eq('id', shipmentId)
      .maybeSingle();
    resolvedRoutingMode = data?.routing_mode || 'last_mile_local';
  }

  const nextStage = nextStageForShipment(currentStage, resolvedRoutingMode);
  if (!nextStage) return currentStage;

  await supabase
    .from('shipments')
    .update({
      dispatch_stage: nextStage,
      status: shipmentStatusFromStage(nextStage, resolvedRoutingMode),
      updated_at: new Date().toISOString(),
    })
    .eq('id', shipmentId);

  await logShipmentEvent(shipmentId, nextStage, undefined, actorId, actorRole);

  return nextStage;
}

/**
 * Human-readable label for each dispatch stage.
 */
export function stageLabel(stage: DispatchStage | string): string {
  const labels: Record<string, string> = {
    pending_routing:                  'Pending Routing',
    awaiting_rider_acceptance:        'Awaiting Rider',
    awaiting_source_terminal:         'En Route to Hub',
    received_at_source_terminal:      'At Source Hub',
    linehaul_in_transit:              'Linehaul in Transit',
    received_at_destination_terminal: 'At Destination Hub',
    awaiting_final_mile_rider:        'Awaiting Final-Mile Rider',
    out_for_delivery:                 'Out for Delivery',
    delivered:                        'Delivered',
    cancelled:                        'Cancelled',
    exception:                        'Exception',
  };
  return labels[stage] || stage;
}
