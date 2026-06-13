cat <<EOF | docker build -t debian-curl -
FROM debian:sid-slim
RUN apt-get update && apt-get install -y curl vim
EOF

c2w debian-curl ./htdocs/out.wasm