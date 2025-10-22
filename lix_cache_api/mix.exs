defmodule LixCacheApi.MixProject do
  use Mix.Project

  def project do
    [
      app: :lix_cache_api,
      version: "0.1.0",
      elixir: "~> 1.17",
      start_permanent: Mix.env() == :prod,
      deps: deps()
    ]
  end

  # Run "mix help compile.app" to learn about applications.
  def application do
    [
      extra_applications: [:logger],
      mod: {LixCacheApi.Application, []}
    ]
  end

  # Run "mix help deps" to learn about dependencies.
  defp deps do
    [
      {:bandit, "~> 1.0"},
      {:jiffy, "~> 1.1"},
      {:cachex, "~> 3.6"},
      {:cors_plug, "~> 3.0"},
      {:jason, "~> 1.4"},
      {:logger_json, "~> 7.0"},
      {:telemetry, "~> 1.2"},
      {:telemetry_metrics, "~> 1.0"}
    ]
  end
end
