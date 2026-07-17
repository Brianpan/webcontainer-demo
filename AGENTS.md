# Techstack
- wasm v0.1
- container2wasm (c2w, c2w-net)
- OPFS
- Javascript Web worker for wasm processor
- emscripten

# Project structures
- qemu: NodeJS application to run wasm2container in QEMU mode
- htdocs: NodeJS application to run wasm2container in BOCHs or other emulators based on arch
- build-*: The script to build wasm to one of qemu/htdocs

# Workflow
strictly follow the rules in
@./DESIGN_FLOW.md