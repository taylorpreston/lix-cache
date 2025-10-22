defmodule LixCacheApi.Telemetry do
  @moduledoc """
  Telemetry configuration for Lix Cache API.

  Defines metrics and events for monitoring cache operations and HTTP requests.

  ## Events Emitted

  ### HTTP Events (via Plug.Telemetry)
  - `[:lix_cache_api, :request, :start]` - HTTP request started
  - `[:lix_cache_api, :request, :stop]` - HTTP request completed
  - `[:lix_cache_api, :request, :exception]` - HTTP request raised exception

  ### Cache Events
  - `[:lix_cache_api, :cache, :get]` - Cache GET operation (includes hit/miss)
  - `[:lix_cache_api, :cache, :set]` - Cache SET operation
  - `[:lix_cache_api, :cache, :delete]` - Cache DELETE operation
  - `[:lix_cache_api, :cache, :incr]` - Cache INCREMENT operation
  - `[:lix_cache_api, :cache, :decr]` - Cache DECREMENT operation
  - `[:lix_cache_api, :cache, :batch]` - Cache BATCH operation
  - `[:lix_cache_api, :cache, :scan]` - Cache SCAN operation
  - `[:lix_cache_api, :cache, :clear]` - Cache CLEAR operation

  ### Auth Events
  - `[:lix_cache_api, :auth, :success]` - Successful authentication
  - `[:lix_cache_api, :auth, :failure]` - Failed authentication

  ## Metrics

  The following metrics are defined and can be reported to monitoring systems:

  - Request count by endpoint
  - Request duration (histogram)
  - Cache operation count by type
  - Cache hit/miss ratio
  - Auth success/failure count
  """

  use Supervisor
  import Telemetry.Metrics

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    children = [
      # Telemetry metrics reporter would go here
      # Example: {Telemetry.Metrics.ConsoleReporter, metrics: metrics()}
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  @doc """
  Returns the list of metrics to track.

  These can be consumed by Telemetry reporters (Prometheus, StatsD, etc.)
  """
  def metrics do
    [
      # HTTP Request Metrics
      counter("lix_cache_api.request.count",
        tags: [:method, :path, :status],
        description: "Total number of HTTP requests"
      ),
      summary("lix_cache_api.request.duration",
        unit: {:native, :millisecond},
        tags: [:method, :path, :status],
        description: "HTTP request duration"
      ),

      # Cache Operation Metrics
      counter("lix_cache_api.cache.operation.count",
        tags: [:operation],
        description: "Total number of cache operations"
      ),
      summary("lix_cache_api.cache.operation.duration",
        unit: {:native, :millisecond},
        tags: [:operation],
        description: "Cache operation duration"
      ),

      # Cache Hit/Miss Metrics
      counter("lix_cache_api.cache.get.count",
        tags: [:hit],
        description: "Cache GET operations (hit=true/false)"
      ),

      # Auth Metrics
      counter("lix_cache_api.auth.count",
        tags: [:result],
        description: "Authentication attempts (result=success/failure)"
      )
    ]
  end

  @doc """
  Emits a cache operation event.

  ## Options
  - `:operation` - The cache operation type (:get, :set, :delete, etc.)
  - `:duration` - Operation duration in native time units
  - `:metadata` - Additional metadata (e.g., hit: true/false, key, ttl)
  """
  def cache_event(operation, metadata \\ %{}) do
    :telemetry.execute(
      [:lix_cache_api, :cache, operation],
      %{duration: metadata[:duration] || 0},
      Map.put(metadata, :operation, operation)
    )
  end

  @doc """
  Emits an authentication event.

  ## Options
  - `:result` - :success or :failure
  - `:metadata` - Additional metadata (e.g., reason, path)
  """
  def auth_event(result, metadata \\ %{}) do
    :telemetry.execute(
      [:lix_cache_api, :auth, result],
      %{},
      Map.put(metadata, :result, result)
    )
  end
end
