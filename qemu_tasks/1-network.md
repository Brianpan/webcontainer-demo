# Remove browser mode of network
## Target
- qemu
## Goals
- re-design the css style to follow cyber punk like theme
- remove broswer mode of network in index.html
- the index.html loads the xterm in 2 phases
    1. a pop-up for user to key in the delegate proxy `ws://localhost:8888` for example. we allow user to empty nothing which will disable the network
    2. load the wasm and xterm 
## Tests
- run the server and verify new process can connect to the web by key in `ping 1.1.1.1` in xterm console
