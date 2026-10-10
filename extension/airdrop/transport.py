"""AirDrop HTTPS client for an existing AWDL interface.

Wire format follows OpenDrop and Omdrop: binary plists, a fresh Ask TLS
connection, and a DVZip-framed cpio Upload. No radio or privileged operations.
"""
import ipaddress
import os
from pathlib import Path
import plistlib
import socket
import ssl
import tempfile
import uuid
import zlib
from http.client import HTTPSConnection

from vendor import identity


def interface_address(interface):
    for row in Path('/proc/net/if_inet6').read_text().splitlines():
        fields = row.split()
        if fields[5] == interface:
            address = ipaddress.IPv6Address(bytes.fromhex(fields[0]))
            if address.is_link_local:
                return str(address)
    return None


def validate_files(files):
    if not files or len(files) > 256:
        raise ValueError('Bitte 1 bis 256 Dateien auswählen.')
    paths = [os.path.abspath(path) for path in files]
    names = [os.path.basename(path) for path in paths]
    if len(set(names)) != len(names):
        raise ValueError('Die ausgewählten Dateien haben gleiche Namen.')
    for path in paths:
        if not os.path.isfile(path) or not os.access(path, os.R_OK):
            raise ValueError('Nur lesbare Dateien können gesendet werden. Ordner bitte zuerst komprimieren.')
    return paths


class Client:
    def __init__(self, host, port, interface='awdl0', name=None):
        address = ipaddress.IPv6Address(host.split('%')[0])
        if not address.is_link_local and not address.is_loopback:
            raise ValueError('AirDrop benötigt eine lokale IPv6-Adresse.')
        self.host = str(address) + (f'%{interface}' if address.is_link_local else '')
        self.port = port
        self.interface = interface
        self.name = name or socket.gethostname().split('.')[0]
        self.sid = Path(f'/sys/class/net/{interface}/address').read_text().strip().replace(':', '')
        self.identity = identity.resolve(identity.User(), name=self.name)
        self.connection = None

    def connect(self, timeout=5):
        self.close()
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        # Everyone-mode AirDrop peers use self-signed certificates.
        context.verify_mode = ssl.CERT_NONE
        identity.load_into(context, self.identity)
        self.connection = HTTPSConnection(self.host, self.port, context=context, timeout=timeout)

    def close(self):
        if self.connection:
            self.connection.close()
            self.connection = None

    def post(self, endpoint, body, headers=None):
        self.connection.request('POST', endpoint, body, {
            'Content-Type': 'application/octet-stream', 'User-Agent': 'AirDrop/1.0',
            'Connection': 'keep-alive', **(headers or {})})
        response = self.connection.getresponse()
        # Metadata responses must not consume arbitrary memory.
        data = response.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError('Die Antwort des Geräts ist zu groß.')
        return response.status, data

    def discover(self):
        self.connect()
        try:
            body = {'DeviceSupportFlags': 111611}
            if self.identity.record:
                body['SenderRecordData'] = self.identity.record
            status, data = self.post('/Discover', plistlib.dumps(body, fmt=plistlib.FMT_BINARY))
            return plistlib.loads(data).get('ReceiverComputerName') if status == 200 else None
        finally:
            self.close()

    def send(self, files, phase, cancelled):
        import libarchive
        files = validate_files(files)
        transfer_id = str(uuid.uuid4()).upper()
        uti = {'.jpg': 'public.jpeg', '.jpeg': 'public.jpeg', '.png': 'public.png',
               '.heic': 'public.heic', '.pdf': 'com.adobe.pdf', '.txt': 'public.plain-text',
               '.mp4': 'public.mpeg-4', '.mov': 'com.apple.quicktime-movie'}
        body = {
            'TransferID': {'id': transfer_id}, 'TransferType': {'files': {}},
            'SenderComputerName': self.name, 'SenderModelName': 'MacBookPro18,3',
            'SenderID': self.sid, 'BundleID': 'com.apple.finder', 'Items': [],
            'ConvertMediaFormats': False,
            'Files': [{'FileName': os.path.basename(path), 'FileBomPath': './' + os.path.basename(path),
                       'FileType': uti.get(Path(path).suffix.lower(), 'public.data'),
                       'FileSize': os.path.getsize(path), 'FileIsDirectory': False,
                       'ConvertMediaFormats': False} for path in files]}
        if self.identity.record:
            body['SenderRecordData'] = self.identity.record
        phase('Warten auf Annahme …')
        self.connect(timeout=90)
        try:
            status, _ = self.post('/Ask', plistlib.dumps(body, fmt=plistlib.FMT_BINARY))
            if status != 200:
                raise ValueError('Die Übertragung wurde abgelehnt.')
            if cancelled.is_set():
                raise InterruptedError('Übertragung abgebrochen.')
            phase('Dateien werden vorbereitet …')
            # Disk-backed archives keep large transfers out of Shell/Python RAM.
            with tempfile.TemporaryFile() as cpio, tempfile.TemporaryFile() as upload:
                with libarchive.custom_writer(cpio.write, 'cpio') as archive:
                    for path in files:
                        if cancelled.is_set():
                            raise InterruptedError('Übertragung abgebrochen.')
                        with open(path, 'rb') as source:
                            size = os.fstat(source.fileno()).st_size
                            def chunks():
                                remaining = size
                                while remaining:
                                    if cancelled.is_set():
                                        raise InterruptedError('Übertragung abgebrochen.')
                                    data = source.read(min(65536, remaining))
                                    if not data:
                                        raise ValueError('Eine Datei wurde während des Versands geändert.')
                                    remaining -= len(data)
                                    yield data
                            archive.add_file_from_memory('./' + os.path.basename(path), size, chunks(), permission=0o644)
                cpio.seek(0)
                while raw := cpio.read(65536):
                    if cancelled.is_set():
                        raise InterruptedError('Übertragung abgebrochen.')
                    compressed = zlib.compress(raw, 6)
                    stored = len(compressed) >= len(raw)
                    payload = raw if stored else compressed
                    upload.write((len(payload) | (0x80000000 if stored else 0)).to_bytes(4, 'big'))
                    upload.write(payload)
                upload.seek(0)
                phase('Dateien werden gesendet …')
                self.connection.sock.settimeout(30)
                status, _ = self.post('/Upload', upload, {
                    'Content-Type': 'application/x-dvzip', 'TransferID': transfer_id,
                    'TotalBytes': str(sum(os.path.getsize(path) for path in files))})
                if status != 200:
                    raise ValueError(f'Das Gerät konnte die Dateien nicht speichern (HTTP {status}).')
        finally:
            self.close()
