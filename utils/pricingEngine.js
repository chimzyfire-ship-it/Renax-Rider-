// utils/pricingEngine.js
/**
 * Calculate shipment price based on distance, weight and service level.
 * Returns an object with a final `price` (rounded NGN) and a `breakdown`.
 */
const CURRENT_FUEL_PRICE_NGN = 1450; // per litre
const BASE_FARE_NGN = 1500; // flat operational fee
const WEAR_TEAR_PER_KM = 50; // ₦ per km
const WEIGHT_FREE_KG = 5; // first 5kg free
const WEIGHT_SURCHARGE_PER_KG = 200; // ₦ per additional kg
const DEFAULT_SURGE_MULTIPLIER = 1.2; // future-proofing

const VEHICLE_EFFICIENCY = {
  'Express Bike': 40, // km per litre
  'Standard Van': 10,
  'Priority Cargo': 5,
};

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function calculateShipmentPrice({ distanceKm, weightKg, serviceLevel, surgeMultiplier = DEFAULT_SURGE_MULTIPLIER }) {
  const distance = safeNumber(distanceKm);
  const weight = safeNumber(weightKg);
  const efficiency = VEHICLE_EFFICIENCY[serviceLevel] ?? VEHICLE_EFFICIENCY['Standard Van'];

  const fuelNeededL = distance / efficiency; // litres required
  const fuelCost = fuelNeededL * CURRENT_FUEL_PRICE_NGN;

  const wearTearCost = distance * WEAR_TEAR_PER_KM;

  const excessKg = Math.max(0, weight - WEIGHT_FREE_KG);
  const weightSurcharge = excessKg * WEIGHT_SURCHARGE_PER_KG;

  const subtotal = BASE_FARE_NGN + fuelCost + wearTearCost + weightSurcharge;

  const final = subtotal * (typeof surgeMultiplier === 'number' && surgeMultiplier > 0 ? surgeMultiplier : 1);

  const price = Math.round(final);

  return {
    price,
    breakdown: {
      baseFare: BASE_FARE_NGN,
      fuelCost: Math.round(fuelCost),
      wearTearCost: Math.round(wearTearCost),
      weightSurcharge: Math.round(weightSurcharge),
      surgeMultiplier: surgeMultiplier || 1,
      subtotal: Math.round(subtotal),
      final: price,
    },
  };
}

export default calculateShipmentPrice;
