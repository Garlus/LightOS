#!/usr/bin/env python3
"""VM-only local TLS peer for UI validation, never a simulated Apple device.

Requires an isolated virtual awdl0 test interface. Automatically accepts files
into the explicitly supplied test directory. Production receiver always asks.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'extension/airdrop'))
from transport import interface_address
from zeroconf import IPVersion, ServiceInfo, Zeroconf


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--outdir', required=True)
    parser.add_argument('--approval-delay', type=float, default=0,
                        help='Delay the simulated user answer for cancellation UI tests')
    args = parser.parse_args()
    output = Path(args.outdir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    address = interface_address('awdl0')
    if not address:
        raise SystemExit('The VM test interface is missing')
    with tempfile.TemporaryDirectory(prefix='lightos-ui-peer-') as temporary:
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        path = str(Path(temporary) / 'approval.sock')
        listener.bind(path)
        listener.listen()
        ready = threading.Event()
        def consent():
            while True:
                try:
                    connection, _ = listener.accept()
                except OSError:
                    return
                with connection:
                    with connection.makefile('rb') as stream:
                        data = json.loads(stream.readline(65536))
                    if data['event'] == 'ready':
                        ready.set()
                    elif data['event'] == 'ask':
                        time.sleep(min(45, max(0, args.approval_delay)))
                    try:
                        connection.sendall(b'{"accepted":true}\n')
                    except OSError:
                        pass
        threading.Thread(target=consent, daemon=True).start()
        process = subprocess.Popen([sys.executable, '-B', str(ROOT / 'extension/airdrop/vendor/receiver.py'),
            '--iface', 'awdl0', '--port', '8772', '--name', 'VM-Testempfänger',
            '--outdir', str(output), '--config', str(ROOT / 'extension/airdrop/receiver-defaults.toml')],
            env=dict(os.environ, LIGHTOS_AIRDROP_SOCKET=path,
                XDG_DATA_HOME=str(Path(temporary) / 'data'), XDG_CONFIG_HOME=str(Path(temporary) / 'config')))
        zeroconf = None
        try:
            if not ready.wait(10):
                raise RuntimeError('Test receiver did not become ready')
            zeroconf = Zeroconf(interfaces=[address], ip_version=IPVersion.V6Only)
            advertisement = ServiceInfo('_airdrop._tcp.local.', 'c0ffee123456._airdrop._tcp.local.',
                addresses=[socket.inet_pton(socket.AF_INET6, address)], port=8772,
                properties={'flags': '0x3f9'}, server='lightos-test-peer.local.')
            zeroconf.register_service(advertisement)
            print('VM TLS peer ready', flush=True)
            done = threading.Event()
            signal.signal(signal.SIGTERM, lambda *_: done.set())
            signal.signal(signal.SIGINT, lambda *_: done.set())
            done.wait()
        finally:
            process.terminate()
            process.wait(timeout=5)
            if zeroconf:
                zeroconf.close()
            listener.close()


if __name__ == '__main__':
    main()
