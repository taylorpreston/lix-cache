defmodule LixCacheApi.Router do
  use Plug.Router
  alias LixCacheApi.Logger, as: CacheLogger

  # Get CORS origins from config
  @cors_origins Application.compile_env(:lix_cache_api, :cors_origins, "*")

  plug(Plug.RequestId)
  plug(CORSPlug, origin: @cors_origins)
  plug(LixCacheApi.AuthPlug)

  plug(Plug.Telemetry,
    event_prefix: [:lix_cache_api, :request]
  )

  plug(:match)

  plug(Plug.Parsers,
    parsers: [:json],
    pass: ["application/json"],
    json_decoder: LixCacheApi.JiffyWrapper
  )

  plug(:dispatch)

  # Routes
  post "/cache/set" do
    %{"key" => key, "value" => value} = conn.body_params
    ttl = conn.body_params["ttl"]

    opts = if ttl && ttl > 0, do: [ttl: :timer.seconds(ttl)], else: []

    {duration_ms, result} = CacheLogger.measure(fn ->
      Cachex.put(:cache, key, value, opts)
    end)

    case result do
      {:ok, true} ->
        CacheLogger.log_cache_operation(:set, %{key: key, ttl: ttl, duration_ms: duration_ms})
        LixCacheApi.Telemetry.cache_event(:set, %{duration: duration_ms, key: key, ttl: ttl})
        send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{success: true}))

      {:error, reason} ->
        CacheLogger.log_cache_operation(:set, %{key: key, ttl: ttl, duration_ms: duration_ms, error: inspect(reason)})
        send_resp(conn, 400, LixCacheApi.JiffyWrapper.encode(%{error: inspect(reason)}))
    end
  end

  get "/cache/get" do
    key = conn.query_params["key"]

    {duration_ms, result} = CacheLogger.measure(fn ->
      Cachex.get(:cache, key)
    end)

    case result do
      {:ok, nil} ->
        CacheLogger.log_cache_operation(:get, %{key: key, hit: false, duration_ms: duration_ms})
        LixCacheApi.Telemetry.cache_event(:get, %{duration: duration_ms, key: key, hit: false})
        send_resp(conn, 404, LixCacheApi.JiffyWrapper.encode(%{error: "not found"}))

      {:ok, value} ->
        CacheLogger.log_cache_operation(:get, %{key: key, hit: true, duration_ms: duration_ms})
        LixCacheApi.Telemetry.cache_event(:get, %{duration: duration_ms, key: key, hit: true})
        send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{value: value}))
    end
  end

  delete "/cache/delete" do
    key = conn.query_params["key"]

    {duration_ms, _result} = CacheLogger.measure(fn ->
      Cachex.del(:cache, key)
    end)

    CacheLogger.log_cache_operation(:delete, %{key: key, duration_ms: duration_ms})
    LixCacheApi.Telemetry.cache_event(:delete, %{duration: duration_ms, key: key})
    send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{success: true}))
  end

  post "/cache/incr" do
    %{"key" => key} = conn.body_params
    amount = conn.body_params["amount"] || 1

    {duration_ms, result} = CacheLogger.measure(fn ->
      Cachex.incr(:cache, key, amount)
    end)

    case result do
      {:ok, value} ->
        CacheLogger.log_cache_operation(:incr, %{key: key, amount: amount, value: value, duration_ms: duration_ms})
        LixCacheApi.Telemetry.cache_event(:incr, %{duration: duration_ms, key: key, amount: amount})
        send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{value: value}))

      {:error, reason} ->
        CacheLogger.log_cache_operation(:incr, %{key: key, amount: amount, duration_ms: duration_ms, error: inspect(reason)})
        send_resp(conn, 400, LixCacheApi.JiffyWrapper.encode(%{error: inspect(reason)}))
    end
  end

  post "/cache/decr" do
    %{"key" => key} = conn.body_params
    amount = conn.body_params["amount"] || 1

    {duration_ms, result} = CacheLogger.measure(fn ->
      Cachex.incr(:cache, key, -amount)
    end)

    case result do
      {:ok, value} ->
        CacheLogger.log_cache_operation(:decr, %{key: key, amount: amount, value: value, duration_ms: duration_ms})
        LixCacheApi.Telemetry.cache_event(:decr, %{duration: duration_ms, key: key, amount: amount})
        send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{value: value}))

      {:error, reason} ->
        CacheLogger.log_cache_operation(:decr, %{key: key, amount: amount, duration_ms: duration_ms, error: inspect(reason)})
        send_resp(conn, 400, LixCacheApi.JiffyWrapper.encode(%{error: inspect(reason)}))
    end
  end

  post "/cache/batch" do
    %{"operations" => operations} = conn.body_params
    op_count = length(operations)

    {duration_ms, results} = CacheLogger.measure(fn ->
      Enum.map(operations, fn
        %{"op" => "get", "key" => key} ->
          {:ok, value} = Cachex.get(:cache, key)
          %{op: "get", key: key, value: value}

        %{"op" => "set", "key" => key, "value" => value} = op ->
          ttl = Map.get(op, "ttl")
          opts = if ttl && ttl > 0, do: [ttl: :timer.seconds(ttl)], else: []
          Cachex.put(:cache, key, value, opts)
          %{op: "set", key: key, success: true}

        %{"op" => "delete", "key" => key} ->
          Cachex.del(:cache, key)
          %{op: "delete", key: key, success: true}
      end)
    end)

    CacheLogger.log_cache_operation(:batch, %{count: op_count, duration_ms: duration_ms})
    LixCacheApi.Telemetry.cache_event(:batch, %{duration: duration_ms, count: op_count})
    send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{results: results}))
  end

  post "/cache/clear" do
    {duration_ms, {:ok, count}} = CacheLogger.measure(fn ->
      Cachex.clear(:cache)
    end)

    CacheLogger.log_cache_operation(:clear, %{count: count, duration_ms: duration_ms})
    LixCacheApi.Telemetry.cache_event(:clear, %{duration: duration_ms, count: count})
    send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{success: true, cleared: count}))
  end

  get "/cache/scan" do
    prefix = conn.query_params["prefix"] || ""
    keys_only = conn.query_params["keys_only"] == "true"

    {duration_ms, response} = CacheLogger.measure(fn ->
      {:ok, all_keys} = Cachex.keys(:cache)
      matching_keys = Enum.filter(all_keys, &String.starts_with?(&1, prefix))

      if keys_only do
        %{keys: matching_keys, count: length(matching_keys)}
      else
        items =
          Enum.map(matching_keys, fn key ->
            {:ok, value} = Cachex.get(:cache, key)
            %{key: key, value: value}
          end)

        %{items: items, count: length(items)}
      end
    end)

    CacheLogger.log_cache_operation(:scan, %{prefix: prefix, count: response.count, duration_ms: duration_ms})
    LixCacheApi.Telemetry.cache_event(:scan, %{duration: duration_ms, prefix: prefix, count: response.count})
    send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(response))
  end

  get "/cache/stats" do
    {duration_ms, response} = CacheLogger.measure(fn ->
      {:ok, size} = Cachex.size(:cache)
      limit = Application.get_env(:lix_cache_api, :cache_limit, 100_000)

      # Get stats if enabled, otherwise use empty map
      stats =
        case Cachex.stats(:cache) do
          {:ok, stats} -> stats
          {:error, :stats_disabled} -> %{}
        end

      %{
        size: size,
        limit: limit,
        stats: stats
      }
    end)

    CacheLogger.log_cache_operation(:stats, %{duration_ms: duration_ms})
    send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(response))
  end

  get "/health" do
    send_resp(conn, 200, LixCacheApi.JiffyWrapper.encode(%{status: "healthy"}))
  end

  # Catch all
  match _ do
    send_resp(conn, 404, LixCacheApi.JiffyWrapper.encode(%{error: "not found"}))
  end
end
