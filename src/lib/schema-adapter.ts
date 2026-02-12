/**
 * Schema Adapter Module
 * 
 * This module provides a schema abstraction layer that translates logical field names
 * to actual ClickHouse column names based on the schema configuration.
 * 
 * This allows ClickSight to work with any ClickHouse event table by simply
 * updating the schema.config.json file.
 */

import { loadSchemaConfig, SchemaConfig } from './schema-config';

export class SchemaAdapter {
  private config: SchemaConfig;

  constructor() {
    this.config = loadSchemaConfig();
  }

  /**
   * Get fully qualified table name
   * Example: "analytics.app_events"
   */
  getTable(): string {
    return `${this.config.clickhouse.database}.${this.config.clickhouse.table}`;
  }

  /**
   * Get database name
   * Example: "analytics"
   */
  getDatabase(): string {
    return this.config.clickhouse.database;
  }

  /**
   * Get table name (without database prefix)
   * Example: "app_events"
   */
  getTableName(): string {
    return this.config.clickhouse.table;
  }

  /**
   * Get column name for a logical field
   * 
   * @param field - Logical field name
   * @returns Actual column name in ClickHouse
   * 
   * Example: getColumn('event_name') → 'event_name'
   * Example: getColumn('timestamp') → 'server_timestamp'
   */
  getColumn(
    field: 'event_name' | 'timestamp' | 'date' | 'user_id' | 'device_id' | 'session_id'
  ): string {
    const column = this.config.schema.columns[field];
    if (!column) {
      throw new Error(`Column mapping not found for: ${field}`);
    }
    return column;
  }

  /**
   * Get user identifier expression
   * 
   * For type='single': Returns column name wrapped in backticks
   * For type='computed': Returns SQL expression as-is
   * 
   * Example (single): `user_id`
   * Example (computed): if(pixel_properties_user_id != '', pixel_properties_user_id, pixel_device_id)
   */
  getUserIdentifier(): string {
    const { type, column, expression } = this.config.schema.user_identifier;

    if (type === 'single') {
      return `\`${column}\``;
    } else if (type === 'computed') {
      return expression!;
    }

    throw new Error(`Unknown user_identifier type: ${type}`);
  }

  /**
   * Get property column expression
   * 
   * For type='flat': Returns column name wrapped in backticks
   * For type='json': Returns JSONExtractString expression
   * 
   * @param propertyName - Property name to access
   * @returns SQL expression to access the property
   * 
   * Example (flat): `pathname`
   * Example (json): JSONExtractString(`properties`, 'pathname')
   */
  getProperty(propertyName: string): string {
    const { type, columns, json_column } = this.config.schema.properties;

    if (type === 'flat') {
      // For flat properties, check if property exists in config (warning only)
      if (columns && !columns.includes(propertyName)) {
        console.warn(
          `Property '${propertyName}' not in schema config, using as-is. ` +
          `Add to schema.properties.columns if this is a valid property.`
        );
      }
      return `\`${propertyName}\``;
    } else if (type === 'json') {
      // Extract from JSON column
      return `JSONExtractString(\`${json_column}\`, '${propertyName}')`;
    }

    throw new Error(`Unknown properties type: ${type}`);
  }

  /**
   * Get list of available properties
   * 
   * For type='flat': Returns configured property list
   * For type='json': Returns empty array (properties discovered dynamically)
   * 
   * @returns Array of property names
   */
  getAvailableProperties(): string[] {
    const { type, columns } = this.config.schema.properties;

    if (type === 'flat') {
      return columns || [];
    } else {
      // For JSON type, properties are discovered dynamically
      return [];
    }
  }

  /**
   * Check if property type is flat (for optimization)
   * 
   * @returns true if properties are stored as flat columns
   */
  isFlatProperties(): boolean {
    return this.config.schema.properties.type === 'flat';
  }

  /**
   * Check if property type is JSON
   * 
   * @returns true if properties are stored in a JSON column
   */
  isJsonProperties(): boolean {
    return this.config.schema.properties.type === 'json';
  }

  /**
   * Get JSON column name (if using JSON properties)
   * 
   * @returns JSON column name or null if not using JSON properties
   */
  getJsonColumn(): string | null {
    if (this.config.schema.properties.type === 'json') {
      return this.config.schema.properties.json_column || null;
    }
    return null;
  }

  /**
   * Get schema config (for debugging)
   * 
   * @returns Complete schema configuration object
   */
  getConfig(): SchemaConfig {
    return this.config;
  }
}

// Singleton instance
export const schemaAdapter = new SchemaAdapter();

// Log schema adapter initialization
console.log('📊 Schema Adapter initialized');
console.log(`   Table: ${schemaAdapter.getTable()}`);
console.log(`   User Identifier: ${schemaAdapter.getUserIdentifier()}`);
console.log(`   Properties: ${schemaAdapter.isFlatProperties() ? 'Flat Columns' : 'JSON Column'}`);

if (schemaAdapter.isFlatProperties()) {
  const propCount = schemaAdapter.getAvailableProperties().length;
  console.log(`   Available Properties: ${propCount}`);
}

