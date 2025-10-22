defmodule LixCacheApi.AuthTest do
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

  alias LixCacheApi.Router

  @opts Router.init([])

  setup do
    # Clear cache before each test
    Cachex.clear(:cache)
    :ok
  end

  describe "authentication disabled" do
    setup do
      # Temporarily disable auth for these tests
      original_auth = Application.get_env(:lix_cache_api, :auth_enabled)
      Application.put_env(:lix_cache_api, :auth_enabled, false)

      on_exit(fn ->
        Application.put_env(:lix_cache_api, :auth_enabled, original_auth)
      end)

      :ok
    end

    test "allows requests without auth header" do
      conn =
        conn(:post, "/cache/set", %{"key" => "test", "value" => "data"})
        |> put_req_header("content-type", "application/json")
        |> Router.call(@opts)

      assert conn.status == 200
    end

    test "allows health check without auth" do
      conn =
        conn(:get, "/health")
        |> Router.call(@opts)

      assert conn.status == 200
    end
  end

  describe "authentication enabled" do
    setup do
      # Enable auth and set API keys for these tests
      original_auth = Application.get_env(:lix_cache_api, :auth_enabled)
      original_keys = Application.get_env(:lix_cache_api, :api_keys)

      Application.put_env(:lix_cache_api, :auth_enabled, true)
      Application.put_env(:lix_cache_api, :api_keys, ["test-key-1", "test-key-2"])

      on_exit(fn ->
        Application.put_env(:lix_cache_api, :auth_enabled, original_auth)
        Application.put_env(:lix_cache_api, :api_keys, original_keys)
      end)

      :ok
    end

    test "rejects requests without auth header" do
      conn =
        conn(:post, "/cache/set", %{"key" => "test", "value" => "data"})
        |> put_req_header("content-type", "application/json")
        |> Router.call(@opts)

      assert conn.status == 401
      assert conn.resp_body =~ "Unauthorized"
      assert conn.resp_body =~ "Missing or invalid Authorization header"
    end

    test "rejects requests with invalid auth header format" do
      conn =
        conn(:post, "/cache/set", %{"key" => "test", "value" => "data"})
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "InvalidFormat")
        |> Router.call(@opts)

      assert conn.status == 401
    end

    test "rejects requests with invalid API key" do
      conn =
        conn(:post, "/cache/set", %{"key" => "test", "value" => "data"})
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer invalid-key")
        |> Router.call(@opts)

      assert conn.status == 401
      assert conn.resp_body =~ "Invalid API key"
    end

    test "allows requests with valid API key (first key)" do
      conn =
        conn(:post, "/cache/set", %{"key" => "test", "value" => "data"})
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer test-key-1")
        |> Router.call(@opts)

      assert conn.status == 200
    end

    test "allows requests with valid API key (second key)" do
      conn =
        conn(:post, "/cache/set", %{"key" => "test", "value" => "data"})
        |> put_req_header("content-type", "application/json")
        |> put_req_header("authorization", "Bearer test-key-2")
        |> Router.call(@opts)

      assert conn.status == 200
    end

    test "allows health check without auth even when auth is enabled" do
      conn =
        conn(:get, "/health")
        |> Router.call(@opts)

      assert conn.status == 200
      assert conn.resp_body =~ "healthy"
    end

    test "protects all cache endpoints with auth" do
      endpoints = [
        {:post, "/cache/set", %{"key" => "test", "value" => "data"}},
        {:get, "/cache/get?key=test", nil},
        {:delete, "/cache/delete?key=test", nil},
        {:post, "/cache/incr", %{"key" => "counter", "amount" => 1}},
        {:post, "/cache/decr", %{"key" => "counter", "amount" => 1}},
        {:post, "/cache/batch", %{"operations" => []}},
        {:post, "/cache/clear", %{}},
        {:get, "/cache/scan?prefix=test", nil},
        {:get, "/cache/stats", nil}
      ]

      for {method, path, body} <- endpoints do
        # Without auth - should fail
        conn =
          if body do
            conn(method, path, body)
            |> put_req_header("content-type", "application/json")
          else
            conn(method, path)
          end
          |> Router.call(@opts)

        assert conn.status == 401, "Expected #{method} #{path} to require auth"

        # With auth - should succeed
        conn =
          if body do
            conn(method, path, body)
            |> put_req_header("content-type", "application/json")
            |> put_req_header("authorization", "Bearer test-key-1")
          else
            conn(method, path)
            |> put_req_header("authorization", "Bearer test-key-1")
          end
          |> Router.call(@opts)

        assert conn.status in [200, 404], "Expected #{method} #{path} to work with auth"
      end
    end
  end

  describe "CORS configuration" do
    test "applies configured CORS origins" do
      conn =
        conn(:get, "/health")
        |> put_req_header("origin", "https://example.com")
        |> Router.call(@opts)

      # Should have CORS headers
      assert get_resp_header(conn, "access-control-allow-origin") != []
    end
  end
end
