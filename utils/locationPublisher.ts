import { supabase } from '../supabase';
import { enqueue, registerDrainWorker } from './offlineQueue';

// ─── Geofence config ─────────────────────────────────────────────────────────
const ACCURACY_GATE_METERS = 80;          // Ignore pings worse than this
const SPEED_GATE_KMH       = 15;          // Ignore suggestions if moving faster
const DWELL_RADIUS_KM      = 0.25;        // Must be within this radius to count
const DWELL_REQUIRED_MS    = 45_000;      // Must dwell for 45s before firing

const toRadians = (v: number) => v * (Math.PI / 180);

const distanceKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Dwell tracker (in-memory per fence key) ──────────────────────────────────
const dwellStart = new Map<string, number>(); // fenceKey → timestamp

function hasDwelled(key: string, nowMs: number): boolean {
  if (!dwellStart.has(key)) {
    dwellStart.set(key, nowMs);
    return false;
  }
  return nowMs - dwellStart.get(key)! >= DWELL_REQUIRED_MS;
}

function resetDwell(key: string) {
  dwellStart.delete(key);
}

// ─── Stage suggestions ────────────────────────────────────────────────────────
async function createStageSuggestion(params: {
  shipmentId: string;
  suggestedStage: string;
  confidenceScore: number;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}) {
  const { shipmentId, suggestedStage, confidenceScore, title, message, metadata } = params;
  const recentIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: existing } = await supabase
    .from('shipment_stage_suggestions')
    .select('id')
    .eq('shipment_id', shipmentId)
    .eq('suggested_stage', suggestedStage)
    .gte('created_at', recentIso)
    .limit(1);

  if (existing?.length) return;

  await supabase.from('shipment_stage_suggestions').insert({
    shipment_id: shipmentId,
    suggested_stage: suggestedStage,
    source: 'system_geofence',
    confidence_score: confidenceScore,
    title,
    message,
    metadata: metadata || {},
  });
}

// ─── Smart stage evaluation ───────────────────────────────────────────────────
async function evaluateSmartStageSignals(riderId: string, payload: {
  lat: number;
  lng: number;
  speed?: number | null;
  accuracy?: number | null;
  current_shipment_id?: string | null;
}) {
  if (!payload.current_shipment_id) return;

  // Accuracy gate — don't trust noisy GPS
  if (payload.accuracy != null && payload.accuracy > ACCURACY_GATE_METERS) return;

  // Speed gate — don't suggest arrival if moving too fast
  const speedKmh = payload.speed != null ? payload.speed * 3.6 : 0;
  if (speedKmh > SPEED_GATE_KMH) {
    // Clear active dwells while rider is still moving
    dwellStart.forEach((_, key) => { if (key.startsWith(payload.current_shipment_id!)) resetDwell(key); });
    return;
  }

  const { data: shipment } = await supabase
    .from('shipments')
    .select('id, tracking_id, dispatch_stage, pickup_lat, pickup_lon, delivery_lat, delivery_lon, pickup_verified_at, source_terminal_id, destination_terminal_id')
    .eq('id', payload.current_shipment_id)
    .maybeSingle();

  if (!shipment) return;

  const currentStage = shipment.dispatch_stage || '';
  const nowMs = Date.now();

  // ── Pickup proximity ──────────────────────────────────────────────────────
  if (shipment.pickup_lat && shipment.pickup_lon && !shipment.pickup_verified_at) {
    const pickupDist = distanceKm(payload.lat, payload.lng, shipment.pickup_lat, shipment.pickup_lon);
    const fenceKey = `${shipment.id}:arrived_at_pickup`;
    if (pickupDist <= DWELL_RADIUS_KM && ['awaiting_rider_acceptance', 'awaiting_source_terminal', 'out_for_delivery'].includes(currentStage)) {
      if (hasDwelled(fenceKey, nowMs)) {
        await createStageSuggestion({
          shipmentId: shipment.id,
          suggestedStage: 'arrived_at_pickup',
          confidenceScore: 0.88,
          title: 'Rider confirmed at pickup zone',
          message: `Rider ${riderId} has dwelled within ${(pickupDist * 1000).toFixed(0)}m of the pickup point for ${shipment.tracking_id}.`,
          metadata: { rider_id: riderId, distance_km: pickupDist, dwell_ms: DWELL_REQUIRED_MS, stage: currentStage, accuracy: payload.accuracy, speed_kmh: speedKmh },
        });
      }
    } else {
      resetDwell(fenceKey);
    }
  }

  // ── Terminal proximity ────────────────────────────────────────────────────
  const terminalIds = [shipment.source_terminal_id, shipment.destination_terminal_id].filter(Boolean);
  if (terminalIds.length) {
    const { data: terminals } = await supabase.from('terminals').select('id, name, code, lat, lng').in('id', terminalIds);
    const srcTerminal = (terminals as any[])?.find((t: any) => t.id === shipment.source_terminal_id);
    const dstTerminal = (terminals as any[])?.find((t: any) => t.id === shipment.destination_terminal_id);

    if (srcTerminal?.lat && srcTerminal?.lng && currentStage === 'awaiting_source_terminal') {
      const hubDist = distanceKm(payload.lat, payload.lng, srcTerminal.lat, srcTerminal.lng);
      const fenceKey = `${shipment.id}:received_at_source_terminal`;
      if (hubDist <= 0.5) {
        if (hasDwelled(fenceKey, nowMs)) {
          await createStageSuggestion({
            shipmentId: shipment.id,
            suggestedStage: 'received_at_source_terminal',
            confidenceScore: 0.90,
            title: 'Shipment confirmed at source hub',
            message: `${shipment.tracking_id} has been within ${(hubDist * 1000).toFixed(0)}m of ${srcTerminal.name} for sufficient dwell time.`,
            metadata: { rider_id: riderId, terminal_code: srcTerminal.code, distance_km: hubDist, accuracy: payload.accuracy },
          });
        }
      } else {
        resetDwell(fenceKey);
      }
    }

    if (dstTerminal?.lat && dstTerminal?.lng && currentStage === 'linehaul_in_transit') {
      const hubDist = distanceKm(payload.lat, payload.lng, dstTerminal.lat, dstTerminal.lng);
      const fenceKey = `${shipment.id}:received_at_destination_terminal`;
      if (hubDist <= 0.5) {
        if (hasDwelled(fenceKey, nowMs)) {
          await createStageSuggestion({
            shipmentId: shipment.id,
            suggestedStage: 'received_at_destination_terminal',
            confidenceScore: 0.88,
            title: 'Shipment confirmed at destination hub',
            message: `${shipment.tracking_id} is within range of ${dstTerminal.name} with sufficient dwell.`,
            metadata: { rider_id: riderId, terminal_code: dstTerminal.code, distance_km: hubDist, accuracy: payload.accuracy },
          });
        }
      } else {
        resetDwell(fenceKey);
      }
    }
  }

  // ── Delivery proximity ────────────────────────────────────────────────────
  if (shipment.delivery_lat && shipment.delivery_lon && currentStage === 'out_for_delivery') {
    const delivDist = distanceKm(payload.lat, payload.lng, shipment.delivery_lat, shipment.delivery_lon);
    const fenceKey = `${shipment.id}:arrived_at_delivery`;
    if (delivDist <= DWELL_RADIUS_KM) {
      if (hasDwelled(fenceKey, nowMs)) {
        await createStageSuggestion({
          shipmentId: shipment.id,
          suggestedStage: 'arrived_at_delivery',
          confidenceScore: 0.86,
          title: 'Rider confirmed near recipient address',
          message: `Rider ${riderId} has dwelled within ${(delivDist * 1000).toFixed(0)}m of the delivery point for ${shipment.tracking_id}.`,
          metadata: { rider_id: riderId, distance_km: delivDist, dwell_ms: DWELL_REQUIRED_MS, accuracy: payload.accuracy, speed_kmh: speedKmh },
        });
      }
    } else {
      resetDwell(fenceKey);
    }
  }
}

