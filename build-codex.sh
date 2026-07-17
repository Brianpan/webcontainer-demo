cat <<EOF | docker build -t  alpine-codex -
FROM alpine:3.21 AS fetch
ARG TARGETARCH
RUN apk add --no-cache curl
RUN curl -fsSL -o /tmp/codex.tar.gz \
       "https://github.com/openai/codex/releases/latest/download/codex-x86_64-unknown-linux-musl.tar.gz" \
    && tar -xzf /tmp/codex.tar.gz -C /tmp \
    && mv /tmp/codex-*-unknown-linux-musl /usr/local/bin/codex \
    && chmod +x /usr/local/bin/codex
 
FROM alpine:3.21
RUN apk add --no-cache git bash ca-certificates iperf3 curl
COPY --from=fetch /usr/local/bin/codex /usr/local/bin/codex

EOF

c2w --to-js --build-arg VM_CORE_NUMS=4 --build-arg VM_MEMORY_SIZE_MB=1024 alpine-codex ./qemu/
