Module['arguments'] =
[
    "-incoming", "file:/pack/vm.state",
    "-nographic", "-m", "512M", "-accel", "tcg,tb-size=500,thread=multi", "-smp", "4,sockets=4",
    "-machine", "virt",
    "-L", "/pack/",
    "-drive", "if=virtio,format=raw,file=/pack/rootfs.bin",
    "-kernel", "/pack/Image",
    "-append", "earlyprintk=ttyS0 console=ttyS0 root=/dev/vda rootwait ro quiet virtio_net.napi_tx=false loglevel=0 QEMU_MODE=1 init=/sbin/tini -- /sbin/init",
    "-virtfs", "local,path=/,mount_tag=wasi0,security_model=passthrough,id=wasi0",
    "-virtfs", "local,path=/pack,mount_tag=wasi1,security_model=passthrough,id=wasi1",
    "-netdev", "socket,id=vmnic,connect=127.0.0.1:8888", "-device", "virtio-net-pci,netdev=vmnic"
]
;
