# LightOS AirDrop

GNOME Quick Settings lives in `../airdrop.js`. `service.py` owns the native
GTK4/libadwaita send window, mDNS discovery/advertisement and receiver lifecycle.
It runs without privileges. JSON lines connect it to the extension. Closing
stdin or disabling the extension stops the receiver and current transfer.

The OS must supply a working `awdl0` interface with link-local IPv6, through
OWL or an AWDL-capable driver. LightOS never installs drivers, changes WLAN
mode, runs a root helper, starts OWL, or opens a firewall automatically. The
receive toggle controls the session receiver, not a separately managed radio.

Runtime dependencies: Python >= 3.11, PyGObject, GTK4, libadwaita >= 1.5,
`libarchive-c`, `zeroconf`, libarchive and OpenSSL. GNOME 50 provides the UI
libraries. Missing protocol dependencies are reported when turning AirDrop on.

Received files go to the user's XDG Downloads folder after explicit approval.
The server binds only its interface's IPv6 address on TCP 8771. Ask and Upload
must share an approved TLS connection; uploads consume approval once. Archive
members must match the accepted names. Existing files are never overwritten.
DVZip decoding, archive/disk limits and failure cleanup come from Omdrop.
The sender supports multiple regular local files, reports transfer phases and
cancellation, and creates its archives on disk instead of holding them in RAM.

Identity files are in `$XDG_DATA_HOME/lightos/airdrop/keys` (normally
`~/.local/share/lightos/airdrop/keys`). Self-signed identity is generated with
private file permissions. Omdrop's own keys, settings and runtime state are
not touched. Everyone mode works without an Apple-issued identity. Contacts
Only sending requires manually supplied Apple certificate/key/validation
record; LightOS does not obtain an Apple identity or offer contact management.
No Bluetooth wake advertisement is implemented: open AirDrop on the receiving
Apple device and select Everyone. Apple hardware compatibility needs a real
AWDL-equipped machine and an Apple-device test.

`--interface` is a controller CLI option for isolated transport validation;
the extension always uses `awdl0`. `--send` supports the hidden native desktop
association installed while the extension is enabled. It supplies the Shell
application name and icon for the helper window, without an app-grid entry.
The extension removes its unchanged managed association on disable.

## Sources and license

Vendored MIT sources from [brentkearney/omdrop-plugin](https://github.com/brentkearney/omdrop-plugin),
commit `58fca678b08d3a7c875c83c7dfc2f0d3251cce44`, retrieved 2026-10-09:

- `bin/airdrop-serve.py` → `vendor/receiver.py`
- `bin/identity.py`, `contacts.py`, `debugdump.py` → `vendor/`
- `bin/apple-ca/*.pem`, `share/certs/apple_root_ca.pem` → matching subdirectories
- MIT license → `../licenses/Omdrop-MIT.txt`

LightOS modifications: isolated identity/config paths, private consent/event
socket with generation checks, single-use explicit Ask approval in Everyone
mode, accepted-name archive checks, and binding to the AWDL address instead
of the IPv6 wildcard. `lightos_ipc.py` is new LightOS code. The vendor files
remain under Omdrop's MIT license; LightOS controller/client/UI use the project
GPL-3.0 license.

The original `transport.py` follows the public AirDrop protocol described by
[OpenDrop](https://github.com/seemoo-lab/opendrop), revision
`11fe7ba7861093b302bc0637e8cb10adf2d29337`, and Omdrop. OWL compatibility relies on
its ordinary IPv6 interface and mDNS, rather than Broadcom firmware peer tables.
[OWL](https://github.com/seemoo-lab/owl) was inspected at revision
`da255a70f221784c836d943dd3f243bc798f223b`; neither OWL nor driver code is bundled.
