import { supabase } from '../supabase';

export type DeliverAndEarnProfile = {
  profile_id: string;
  application_status: string;
  operator_status: string;
  trust_tier: string;
  operating_state: string;
  operating_city: string | null;
  training_status: string;
  identity_status: string;
  licence_status: string;
  bank_status: string;
  approval_notes: string | null;
};

export type DeliverAndEarnVehicle = {
  id: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
  plate_number: string;
  vehicle_status: string;
  inspection_status: string;
};

export type DeliverAndEarnOffer = {
  id: string;
  shipment_id: string;
  vehicle_id: string | null;
  offer_status: string;
  expires_at: string;
  shipments?: {
    tracking_id: string | null;
    pickup_address: string | null;
    delivery_address: string | null;
    package_category: string | null;
    estimated_price: number | null;
    carrier_commission_amount: number | null;
  } | null;
};

export type DeliverAndEarnShipment = {
  id: string;
  tracking_id: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  package_category: string | null;
  dispatch_stage: string | null;
  status: string | null;
  carrier_commission_amount: number | null;
  pickup_verified_at: string | null;
  delivery_verified_at: string | null;
};

export type DeliverAndEarnSnapshot = {
  profile: DeliverAndEarnProfile | null;
  vehicles: DeliverAndEarnVehicle[];
  availability: { is_online: boolean; current_shipment_id: string | null; vehicle_id: string | null } | null;
  offers: DeliverAndEarnOffer[];
  activeShipment: DeliverAndEarnShipment | null;
  availableBalance: number;
  pendingBalance: number;
};

export type DeliverAndEarnOperatorAccessContext = {
  profile_id?: string;
  operator_mode: 'signed_out' | 'none' | 'renax_staff' | 'deliver_and_earn';
  can_use_rider_app: boolean;
  is_staff_operator?: boolean;
  application_status?: string;
  operator_status?: string;
  operating_state?: string;
  operating_city?: string | null;
  invite_status?: string;
  invite_expires_at?: string | null;
  logistics_roles?: string[];
};

type DeliverAndEarnWalletSummary = {
  available_balance: number;
  pending_balance: number;
  payout_requested_balance: number;
};

const SNAPSHOT_QUERY_TIMEOUT_MS = 6000;

function normalizeSnapshotPayload(payload: any): DeliverAndEarnSnapshot {
  const walletSummary = payload?.walletSummary || payload?.wallet_summary || {};

  return {
    profile: payload?.profile ?? null,
    vehicles: Array.isArray(payload?.vehicles) ? payload.vehicles : [],
    availability: payload?.availability ?? null,
    offers: Array.isArray(payload?.offers) ? payload.offers : [],
    activeShipment: payload?.activeShipment ?? payload?.active_shipment ?? null,
    availableBalance: Number(payload?.availableBalance ?? walletSummary.available_balance ?? 0),
    pendingBalance: Number(payload?.pendingBalance ?? (
      Number(walletSummary.pending_balance || 0) + Number(walletSummary.payout_requested_balance || 0)
    )),
  };
}

