// ============================================================
// RENAX Logistics — Shared Theme Constants
// ============================================================

// Mobile/Native theme (Customer mobile app + Rider screens)
export const THEME = {
  primary: '#FF6B00',
  darkBg:  '#050505',
  cardBg:  '#121214',
  glass:   'rgba(20, 20, 22, 0.98)',
  text:    '#FFFFFF',
  subtext: '#71717A',
  success: '#10B981',
  danger:  '#EF4444',
  accent:  '#3B82F6',
  surface: '#1E1E22',
};

// Web/Brand theme — used by both Admin and Customer web dashboards
export const BRAND = {
  green:   '#004d3d',
  lime:    '#ccfd3a',
  gold:    '#F2C94C',
  white:   '#ffffff',
  bg:      '#f4f6f8',
  text:    '#121212',
  subtext: '#666666',
  danger:  '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
  border:  '#e8e8e8',
};

// Dark map style for native map overlays
export const DARK_MAP_STYLE = [
  { elementType: 'geometry',             stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon',          stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill',     stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke',   stylers: [{ color: '#212121' }] },
  { featureType: 'administrative',        elementType: 'geometry',         stylers: [{ color: '#757575' }] },
  { featureType: 'poi',                  elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { featureType: 'road',                 elementType: 'geometry.fill',    stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road.highway',         elementType: 'geometry',         stylers: [{ color: '#3c3c3c' }] },
  { featureType: 'water',                elementType: 'geometry',         stylers: [{ color: '#000000' }] },
];
