defmodule LixCacheApi.Application do
  # See https://hexdocs.pm/elixir/Application.html
  # for more information on OTP Applications
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    cache_limit = Application.get_env(:lix_cache_api, :cache_limit, 100_000)
    port = Application.get_env(:lix_cache_api, :port, 4000)

    children = [
      # Start Cachex with stats enabled
      {Cachex, name: :cache, limit: cache_limit, stats: true},

      # Start Telemetry supervisor for metrics
      LixCacheApi.Telemetry,

      # Start HTTP server with Bandit
      {Bandit, scheme: :http, plug: LixCacheApi.Router, port: port, thousand_island_options: [num_acceptors: 100]}
    ]

    opts = [strategy: :one_for_one, name: LixCacheApi.Supervisor]
    Supervisor.start_link(children, opts)
  end
end
