FROM rust:1.85-slim AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY packages ./packages

RUN cargo build --release -p stk-bridge

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/bridge /usr/local/bin/bridge

ENV STK_BRIDGE_PORT=3000
EXPOSE 3000

CMD ["bridge"]
