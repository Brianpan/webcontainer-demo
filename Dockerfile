FROM debian:bookworm-slim
 
ARG NVM_VERSION=v0.40.6
ARG NODE_VERSION=24
 
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates curl bash git wget \
    && rm -rf /var/lib/apt/lists/*
 
# Run as non-root; nvm is per-user by design
RUN useradd -m -s /bin/bash dev \
    && mkdir /workspace && chown dev:dev /workspace
USER dev
RUN whoami

ENV NVM_DIR=/home/dev/.nvm

COPY ./install.sh .
# Install nvm, pull the prebuilt Node 24 binary, set it as default.
# The installer also appends nvm sourcing to ~/.bashrc for interactive shells.
# A stable "current" symlink makes PATH work for non-interactive commands too
# (docker run / exec without a login shell never read .bashrc).
RUN bash install.sh\
    && . "$NVM_DIR/nvm.sh" \
    && nvm install "$NODE_VERSION" \
    && nvm alias default "$NODE_VERSION" \
    && ln -s "$NVM_DIR/versions/node/$(nvm version default)" "$NVM_DIR/current" \
    && nvm cache clear
 
ENV PATH="$NVM_DIR/current/bin:$PATH"
 
WORKDIR /workspace
