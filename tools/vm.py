#!/usr/bin/env python3
"""Operate the isolated Fedora GNOME VM; never operate the host desktop."""
import argparse
import json
from pathlib import Path
import socket
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
VM = ROOT / '.cache/vm-gnome'


def ssh_args():
    return ['ssh', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new',
            '-o', f'UserKnownHostsFile={VM}/known_hosts', '-i',
            str(VM / 'id_ed25519'), '-p', '2233', 'lightos@127.0.0.1']


class Monitor:
    def __enter__(self):
        self.socket = socket.socket(socket.AF_UNIX)
        self.socket.connect(str(VM / 'qmp.sock'))
        self.stream = self.socket.makefile('rwb')
        self.stream.readline()
        self.call('qmp_capabilities')
        return self

    def __exit__(self, *_args):
        self.stream.close()
        self.socket.close()

    def call(self, execute, **arguments):
        self.stream.write((json.dumps(dict(execute=execute, arguments=arguments)) + '\n').encode())
        self.stream.flush()
        while True:
            reply = json.loads(self.stream.readline())
            if 'error' in reply:
                raise RuntimeError(reply['error'])
            if 'return' in reply:
                return reply['return']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['ssh', 'capture', 'click', 'key', 'type', 'start', 'stop', 'install'])
    parser.add_argument('values', nargs='*')
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=800)
    args = parser.parse_args()
    if args.command == 'ssh':
        return subprocess.call(ssh_args() + args.values)
    if args.command == 'start':
        subprocess.run(['qemu-system-x86_64', '-name', 'LightOS-GNOME',
                        '-machine', 'q35,accel=kvm', '-cpu', 'host', '-smp', '4', '-m', '6144',
                        '-drive', f'if=virtio,format=qcow2,file={VM}/lightos-gnome.qcow2',
                        '-device', 'virtio-vga', '-device', 'qemu-xhci', '-device', 'usb-kbd',
                        '-device', 'usb-tablet', '-netdev',
                        'user,id=net0,hostfwd=tcp:127.0.0.1:2233-:22', '-device',
                        'virtio-net-pci,netdev=net0', '-display', 'none', '-vnc',
                        '127.0.0.1:10,websocket=127.0.0.1:6081',
                        '-serial', f'file:{VM}/serial.log', '-qmp',
                        f'unix:{VM}/qmp.sock,server=on,wait=off', '-pidfile',
                        f'{VM}/qemu.pid', '-daemonize'], check=True)
        return 0
    if args.command == 'install':
        archive = ROOT / 'dist/lightos@lightos.dev.shell-extension.zip'
        subprocess.run(['scp', '-q', '-o', f'UserKnownHostsFile={VM}/known_hosts',
                        '-i', str(VM / 'id_ed25519'), '-P', '2233',
                        str(archive), 'lightos@127.0.0.1:lightos-gnome.zip'], check=True)
        return subprocess.call(ssh_args() + [
            'XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus '
            'gnome-extensions install --force ~/lightos-gnome.zip'])
    with Monitor() as monitor:
        if args.command == 'capture':
            path = Path(args.values[0]).resolve()
            path.parent.mkdir(parents=True, exist_ok=True)
            monitor.call('screendump', filename=str(path), format='png')
            print(path)
        elif args.command == 'key':
            aliases = {'super': 'meta_l', 'space': 'spc'}
            monitor.call('send-key', keys=[dict(type='qcode', data=aliases.get(key, key)) for key in args.values])
            time.sleep(.25)
        elif args.command == 'type':
            symbols = {' ': 'spc', '.': 'dot', ',': 'comma', '/': 'slash', '-': 'minus',
                       '_': 'shift-minus', ':': 'shift-semicolon', ';': 'semicolon',
                       '=': 'equal', '+': 'shift-equal', '(': 'shift-9', ')': 'shift-0',
                       '*': 'shift-8', "'": 'apostrophe', '"': 'shift-apostrophe',
                       '<': 'shift-comma', '>': 'shift-dot'}
            for char in ' '.join(args.values):
                qcode = symbols.get(char, f'shift-{char.lower()}' if char.isupper() else char)
                monitor.call('human-monitor-command', **{'command-line': f'sendkey {qcode} 20'})
                time.sleep(.03)
        elif args.command == 'click':
            x, y = map(int, args.values)
            monitor.call('input-send-event', events=[
                dict(type='abs', data=dict(axis='x', value=round(x * 32767 / (args.width - 1)))),
                dict(type='abs', data=dict(axis='y', value=round(y * 32767 / (args.height - 1))))])
            monitor.call('input-send-event', events=[dict(type='btn', data=dict(button='left', down=True))])
            time.sleep(.08)
            monitor.call('input-send-event', events=[dict(type='btn', data=dict(button='left', down=False))])
        else:
            monitor.call('system_powerdown')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
