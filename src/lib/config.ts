/**
 * Runtime configuration utility
 * 
 * This allows the frontend to read configuration that is injected at runtime
 * rather than at build time, enabling the same Docker image to be used across
 * different environments with different configurations.
 * 
 * Configuration priority:
 * 1. window._env_ (injected by entrypoint.sh from K8s secrets/env vars)
 * 2. import.meta.env (build-time fallback for local development)
 */

// Extend the Window interface to include our runtime config
declare global {
  interface Window {
    _env_?: {
      VITE_CLICKHOUSE_URL?: string;
      VITE_CLICKHOUSE_USER?: string;
      VITE_CLICKHOUSE_PASSWORD?: string;
      VITE_CLICKHOUSE_DATABASE?: string;
      VITE_GOOGLE_CLIENT_ID?: string;
    };
  }
}

/**
 * Get configuration value with runtime override support
 */
function getConfig(key: keyof NonNullable<Window['_env_']>): string {
  // Try runtime config first (injected by Docker entrypoint)
  const runtimeValue = window._env_?.[key];
  if (runtimeValue) {
    return runtimeValue;
  }

  // Fallback to build-time env var (for local development)
  const buildTimeValue = import.meta.env[key];
  if (buildTimeValue) {
    return buildTimeValue;
  }

  // Log warning if config is missing
  console.warn(`Configuration missing for ${key}`);
  return '';
}

// Export configuration values
export const config = {
  CLICKHOUSE_URL: getConfig('VITE_CLICKHOUSE_URL'),
  CLICKHOUSE_USER: getConfig('VITE_CLICKHOUSE_USER'),
  CLICKHOUSE_PASSWORD: getConfig('VITE_CLICKHOUSE_PASSWORD'),
  CLICKHOUSE_DATABASE: getConfig('VITE_CLICKHOUSE_DATABASE'),
  GOOGLE_CLIENT_ID: getConfig('VITE_GOOGLE_CLIENT_ID'),
};

// Log configuration on load (without sensitive data)
console.log('📝 ClickSight Configuration:', {
  CLICKHOUSE_URL: config.CLICKHOUSE_URL,
  CLICKHOUSE_DATABASE: config.CLICKHOUSE_DATABASE,
  CLICKHOUSE_USER: config.CLICKHOUSE_USER ? '***' : '(not set)',
  CLICKHOUSE_PASSWORD: config.CLICKHOUSE_PASSWORD ? '***' : '(not set)',
  GOOGLE_CLIENT_ID: config.GOOGLE_CLIENT_ID ? '***' : '(not set)',
});

export default config;

