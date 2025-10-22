import Config

# Runtime configuration for Lix Cache API
# Reads from environment variables with sensible defaults

# Cache limit - maximum number of items in the cache
# Default: 100,000 items
# Override with: LIX_CACHE_LIMIT=500000
cache_limit =
  System.get_env("LIX_CACHE_LIMIT", "500000")
  |> String.to_integer()

config :lix_cache_api,
  cache_limit: cache_limit

# HTTP server port
# Default: 4000
# Override with: PORT=8080
port =
  System.get_env("PORT", "4000")
  |> String.to_integer()

config :lix_cache_api,
  port: port

# Authentication configuration
# Enable/disable authentication (default: false for development-friendly setup)
# Override with: LIX_AUTH_ENABLED=true
auth_enabled =
  System.get_env("LIX_AUTH_ENABLED", "false")
  |> String.downcase()
  |> case do
    "true" -> true
    "1" -> true
    _ -> false
  end

# API keys - comma-separated list of valid API keys
# Single key: LIX_API_KEYS=my-secret-key
# Multiple keys: LIX_API_KEYS=key1,key2,key3
api_keys =
  System.get_env("LIX_API_KEYS", "")
  |> String.split(",", trim: true)
  |> Enum.map(&String.trim/1)

config :lix_cache_api,
  auth_enabled: auth_enabled,
  api_keys: api_keys

# CORS configuration
# Comma-separated list of allowed origins, or "*" for all origins
# Default: "*" (allows all origins)
# Override with: LIX_CORS_ORIGINS=https://app.example.com,https://admin.example.com
cors_origins =
  case System.get_env("LIX_CORS_ORIGINS", "*") do
    "*" -> "*"
    origins -> String.split(origins, ",", trim: true) |> Enum.map(&String.trim/1)
  end

config :lix_cache_api,
  cors_origins: cors_origins

# Security warnings
if auth_enabled and cors_origins == "*" do
  IO.warn("⚠️  CORS set to '*' with auth enabled - consider restricting origins in production")
end

if not auth_enabled do
  IO.warn("⚠️  Authentication disabled - this server is publicly accessible")
end

# Logging configuration
# Default: info level
# Override with: LOG_LEVEL=debug
log_level =
  System.get_env("LOG_LEVEL", "info")
  |> String.downcase()
  |> String.to_atom()

config :logger,
  level: log_level

# Configure JSON logging using LoggerJSON formatter
# Includes all metadata in logs for debugging
config :logger, :default_handler,
  formatter: {LoggerJSON.Formatters.Basic, metadata: :all}