async function safeSnapshotQuery<T>(label: string, queryFn: () => PromiseLike<{ data: T | null; error: any }>): Promise<T | null> {
  try {
    const timeoutResult = new Promise<{ data: T | null; error: any }>((resolve) => {
      setTimeout(() => {
        resolve({
          data: null,
          error: new Error(`${label} query timed out after ${SNAPSHOT_QUERY_TIMEOUT_MS / 1000} seconds`),
        });
      }, SNAPSHOT_QUERY_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([queryFn(), timeoutResult]);
    if (error) {
      console.warn(`[DeliverAndEarnRider] ${label} query error:`, error.message || error);
      return null;
    }
    return data;
  } catch (error) {
    console.warn(`[DeliverAndEarnRider] ${label} query threw:`, error);
    return null;
  }
}

export async function fetchDeliverAndEarnSnapshot(operatorId: string): Promise<DeliverAndEarnSnapshot> {
  const { data: snapshotPayload, error: snapshotError } = await supabase.rpc('deliver_and_earn_operator_snapshot', {
    p_operator_id: operatorId,
  });

  if (!snapshotError && snapshotPayload) {
    return normalizeSnapshotPayload(snapshotPayload);
  }

  if (snapshotError) {
    console.warn('[DeliverAndEarnRider] snapshot rpc unavailable, falling back to table queries:', snapshotError.message || snapshotError);
  }

  const [profile, vehicles, availability, offers, activeShipment, walletSummary] = await Promise.all([
    safeSnapshotQuery<DeliverAndEarnProfile>('profile', () =>
      supabase
      .from('deliver_and_earn_profiles')
      .select('*')
      .eq('profile_id', operatorId)
      .maybeSingle()
    ),
    safeSnapshotQuery<DeliverAndEarnVehicle[]>('vehicles', () =>
      supabase
      .from('deliver_and_earn_vehicles')
      .select('*')
      .eq('operator_id', operatorId)
      .order('updated_at', { ascending: false })
      .limit(5)
    ),
    safeSnapshotQuery<{ is_online: boolean; current_shipment_id: string | null; vehicle_id: string | null }>('availability', () =>
      supabase
      .from('deliver_and_earn_availability')
      .select('is_online, current_shipment_id, vehicle_id')
      .eq('operator_id', operatorId)
      .maybeSingle()
    ),
    safeSnapshotQuery<DeliverAndEarnOffer[]>('offers', () =>
      supabase
      .from('deliver_and_earn_job_offers')
      .select('*, shipments(tracking_id, pickup_address, delivery_address, package_category, estimated_price, carrier_commission_amount)')
      .eq('operator_id', operatorId)
      .eq('offer_status', 'offered')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
    ),
    safeSnapshotQuery<DeliverAndEarnShipment>('active_shipment', () =>
      supabase
      .from('shipments')
      .select('id, tracking_id, pickup_address, delivery_address, package_category, dispatch_stage, status, carrier_commission_amount, pickup_verified_at, delivery_verified_at')
      .eq('deliver_and_earn_operator_id', operatorId)
      .in('dispatch_stage', ['out_for_delivery'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    ),
    safeSnapshotQuery<DeliverAndEarnWalletSummary>('wallet_summary', () =>
      supabase.rpc('deliver_and_earn_wallet_summary', { p_operator_id: operatorId }).maybeSingle()
    ),
  ]);

  return {
    profile: profile ?? null,
    vehicles: vehicles ?? [],
    availability: availability ?? null,
    offers: offers ?? [],
    activeShipment: activeShipment ?? null,
    availableBalance: Number(walletSummary?.available_balance || 0),
    pendingBalance: Number(walletSummary?.pending_balance || 0) + Number(walletSummary?.payout_requested_balance || 0),
  };
}

export async function fetchDeliverAndEarnOperatorAccessContext(): Promise<DeliverAndEarnOperatorAccessContext> {
  const { data, error } = await supabase.rpc('deliver_and_earn_operator_access_context');
  if (error) throw error;
  return (data || {
    operator_mode: 'none',
    can_use_rider_app: false,
    is_staff_operator: false,
    logistics_roles: [],
  }) as DeliverAndEarnOperatorAccessContext;
}

export async function acceptDeliverAndEarnOperatorInvite(params: {
  inviteToken?: string | null;
  inviteCode?: string | null;
}) {
  const { data, error } = await supabase.rpc('accept_deliver_and_earn_operator_invite', {
    p_payload: {
      invite_token: params.inviteToken || null,
      invite_code: params.inviteCode || null,
      source: 'rider_app',
    },
  });

  if (error) throw error;
  return data as {
    profile_id?: string;
    invite_status?: string;
    operator_mode?: string;
    message?: string;
  };
}

export async function setDeliverAndEarnOnline(isOnline: boolean, vehicleId?: string | null) {
  const { error } = await supabase.rpc('set_deliver_and_earn_online_status', {
    p_payload: {
      is_online: isOnline,
      vehicle_id: vehicleId || null,
      metadata: { source: 'rider_deliver_and_earn_screen' },
    },
  });

  if (error) throw error;
}

export async function claimDeliverAndEarnOffer(offerId: string) {
  const { data, error } = await supabase.rpc('claim_deliver_and_earn_job', {
    p_payload: { offer_id: offerId },
  });

  if (error) throw error;
  return data as string;
}

export async function declineDeliverAndEarnOffer(offerId: string) {
  const { error } = await supabase.rpc('decline_deliver_and_earn_job', {
    p_payload: { offer_id: offerId, reason: 'Operator declined from Deliver & Earn screen.' },
  });

  if (error) throw error;
}

export async function completeDeliverAndEarnPickup(shipmentId: string, pickupOtp: string) {
  const { error } = await supabase.rpc('complete_deliver_and_earn_pickup', {
    p_payload: {
      shipment_id: shipmentId,
      pickup_otp: pickupOtp,
      metadata: { source: 'rider_deliver_and_earn_screen' },
    },
  });

  if (error) throw error;
}

export async function completeDeliverAndEarnDelivery(shipmentId: string, deliveryOtp: string) {
  const { error } = await supabase.rpc('complete_deliver_and_earn_delivery', {
    p_payload: {
      shipment_id: shipmentId,
      delivery_otp: deliveryOtp,
      metadata: { source: 'rider_deliver_and_earn_screen' },
    },
  });

  if (error) throw error;
}
