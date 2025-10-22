# Build stage
FROM hexpm/elixir:1.17.3-erlang-27.1.2-alpine-3.20.3 AS builder

# Install build dependencies
RUN apk add --no-cache build-base git

# Set working directory
WORKDIR /app

# Install hex and rebar
RUN mix local.hex --force && \
    mix local.rebar --force

# Copy mix files
COPY mix.exs mix.lock ./

# Install dependencies
ENV MIX_ENV=prod
RUN mix deps.get --only prod && \
    mix deps.compile

# Copy application code
COPY lib ./lib
COPY config ./config

# Compile application
RUN mix compile

# Runtime stage
FROM hexpm/elixir:1.17.3-erlang-27.1.2-alpine-3.20.3

# Install runtime dependencies
RUN apk add --no-cache openssl ncurses-libs libstdc++

# Create non-root user
RUN addgroup -g 1000 lix && \
    adduser -D -u 1000 -G lix lix

# Set working directory
WORKDIR /app

# Copy compiled application from builder
COPY --from=builder --chown=lix:lix /app/_build/prod /app/_build/prod
COPY --from=builder --chown=lix:lix /app/deps /app/deps
COPY --from=builder --chown=lix:lix /app/config /app/config
COPY --chown=lix:lix mix.exs mix.lock ./
COPY --chown=lix:lix lib ./lib

# Set environment
ENV MIX_ENV=prod
ENV PORT=4000
ENV ERL_AFLAGS="-kernel shell_history enabled"

# Switch to non-root user
USER lix

# Install hex and rebar as lix user (needed at runtime for mix run)
RUN mix local.hex --force && \
    mix local.rebar --force

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

# Start the server
CMD ["sh", "-c", "mix run --no-halt"]
