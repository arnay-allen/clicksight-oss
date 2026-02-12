/**
 * Property Formatter Utility
 * Formats property names for display in UI
 */

/**
 * Format property label for display
 * - pixel_properties.* → My Properties.*
 * - Other properties → Your Properties.*
 */
export function formatPropertyLabel(property: string): string {
  if (property.startsWith('pixel_properties')) {
    return property.replace('pixel_properties.', 'My Properties › ');
  }
  if (property.startsWith('$')) {
    return property; // Keep $ properties as-is
  }
  return `Your Properties › ${property}`;
}

/**
 * Format property name without prefix (for short display)
 */
export function formatPropertyName(property: string): string {
  if (property.startsWith('pixel_properties.')) {
    return property.replace('pixel_properties.', '');
  }
  return property;
}

/**
 * Get property category
 */
export function getPropertyCategory(property: string): 'pixel' | 'system' | 'other' {
  if (property.startsWith('pixel_properties')) {
    return 'pixel';
  }
  if (property.startsWith('$') || ['event_name', 'event_timestamp', 'server_timestamp', 'ist_date', 'client_reference_id'].includes(property)) {
    return 'system';
  }
  return 'other';
}

/**
 * Group properties by category
 */
export function groupProperties(properties: string[]): {
  pixel: string[];
  system: string[];
  other: string[];
} {
  const grouped = {
    pixel: [] as string[],
    system: [] as string[],
    other: [] as string[],
  };

  properties.forEach(prop => {
    const category = getPropertyCategory(prop);
    grouped[category].push(prop);
  });

  return grouped;
}

/**
 * Format property value for display
 */
export function formatPropertyValue(value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  if (typeof value === 'string' && value.length > 100) {
    return `${value.substring(0, 100)}...`;
  }
  return String(value);
}

