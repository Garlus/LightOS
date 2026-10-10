"""LightOS receiver hooks. The private session socket is supplied by its parent."""
import json
import os
import socket


def request(event, **fields):
    path = os.environ.get('LIGHTOS_AIRDROP_SOCKET')
    if not path:
        return False  # fail closed when launched outside the controller
    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as connection:
            connection.settimeout(65)
            connection.connect(path)
            connection.sendall((json.dumps({'event': event,
                'generation': int(os.environ.get('LIGHTOS_AIRDROP_GENERATION', '0')), **fields}) + '\n').encode())
            with connection.makefile('rb') as stream:
                reply = stream.readline(65536)
            return json.loads(reply).get('accepted', False)
    except (OSError, ValueError):
        return False
