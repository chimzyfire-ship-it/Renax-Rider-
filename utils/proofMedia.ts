import { supabase } from '../supabase';

export async function uploadShipmentProofPhoto(params: {
  shipmentId: string;
  stage: string;
  riderId?: string | null;
  uri: string;
}): Promise<string | null> {
  const { shipmentId, stage, riderId, uri } = params;
  if (!shipmentId || !uri) return null;

  try {
    const response = await fetch(uri);
    const arrayBuffer = await response.arrayBuffer();
    const extension = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const filePath = `${shipmentId}/${stage}/${Date.now()}-${riderId || 'system'}.${extension}`;

    const { error } = await supabase.storage
      .from('shipment-proofs')
      .upload(filePath, arrayBuffer, {
        contentType: extension === 'png' ? 'image/png' : 'image/jpeg',
        upsert: false,
      });

    if (error) return null;
    return filePath;
  } catch {
    return null;
  }
}

export function parseRenaxQrPayload(rawValue: string): {
  kind: 'pickup_otp' | 'delivery_otp' | 'shipment_id' | 'tracking_id' | 'terminal_code' | 'unknown';
  value: string;
  stageHint?: string;
  trackingId?: string;
} {
  const value = String(rawValue || '').trim();
  const normalized = value.toUpperCase();

  try {
    const url = new URL(value);
    const protocol = url.protocol.replace(':', '').toLowerCase();
    const flow = (url.searchParams.get('flow') || url.searchParams.get('type') || '').toLowerCase();
    const otp = (url.searchParams.get('otp') || url.searchParams.get('code') || '').trim();
    const trackingId = (url.searchParams.get('tracking') || url.searchParams.get('trackingId') || '').trim();

    if ((protocol === 'renaxrider' || protocol === 'deliveryapp') && otp) {
      if (flow === 'pickup') {
        return { kind: 'pickup_otp', value: otp, stageHint: 'out_for_delivery', trackingId };
      }
      if (flow === 'delivery') {
        return { kind: 'delivery_otp', value: otp, stageHint: 'delivered', trackingId };
      }
    }
  } catch {
    // Fall through to legacy payload parsing.
  }

  if (normalized.startsWith('RENAX:PICKUP:')) {
    return { kind: 'pickup_otp', value: value.split(':').pop() || '', stageHint: 'out_for_delivery' };
  }
  if (normalized.startsWith('RENAX:DELIVERY:')) {
    return { kind: 'delivery_otp', value: value.split(':').pop() || '', stageHint: 'delivered' };
  }
  if (normalized.startsWith('RENAX:SHIPMENT:')) {
    return { kind: 'shipment_id', value: value.split(':').pop() || '' };
  }
  if (normalized.startsWith('RENAX:TRACKING:')) {
    return { kind: 'tracking_id', value: value.split(':').pop() || '' };
  }
  if (normalized.startsWith('RENAX:TERMINAL:')) {
    return { kind: 'terminal_code', value: value.split(':').pop() || '' };
  }
  if (/^RNX-[A-Z0-9-]+$/i.test(value)) {
    return { kind: 'tracking_id', value };
  }
  if (/^\d{4,6}$/.test(value)) {
    return { kind: 'unknown', value };
  }

  return { kind: 'unknown', value };
}