// ─── Register offline drain worker ────────────────────────────────────────────
registerDrainWorker('location_ping', async (item) => {
  const p = item.payload as any;
  const { error } = await supabase
    .from('rider_locations')
    .upsert({
      rider_id: p.rider_id,
      lat: p.lat,
      lng: p.lng,
      heading: p.heading ?? null,
      speed: p.speed ?? null,
      accuracy: p.accuracy ?? null,
      is_online: p.is_online ?? true,
      current_shipment_id: p.current_shipment_id ?? null,
      last_seen: p.last_seen,
      updated_at: p.last_seen,
    }, { onConflict: 'rider_id' });
  return !error;
});

// ─── Public API ───────────────────────────────────────────────────────────────
export async function publishLocation(riderId: string, payload: {
  lat: number;
  lng: number;
  heading?: number | null;
  speed?: number | null;
  accuracy?: number | null;
  is_online?: boolean;
  current_shipment_id?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  if (!riderId) return null;
  try {
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      rider_id: riderId,
      lat: payload.lat,
      lng: payload.lng,
      heading: payload.heading ?? null,
      speed: payload.speed ?? null,
      accuracy: payload.accuracy ?? null,
      is_online: payload.is_online ?? true,
      current_shipment_id: payload.current_shipment_id ?? null,
      last_seen: now,
      updated_at: now,
    };
    if (payload.metadata !== undefined) row.metadata = payload.metadata;

    // Offline: queue the ping and return early
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      enqueue('location_ping', { ...row, rider_id: riderId });
      return null;
    }

    const { data, error } = await supabase
      .from('rider_locations')
      .upsert(row, { onConflict: 'rider_id' })
      .select('*')
      .single();

    if (error) {
      enqueue('location_ping', { ...row, rider_id: riderId });
      return null;
    }

    await evaluateSmartStageSignals(riderId, payload);
    return data;
  } catch {
    return null;
  }
}

// Web-only: browser Geolocation API wrapper (no expo-location needed on web)
let _watchTimerId: ReturnType<typeof setInterval> | null = null;

export function startLocationUpdates(riderId: string, options?: { timeInterval?: number; distanceInterval?: number }) {
  if (!riderId || typeof navigator === 'undefined' || !navigator.geolocation) return null;
  const interval = options?.timeInterval ?? 10_000;
  stopLocationUpdates();
  _watchTimerId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      await publishLocation(riderId, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        accuracy: pos.coords.accuracy,
        is_online: true,
      });
    }, undefined, { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 });
  }, interval);
  return _watchTimerId;
}

export function stopLocationUpdates() {
  if (_watchTimerId != null) {
    clearInterval(_watchTimerId);
    _watchTimerId = null;
  }
}
