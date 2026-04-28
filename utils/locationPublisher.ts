import * as Location from 'expo-location';
import { supabase } from '../supabase';

let watchSubscription: Location.LocationSubscription | null = null;

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
    const row = {
      rider_id: riderId,
      lat: payload.lat,
      lng: payload.lng,
      heading: payload.heading ?? null,
      speed: payload.speed ?? null,
      accuracy: payload.accuracy ?? null,
      is_online: payload.is_online ?? true,
      current_shipment_id: payload.current_shipment_id ?? null,
      metadata: payload.metadata ?? null,
      last_seen: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('rider_locations')
      .upsert(row, { onConflict: 'rider_id' })
      .select('*')
      .single();

    if (error) {
      // console.warn('publishLocation error', error.message || error);
      return null;
    }
    return data;
  } catch (e) {
    // console.warn('publishLocation fatal', e);
    return null;
  }
}

export async function startLocationUpdates(riderId: string, options?: { distanceInterval?: number; timeInterval?: number; accuracy?: Location.LocationAccuracy }) {
  if (!riderId) return null;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const opts = {
      accuracy: options?.accuracy ?? Location.Accuracy.Balanced,
      timeInterval: options?.timeInterval ?? 10000,
      distanceInterval: options?.distanceInterval ?? 20,
    } as any;

    watchSubscription = await Location.watchPositionAsync(opts, async (loc) => {
      if (!loc || !loc.coords) return;
      await publishLocation(riderId, {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        heading: loc.coords.heading ?? null,
        speed: loc.coords.speed ?? null,
        accuracy: loc.coords.accuracy ?? null,
        is_online: true,
      });
    });

    return watchSubscription;
  } catch (e) {
    // console.warn('startLocationUpdates failed', e);
    return null;
  }
}

export function stopLocationUpdates() {
  try {
    watchSubscription?.remove();
    watchSubscription = null;
  } catch (e) {
    // ignore
  }
}
