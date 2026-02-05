FROM rust:bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY packages ./packages

RUN cargo build --release -p stk-hub --locked

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/hub /usr/local/bin/hub
RUN mkdir -p /data

ENV STK_HUB_PORT=4000
EXPOSE 4000

CMD ["hub"]
