#!/bin/sh
set -e

echo "Starting ClickSight frontend..."

# Generate runtime environment config from environment variables
CONFIG_FILE="/usr/share/nginx/html/env-config.js"

echo "Generating runtime configuration at $CONFIG_FILE"

cat > "$CONFIG_FILE" << EOF
// Runtime configuration - injected by entrypoint script
window._env_ = {
  VITE_CLICKHOUSE_URL: "${VITE_CLICKHOUSE_URL}",
  VITE_CLICKHOUSE_USER: "${VITE_CLICKHOUSE_USER}",
  VITE_CLICKHOUSE_PASSWORD: "${VITE_CLICKHOUSE_PASSWORD}",
  VITE_CLICKHOUSE_DATABASE: "${VITE_CLICKHOUSE_DATABASE}",
  VITE_GOOGLE_CLIENT_ID: "${VITE_GOOGLE_CLIENT_ID}",
  VITE_USE_LOWERCASE_COLUMNS: "${VITE_USE_LOWERCASE_COLUMNS:-false}",
  VITE_OPENAI_API_KEY: "${VITE_OPENAI_API_KEY}"
};
EOF

echo "Configuration generated successfully"
echo "ClickHouse URL: ${VITE_CLICKHOUSE_URL}"
echo "ClickHouse User: ${VITE_CLICKHOUSE_USER}"
echo "ClickHouse Database: ${VITE_CLICKHOUSE_DATABASE}"
echo "Use Lowercase Columns: ${VITE_USE_LOWERCASE_COLUMNS:-false}"
echo "OpenAI API Key: ${VITE_OPENAI_API_KEY:+***configured***}"
echo ""
echo "Starting nginx..."

# Execute the main command (nginx)
exec "$@"
