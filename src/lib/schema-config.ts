/**
 * Schema Configuration Module
 * 
 * This module handles loading and validating the schema configuration file.
 * The schema config maps your ClickHouse event table columns to ClickSight's expected schema.
 * 
 * Configuration is loaded from schema.config.json (production config, version controlled)
 */

// Import the production schema config
import productionConfig from '../../schema.config.json';

export interface SchemaConfig {
  version: string;
  clickhouse: {
    database: string;
    table: string;
  };
  schema: {
    columns: {
      event_name: string;
      timestamp: string;
      date: string;
      user_id: string;
      device_id?: string;
      session_id?: string;
    };
    user_identifier: {
      type: 'single' | 'computed';
      column?: string;
      expression?: string;
    };
    properties: {
      type: 'flat' | 'json';
      columns?: string[];
      json_column?: string;
    };
  };
}

// Cached config instance
let loadedConfig: SchemaConfig | null = null;

/**
 * Load schema configuration
 * Returns the production config (bundled at build time)
 */
export function loadSchemaConfig(): SchemaConfig {
  // Return cached config if already loaded
  if (loadedConfig) {
    return loadedConfig;
  }

  try {
    console.log('📋 Loading schema configuration (schema.config.json)');
    loadedConfig = productionConfig as SchemaConfig;
    return loadedConfig;
  } catch (error) {
    console.error('❌ Failed to load schema configuration:', error);
    throw new Error(
      'Schema configuration file not found. Please ensure schema.config.json exists in the project root.'
    );
  }
}

/**
 * Validate schema configuration
 * Returns validation result with detailed error messages
 */
export function validateSchemaConfig(config: SchemaConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Validate version
  if (!config.version) {
    errors.push('Missing version field');
  }

  // Validate ClickHouse connection
  if (!config.clickhouse) {
    errors.push('Missing clickhouse configuration');
  } else {
    if (!config.clickhouse.database) {
      errors.push('Missing clickhouse.database');
    }
    if (!config.clickhouse.table) {
      errors.push('Missing clickhouse.table');
    }
  }

  // Validate schema
  if (!config.schema) {
    errors.push('Missing schema configuration');
  } else {
    // Validate columns
    if (!config.schema.columns) {
      errors.push('Missing schema.columns');
    } else {
      if (!config.schema.columns.event_name) {
        errors.push('Missing schema.columns.event_name');
      }
      if (!config.schema.columns.timestamp) {
        errors.push('Missing schema.columns.timestamp');
      }
      if (!config.schema.columns.date) {
        errors.push('Missing schema.columns.date');
      }
      if (!config.schema.columns.user_id) {
        errors.push('Missing schema.columns.user_id');
      }
    }

    // Validate user_identifier
    if (!config.schema.user_identifier) {
      errors.push('Missing schema.user_identifier');
    } else {
      const { type, column, expression } = config.schema.user_identifier;
      
      if (!type) {
        errors.push('Missing schema.user_identifier.type');
      } else if (type !== 'single' && type !== 'computed') {
        errors.push(`Invalid schema.user_identifier.type: "${type}". Must be "single" or "computed"`);
      }

      if (type === 'single' && !column) {
        errors.push('Missing schema.user_identifier.column for type="single"');
      }

      if (type === 'computed' && !expression) {
        errors.push('Missing schema.user_identifier.expression for type="computed"');
      }
    }

    // Validate properties
    if (!config.schema.properties) {
      errors.push('Missing schema.properties');
    } else {
      const { type, columns, json_column } = config.schema.properties;

      if (!type) {
        errors.push('Missing schema.properties.type');
      } else if (type !== 'flat' && type !== 'json') {
        errors.push(`Invalid schema.properties.type: "${type}". Must be "flat" or "json"`);
      }

      if (type === 'flat' && !columns) {
        errors.push('Missing schema.properties.columns for type="flat"');
      }

      if (type === 'flat' && columns && !Array.isArray(columns)) {
        errors.push('schema.properties.columns must be an array');
      }

      if (type === 'json' && !json_column) {
        errors.push('Missing schema.properties.json_column for type="json"');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Initialize and validate schema configuration
 * This runs when the module is imported
 */
function initializeSchemaConfig(): void {
  try {
    const config = loadSchemaConfig();
    const validation = validateSchemaConfig(config);

    if (!validation.valid) {
      console.error('❌ Invalid schema configuration:');
      validation.errors.forEach((error) => {
        console.error(`   - ${error}`);
      });
      throw new Error(
        `Invalid schema.config.json: ${validation.errors.join(', ')}`
      );
    }

    // Log successful initialization
    console.log('✅ Schema configuration loaded successfully');
    console.log(`   Database: ${config.clickhouse.database}`);
    console.log(`   Table: ${config.clickhouse.table}`);
    console.log(`   User Identifier: ${config.schema.user_identifier.type}`);
    console.log(`   Properties: ${config.schema.properties.type === 'flat' ? 'Flat Columns' : 'JSON Column'}`);
    
    if (config.schema.properties.type === 'flat' && config.schema.properties.columns) {
      console.log(`   Property Count: ${config.schema.properties.columns.length}`);
    }
  } catch (error) {
    console.error('❌ Schema configuration initialization failed:', error);
    throw error;
  }
}

// Initialize on module load
initializeSchemaConfig();

