cat <<EOF | docker build -t alpine-claude -
# Minimal Claude Code container (Alpine, ~300MB total)
# Claude Code ships as a native binary now — no Node.js required.
FROM alpine:3.21
 
# musl deps required by the Claude Code binary + basics it expects
RUN apk add --no-cache libgcc libstdc++ ripgrep git bash ca-certificates
 
# Install from Anthropic's official signed apk repo (stable channel)
RUN wget -qO /etc/apk/keys/claude-code.rsa.pub \
        https://downloads.claude.ai/keys/claude-code.rsa.pub \
    && echo "https://downloads.claude.ai/claude-code/apk/stable" >> /etc/apk/repositories \
    && apk add --no-cache claude-code
 
# On musl distros Claude Code must use the system ripgrep;
# disable auto-updates inside an immutable container
ENV USE_BUILTIN_RIPGREP=0 \
    DISABLE_AUTOUPDATER=1
 
EOF

c2w --build-arg VM_CORE_NUMS=4 --build-arg VM_MEMORY_SIZE_MB=1536 alpine-claude ./htdocs/out.wasm