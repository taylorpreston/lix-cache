defmodule LixCacheApi.AuthPlug do
  @moduledoc """
  Authentication middleware for Lix Cache API.

  Validates API keys from the Authorization header.
  Can be enabled/disabled via LIX_AUTH_ENABLED environment variable.
  Supports multiple API keys for multi-tenant scenarios.

  ## Configuration

  - LIX_AUTH_ENABLED: Enable/disable authentication (default: false)
  - LIX_API_KEYS: Comma-separated list of valid API keys

  ## Examples

      # Single API key
      LIX_AUTH_ENABLED=true LIX_API_KEYS=my-secret-key

      # Multiple API keys
      LIX_AUTH_ENABLED=true LIX_API_KEYS=key1,key2,key3

      # Disable auth (development)
      LIX_AUTH_ENABLED=false
  """

  import Plug.Conn

  def init(opts), do: opts

  def call(conn, _opts) do
    # Check if auth is enabled
    auth_enabled = Application.get_env(:lix_cache_api, :auth_enabled, false)

    # Always allow health checks without auth
    if conn.request_path == "/health" or not auth_enabled do
      conn
    else
      validate_auth(conn)
    end
  end

  defp validate_auth(conn) do
    # Get API keys from config
    api_keys = Application.get_env(:lix_cache_api, :api_keys, [])

    # Extract Authorization header
    case get_req_header(conn, "authorization") do
      ["Bearer " <> token] ->
        # Check if token matches any configured API key
        if token in api_keys do
          # Successful auth - log at debug level
          LixCacheApi.Logger.log_auth_event(:success, %{
            path: conn.request_path,
            request_id: get_request_id(conn)
          })

          conn
        else
          unauthorized(conn, "Invalid API key")
        end

      _ ->
        unauthorized(conn, "Missing or invalid Authorization header")
    end
  end

  defp get_request_id(conn) do
    case get_resp_header(conn, "x-request-id") do
      [request_id | _] -> request_id
      [] -> nil
    end
  end

  defp unauthorized(conn, message) do
    # Log failed authentication attempt
    LixCacheApi.Logger.log_auth_event(:failure, %{
      reason: message,
      path: conn.request_path,
      request_id: get_request_id(conn)
    })

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(401, LixCacheApi.JiffyWrapper.encode(%{error: "Unauthorized", message: message}))
    |> halt()
  end
end
