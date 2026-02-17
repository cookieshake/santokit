FROM debian:bookworm-slim AS builder
RUN apt-get update && apt-get install -y curl build-essential pkg-config libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
RUN curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal --default-toolchain stable
ENV PATH="/root/.cargo/bin:${PATH}"
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY packages ./packages
RUN cargo build --release -p stk-bridge --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/stk-bridge /usr/local/bin/bridge
EXPOSE 3000
CMD ["/usr/local/bin/bridge"]
