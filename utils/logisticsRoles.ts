export type LogisticsRole =
  | 'rider'
  | 'driver'
  | 'admin'
  | 'terminal_staff'
  | 'first_mile_pickup'
  | 'linehaul'
  | 'final_mile'
  | 'deliver_and_earn'
  | 'customer';

const ALLOWED_LOGISTICS_ROLES: LogisticsRole[] = [
  'customer',
  'rider',
  'driver',
  'admin',
  'terminal_staff',
  'first_mile_pickup',
  'linehaul',
  'final_mile',
  'deliver_and_earn',
];

export const RIDER_ACCOUNT_ROLE_OPTIONS = [
  { value: 'driver', label: 'Driver' },
  { value: 'rider', label: 'Rider' },
] as const;

export const RIDER_LOGISTICS_ROLE_OPTIONS: {
  value: LogisticsRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'rider',
    label: 'Intra-State',
    description: 'Live marketplace jobs inside the rider state.',
  },
  {
    value: 'first_mile_pickup',
    label: 'First Mile',
    description: 'Pickup-to-terminal work assigned by ops.',
  },
  {
    value: 'linehaul',
    label: 'Linehaul',
    description: 'Interstate terminal-to-terminal transport.',
  },
  {
    value: 'deliver_and_earn',
    label: 'Deliver & Earn',
    description: 'Personal-car intra-state jobs after RENAX validation.',
  },
  {
    value: 'final_mile',
    label: 'Final Mile',
    description: 'Destination-state delivery after terminal arrival.',
  },
];

export function normalizeLogisticsRoles(
  input: unknown,
  fallbackRole?: string | null,
): LogisticsRole[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === 'string' && input.trim()
      ? input.split(',')
      : [];

  const normalized = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase() as LogisticsRole)
    .filter((value, index, array) => ALLOWED_LOGISTICS_ROLES.includes(value) && array.indexOf(value) === index);

  if (normalized.length > 0) return normalized;

  if ((fallbackRole || '').toLowerCase() === 'rider') return ['rider'];
  if ((fallbackRole || '').toLowerCase() === 'driver') return ['rider'];

  return [];
}

export function hasLogisticsRole(input: unknown, role: LogisticsRole, fallbackRole?: string | null) {
  return normalizeLogisticsRoles(input, fallbackRole).includes(role);
}

export function deriveAccountRole(logisticsRoles: LogisticsRole[], preferredRole?: string | null) {
  if (preferredRole === 'rider' || preferredRole === 'driver') return preferredRole;
  if (logisticsRoles.includes('rider') && logisticsRoles.length === 1) return 'rider';
  return 'driver';
}
