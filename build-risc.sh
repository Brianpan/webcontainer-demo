cat <<EOF | docker build --platform linux/riscv64 -t debian-riscv -
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y curl vim
EOF

c2w --target-arch=riscv64 debian-riscv ./htdocs/out.wasm
