FROM rust:bookworm AS builder
WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY packages ./packages

RUN cargo build --release -p stk-cli --locked

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/stk /usr/local/bin/stk

CMD ["sleep", "infinity"]
