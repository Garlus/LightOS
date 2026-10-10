#!/usr/bin/env python3
"""Real TLS transfers on VM loopback; no Apple hardware claim or radio mock.

The receiver's consent socket stands in for user answers for automated tests.
The UI and the same consent dialog are additionally validated interactively.
"""
import json
import io
import os
from pathlib import Path
import plistlib
import queue
import socket
import subprocess
import sys
import tempfile
import threading
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'extension/airdrop'))
from transport import Client, validate_files


class Transfers(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='lightos-airdrop-tests-')
        cls.base = Path(cls.temporary.name)
        cls.output = cls.base / 'received'
        cls.output.mkdir()
        cls.original_environment = dict(os.environ)
        os.environ['XDG_DATA_HOME'] = str(cls.base / 'data')
        os.environ['XDG_CONFIG_HOME'] = str(cls.base / 'config')
        cls.listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        cls.socket_path = str(cls.base / 'approval.sock')
        cls.listener.bind(cls.socket_path)
        cls.listener.listen()
        cls.events = queue.Queue()
        cls.accept = True
        cls.done = False
        cls.listener.settimeout(.5)

        def consent():
            while not cls.done:
                try:
                    connection, _ = cls.listener.accept()
                except socket.timeout:
                    continue
                except OSError:
                    return
                with connection:
                    with connection.makefile('rb') as stream:
                        event = json.loads(stream.readline(65536))
                    cls.events.put(event)
                    connection.sendall((json.dumps({'accepted': cls.accept}) + '\n').encode())
        threading.Thread(target=consent, daemon=True).start()
        with socket.socket(socket.AF_INET6, socket.SOCK_STREAM) as free_port:
            free_port.bind(('::1', 0))
            cls.port = free_port.getsockname()[1]
        cls.log = open(cls.base / 'receiver.log', 'w+')
        cls.receiver = subprocess.Popen([sys.executable, '-B', str(ROOT / 'extension/airdrop/vendor/receiver.py'),
            '--iface', 'lo', '--port', str(cls.port), '--outdir', str(cls.output),
            '--config', str(ROOT / 'extension/airdrop/receiver-defaults.toml')],
            env=dict(os.environ, LIGHTOS_AIRDROP_SOCKET=cls.socket_path), stdout=cls.log, stderr=cls.log)
        try:
            assert cls.events.get(timeout=15)['event'] == 'ready'
        except Exception:
            cls.receiver.terminate()
            cls.receiver.wait()
            cls.log.seek(0)
            raise RuntimeError(cls.log.read())

    @classmethod
    def tearDownClass(cls):
        cls.receiver.terminate()
        cls.receiver.wait(timeout=5)
        cls.done = True
        cls.listener.close()
        cls.log.close()
        os.environ.clear()
        os.environ.update(cls.original_environment)
        cls.temporary.cleanup()

    def setUp(self):
        type(self).accept = True
        self.client = Client('::1', self.port, interface='lo', name='LightOS TLS-Test')

    def tearDown(self):
        self.client.close()

    def test_discovery(self):
        self.assertIsInstance(self.client.discover(), str)

    def test_multiple_files_and_no_overwrite(self):
        first, second = self.base / 'photo.txt', self.base / 'notes.txt'
        first.write_bytes(b'AirDrop TLS /Ask and DVZip /Upload\n' * 100)
        second.write_bytes(os.urandom(180000))
        (self.output / 'photo.txt').write_bytes(b'existing file')
        phases = []
        self.client.send([str(first), str(second)], phases.append, threading.Event())
        self.assertEqual((self.output / 'photo.txt').read_bytes(), b'existing file')
        self.assertEqual((self.output / 'photo-1.txt').read_bytes(), first.read_bytes())
        self.assertEqual((self.output / 'notes.txt').read_bytes(), second.read_bytes())
        self.assertEqual(len(phases), 3)

    def test_decline_leaves_no_file(self):
        type(self).accept = False
        path = self.base / 'declined.txt'
        path.write_text('declined')
        with self.assertRaisesRegex(ValueError, 'abgelehnt'):
            self.client.send([str(path)], lambda _: None, threading.Event())
        self.assertFalse((self.output / path.name).exists())

    def test_cancel_after_ask_leaves_no_file(self):
        path = self.base / 'cancelled.txt'
        path.write_text('cancelled')
        cancelled = threading.Event()
        cancelled.set()
        with self.assertRaises(InterruptedError):
            self.client.send([str(path)], lambda _: None, cancelled)
        self.assertFalse((self.output / path.name).exists())

    def test_upload_requires_accepted_ask(self):
        self.client.connect()
        status, _ = self.client.post('/Upload', b'not an archive', {'Content-Type': 'application/x-dvzip'})
        self.assertEqual(status, 403)

    def test_malformed_ask(self):
        self.client.connect()
        status, _ = self.client.post('/Ask', plistlib.dumps({'Files': ['not a file descriptor']}))
        self.assertEqual(status, 400)

    def archive(self, path):
        import libarchive
        stream = io.BytesIO()
        with libarchive.custom_writer(stream.write, 'cpio') as archive:
            archive.add_files(str(path), pathname='./' + path.name)
        compressed = zlib.compress(stream.getvalue())
        return len(compressed).to_bytes(4, 'big') + compressed

    def ask(self, name):
        self.client.connect()
        status, _ = self.client.post('/Ask', plistlib.dumps({
            'SenderComputerName': 'TLS test', 'Files': [{'FileName': name}],
            'TransferType': {'files': {}}, 'Items': []}))
        self.assertEqual(status, 200)

    def test_archive_must_match_accepted_names(self):
        path = self.base / 'unexpected.txt'
        path.write_text('must not be stored')
        self.ask('expected.txt')
        status, _ = self.client.post('/Upload', self.archive(path), {'Content-Type': 'application/x-dvzip'})
        self.assertEqual(status, 413)
        self.assertFalse((self.output / path.name).exists())

    def test_upload_consumes_consent_once(self):
        path = self.base / 'once.txt'
        path.write_text('one approval, one upload')
        self.ask(path.name)
        archive = self.archive(path)
        headers = {'Content-Type': 'application/x-dvzip'}
        self.assertEqual(self.client.post('/Upload', archive, headers)[0], 200)
        self.assertEqual(self.client.post('/Upload', archive, headers)[0], 403)
        self.assertEqual((self.output / path.name).read_bytes(), path.read_bytes())
        self.assertFalse((self.output / 'once-1.txt').exists())

    def test_remote_and_folder_inputs(self):
        with self.assertRaises(ValueError):
            Client('2001:db8::1', 8771, 'lo')
        with self.assertRaises(ValueError):
            validate_files([str(self.base)])
        path = self.base / 'same.txt'
        path.write_text('data')
        with self.assertRaisesRegex(ValueError, 'gleiche Namen'):
            validate_files([str(path), str(path)])


class ControllerLifecycle(unittest.TestCase):
    def test_missing_radio_and_pipe_close(self):
        # A definitely absent interface tests the failure path even on AWDL hosts.
        process = subprocess.Popen([sys.executable, '-B', str(ROOT / 'extension/airdrop/service.py'),
            '--interface', 'lightos-absent-test'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True)
        initial = json.loads(process.stdout.readline())
        self.assertFalse(initial['enabled'])
        process.stdin.write('{"action":"set-enabled","enabled":true}\n')
        process.stdin.flush()
        failed = json.loads(process.stdout.readline())
        self.assertFalse(failed['enabled'])
        self.assertTrue(failed['error'])
        self.assertIn('AWDL', failed['message'])
        process.stdin.close()
        self.assertEqual(process.wait(timeout=5), 0)
        process.stdout.close()
        process.stderr.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
