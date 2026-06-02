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

export async function fetchDeliverAndEarnSnapshot(operatorId: string): Promise<DeliverAndEarnSnapshot> {
  const [profileResult, vehiclesResult, availabilityResult, offersResult, shipmentResult, earningsResult] = await Promise.all([
    supabase
      .from('deliver_and_earn_profiles')
      .select('*')
      .eq('profile_id', operatorId)
      .maybeSingle(),
    supabase
      .from('deliver_and_earn_vehicles')
      .select('*')
      .eq('operator_id', operatorId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('deliver_and_earn_availability')
      .select('is_online, current_shipment_id, vehicle_id')
      .eq('operator_id', operatorId)
      .maybeSingle(),
    supabase
      .from('deliver_and_earn_job_offers')
      .select('*, shipments(tracking_id, pickup_address, delivery_address, package_category, estimated_price, carrier_commission_amount)')
      .eq('operator_id', operatorId)
      .eq('offer_status', 'offered')
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('shipments')
      .select('id, tracking_id, pickup_address, delivery_address, package_category, dispatch_stage, status, carrier_commission_amount, pickup_verified_at, delivery_verified_at')
      .eq('deliver_and_earn_operator_id', operatorId)
      .in('dispatch_stage', ['out_for_delivery'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('deliver_and_earn_earnings_ledger')
      .select('operator_amount, status')
      .eq('operator_id', operatorId),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (vehiclesResult.error) throw vehiclesResult.error;
  if (availabilityResult.error) throw availabilityResult.error;
  if (offersResult.error) throw offersResult.error;
  if (shipmentResult.error) throw shipmentResult.error;
  if (earningsResult.error) throw earningsResult.error;

  const earnings = ((earningsResult.data as { operator_amount: number; status: string }[] | null) ?? []);

  return {
    profile: (profileResult.data as DeliverAndEarnProfile | null) ?? null,
    vehicles: (vehiclesResult.data as DeliverAndEarnVehicle[] | null) ?? [],
    availability: (availabilityResult.data as { is_online: boolean; current_shipment_id: string | null; vehicle_id: string | null } | null) ?? null,
    offers: (offersResult.data as DeliverAndEarnOffer[] | null) ?? [],
    activeShipment: (shipmentResult.data as DeliverAndEarnShipment | null) ?? null,
    availableBalance: earnings
      .filter((earning) => earning.status === 'available')
      .reduce((total, earning) => total + Number(earning.operator_amount || 0), 0),
    pendingBalance: earnings
      .filter((earning) => ['pending_delivery', 'pending_dispute_window'].includes(earning.status))
      .reduce((total, earning) => total + Number(earning.operator_amount || 0), 0),
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
