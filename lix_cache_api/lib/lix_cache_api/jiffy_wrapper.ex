defmodule LixCacheApi.JiffyWrapper do
  @moduledoc """
  Simple wrapper around jiffy to provide Plug.Parsers compatible interface
  """

  @doc """
  Decodes JSON binary to Elixir terms
  """
  def decode!(binary) when is_binary(binary) do
    :jiffy.decode(binary, [:return_maps])
  end

  @doc """
  Encodes Elixir term to JSON binary
  """
  def encode(term) do
    :jiffy.encode(term)
  end
end
