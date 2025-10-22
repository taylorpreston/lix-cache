defmodule LixCacheApi.Logger do
  @moduledoc """
  Structured logging helpers for Lix Cache API.

  Provides consistent, machine-parsable logging with JSON output.
  All logs include relevant metadata for debugging and monitoring.
  """

  require Logger

  @doc """
  Logs a cache operation with structured metadata.

  ## Examples

      iex> log_cache_operation(:get, %{key: "user:1", hit: true, duration_ms: 2.3})
      :ok

      iex> log_cache_operation(:set, %{key: "user:1", ttl: 300, duration_ms: 1.8})
      :ok
  """
  def log_cache_operation(operation, metadata) do
    level = if metadata[:error], do: :error, else: :info

    Logger.log(level, "cache_operation",
      operation: operation,
      key: metadata[:key],
      hit: metadata[:hit],
      ttl: metadata[:ttl],
      duration_ms: metadata[:duration_ms],
      error: metadata[:error],
      count: metadata[:count],
      amount: metadata[:amount],
      value: metadata[:value],
      prefix: metadata[:prefix]
    )
  end

  @doc """
  Logs an HTTP request with structured metadata.

  ## Examples

      iex> log_http_request(conn, 200, 15.4)
      :ok
  """
  def log_http_request(conn, status, duration_ms) do
    level = if status >= 400, do: :warn, else: :info

    Logger.log(level, "http_request",
      method: conn.method,
      path: conn.request_path,
      status: status,
      duration_ms: duration_ms,
      request_id: get_request_id(conn)
    )
  end

  @doc """
  Logs an authentication event (success or failure).

  ## Examples

      iex> log_auth_event(:success, %{path: "/cache/get"})
      :ok

      iex> log_auth_event(:failure, %{reason: "Invalid API key", path: "/cache/get"})
      :ok
  """
  def log_auth_event(result, metadata) do
    level =
      case result do
        :success -> :debug
        :failure -> :warn
      end

    Logger.log(level, "auth_event",
      result: result,
      reason: metadata[:reason],
      path: metadata[:path],
      request_id: metadata[:request_id]
    )

    # Emit telemetry event
    LixCacheApi.Telemetry.auth_event(result, metadata)
  end

  @doc """
  Measures the duration of a function execution in milliseconds.

  Returns `{duration_ms, result}` where duration_ms is a float.

  ## Examples

      iex> {duration_ms, result} = measure(fn -> Cachex.get(:cache, "key") end)
      {1.234, {:ok, "value"}}
  """
  def measure(fun) do
    start_time = System.monotonic_time()
    result = fun.()
    end_time = System.monotonic_time()

    duration_ms = System.convert_time_unit(end_time - start_time, :native, :millisecond) / 1.0

    {duration_ms, result}
  end

  @doc """
  Extracts the request ID from the connection.

  Returns the request ID if present, otherwise nil.
  """
  def get_request_id(conn) do
    case Plug.Conn.get_resp_header(conn, "x-request-id") do
      [request_id | _] -> request_id
      [] -> nil
    end
  end
end
