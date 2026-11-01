#!/usr/bin/env python3
"""Read-only Linux system snapshot for LightOS.

All values come from procfs, sysfs or an IPv4 socket ioctl. Nothing is written
to the system and no external process is spawned, so a snapshot is cheap and
side-effect free.

Availability policy: scalar measurements that the kernel or machine does not
expose are omitted entirely; collection sections are always present and fall
back to an empty list rather than to a fabricated zero reading.
"""

from __future__ import annotations

import fcntl
import glob
import json
import os
import socket
import struct

PROC_ROOT = "/proc"
SYS_ROOT = "/sys"

SECTOR_BYTES = 512
SIOCGIFADDR = 0x8915

# Pseudo filesystems that carry no user data and would only duplicate or
# inflate the list of real mounts.
VIRTUAL_FILESYSTEMS = frozenset({
    "autofs",
    "bdev",
    "binfmt_misc",
    "bpf",
    "cgroup",
    "cgroup2",
    "configfs",
    "debugfs",
    "devfs",
    "devpts",
    "devtmpfs",
    "efivarfs",
    "fusectl",
    "hugetlbfs",
    "mqueue",
    "nsfs",
    "proc",
    "procfs",
    "pstore",
    "ramfs",
    "rootfs",
    "rpc_pipefs",
    "securityfs",
    "sysfs",
    "tmpfs",
    "tracefs",
})

# Whole-disk filtering for /proc/diskstats: the /sys/block list already
# excludes partitions, these prefixes exclude pseudo block devices.
SKIP_BLOCK_PREFIXES = ("loop", "ram")

DISKSTATS_SECTOR_READ = 5
DISKSTATS_SECTOR_WRITE = 9
NET_DEV_RX_BYTES = 0
NET_DEV_TX_BYTES = 8


def _read_text(path):
    """Return file content, or None when unavailable (permissions, races)."""
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            return handle.read()
    except OSError:
        return None


def parse_cpu(text):
    """Parse the aggregate ``cpu`` line of /proc/stat.

    ``total`` sums all reported jiffies, ``idle`` is idle plus iowait.
    """
    for line in (text or "").splitlines():
        fields = line.split()
        if not fields or fields[0] != "cpu":
            continue
        try:
            values = [int(value) for value in fields[1:]]
        except ValueError:
            return {}
        if len(values) < 4:
            return {}
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        # guest and guest_nice are already included in user and nice.
        return {"total": sum(values[:8]), "idle": idle}
    return {}


def parse_meminfo(text):
    """Parse /proc/meminfo into byte counts.

    ``cached`` follows the conventional Cached + SReclaimable definition.
    When a kernel lacks MemAvailable it is derived from free memory, buffers
    and cache instead of being reported as zero.
    """
    raw = {}
    for line in (text or "").splitlines():
        name, separator, rest = line.partition(":")
        if not separator:
            continue
        parts = rest.split()
        if not parts:
            continue
        try:
            value = int(parts[0])
        except ValueError:
            continue
        unit = parts[1].lower() if len(parts) > 1 else ""
        raw[name.strip()] = value * 1024 if unit == "kb" else value

    result = {}
    if "MemTotal" in raw:
        result["total"] = raw["MemTotal"]
    if "MemAvailable" in raw:
        result["available"] = raw["MemAvailable"]
    else:
        fallback = ("MemFree", "Buffers", "Cached", "SReclaimable")
        if all(field in raw for field in fallback):
            result["available"] = sum(raw[field] for field in fallback)
    if "SwapTotal" in raw:
        result["swapTotal"] = raw["SwapTotal"]
    if "SwapFree" in raw:
        result["swapFree"] = raw["SwapFree"]
    if "Cached" in raw:
        result["cached"] = raw["Cached"] + raw.get("SReclaimable", 0)
    return result


def parse_net_dev(text):
    """Parse /proc/net/dev into byte counters, skipping the loopback device."""
    entries = []
    for line in (text or "").splitlines():
        if ":" not in line:
            continue
        name, _, rest = line.partition(":")
        name = name.strip()
        if not name or name == "lo":
            continue
        fields = rest.split()
        if len(fields) <= NET_DEV_TX_BYTES:
            continue
        try:
            rx = int(fields[NET_DEV_RX_BYTES])
            tx = int(fields[NET_DEV_TX_BYTES])
        except ValueError:
            continue
        entries.append({"name": name, "rx": rx, "tx": tx})
    return entries


def parse_diskstats(text, block_devices):
    """Parse /proc/diskstats, keeping only whole disks from /sys/block.

    Sector counters are converted with a fixed 512-byte sector size.
    """
    entries = []
    for line in (text or "").splitlines():
        fields = line.split()
        if len(fields) <= DISKSTATS_SECTOR_WRITE:
            continue
        name = fields[2]
        if name not in block_devices:
            continue
        try:
            read_sectors = int(fields[DISKSTATS_SECTOR_READ])
            write_sectors = int(fields[DISKSTATS_SECTOR_WRITE])
        except ValueError:
            continue
        entries.append({
            "name": name,
            "read": read_sectors * SECTOR_BYTES,
            "write": write_sectors * SECTOR_BYTES,
        })
    return entries


def _unescape_mountinfo(value):
    return (value.replace("\\040", " ")
            .replace("\\011", "\t")
            .replace("\\012", "\n")
            .replace("\\134", "\\"))


def parse_mountinfo(text):
    """Parse /proc/self/mountinfo into mount records."""
    entries = []
    for line in (text or "").splitlines():
        fields = line.split()
        try:
            separator = fields.index("-")
        except ValueError:
            continue
        if separator < 6 or len(fields) < separator + 2:
            continue
        entries.append({
            "path": _unescape_mountinfo(fields[4]),
            "device": fields[2],
            "fstype": fields[separator + 1],
            "source": (_unescape_mountinfo(fields[separator + 2])
                       if len(fields) > separator + 2 else ""),
        })
    return entries


def select_filesystems(entries, statvfs=None):
    """Filter parsed mount records down to unique, real, readable mounts."""
    statvfs = statvfs or os.statvfs
    result = []
    seen_devices = set()
    seen_paths = set()
    for entry in entries:
        fstype = entry.get("fstype") or ""
        path = entry.get("path") or ""
        device = entry.get("device") or ""
        if not path or not device:
            continue
        if fstype in VIRTUAL_FILESYSTEMS or fstype.startswith("fuse.gvfs"):
            continue
        if device in seen_devices or path in seen_paths:
            continue
        try:
            stats = statvfs(path)
        except OSError:
            continue
        block_size = getattr(stats, "f_frsize", 0) or getattr(stats, "f_bsize", 0)
        total = stats.f_blocks * block_size
        if total <= 0:
            continue
        seen_devices.add(device)
        seen_paths.add(path)
        source = entry.get("source") or ""
        name = os.path.basename(source.rstrip("/")) if source.startswith("/") else source
        result.append({
            "path": path,
            "name": name or fstype,
            "total": total,
            "free": stats.f_bavail * block_size,
        })
    return result


def iface_ipv4(name):
    """Return the primary IPv4 address of an interface via SIOCGIFADDR."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            request = struct.pack("256s", name.encode("utf-8", "replace")[:15])
            response = fcntl.ioctl(sock.fileno(), SIOCGIFADDR, request)
        return socket.inet_ntoa(response[20:24])
    except (OSError, ValueError):
        return None


def _parse_uptime(text):
    try:
        return float((text or "").split()[0])
    except (IndexError, ValueError):
        return None


def _block_devices():
    try:
        names = os.listdir(os.path.join(SYS_ROOT, "block"))
    except OSError:
        return set()
    return {name for name in names if not name.startswith(SKIP_BLOCK_PREFIXES)}


def _network():
    entries = parse_net_dev(_read_text(os.path.join(PROC_ROOT, "net", "dev")))
    for entry in entries:
        ipv4 = iface_ipv4(entry["name"])
        if ipv4:
            entry["ipv4"] = ipv4
    return entries


def _disks():
    text = _read_text(os.path.join(PROC_ROOT, "diskstats"))
    if text is None:
        return []
    entries = parse_diskstats(text, _block_devices())
    return sorted(entries, key=lambda entry: entry["name"])


def _filesystems():
    text = _read_text(os.path.join(PROC_ROOT, "self", "mountinfo"))
    if text is None:
        return []
    return select_filesystems(parse_mountinfo(text))


def _temperatures():
    readings = []
    pattern = os.path.join(SYS_ROOT, "class", "hwmon", "hwmon*")
    for chip_dir in sorted(glob.glob(pattern)):
        chip = (_read_text(os.path.join(chip_dir, "name")) or "").strip()
        for sensor in sorted(glob.glob(os.path.join(chip_dir, "temp*_input"))):
            raw = (_read_text(sensor) or "").strip()
            try:
                millidegrees = int(raw)
            except ValueError:
                continue
            stem = sensor[:-len("_input")]
            label = (_read_text(stem + "_label") or "").strip()
            if label:
                name = label
            else:
                name = os.path.basename(stem)
                if chip:
                    name = f"{chip} {name}"
            readings.append({
                "name": name,
                "celsius": round(millidegrees / 1000.0, 1),
            })
    return readings


def _gpu():
    readings = []
    pattern = os.path.join(SYS_ROOT, "class", "drm", "card*", "device",
                           "gpu_busy_percent")
    for busy_path in sorted(glob.glob(pattern)):
        raw = (_read_text(busy_path) or "").strip()
        try:
            busy = int(raw)
        except ValueError:
            continue
        name = os.path.basename(os.path.dirname(os.path.dirname(busy_path)))
        readings.append({"name": name, "busy": busy})
    return readings


def snapshot():
    """Collect one read-only snapshot of the running system."""
    result = {}

    cpu = parse_cpu(_read_text(os.path.join(PROC_ROOT, "stat")) or "")
    if cpu:
        result["cpu"] = cpu

    memory = parse_meminfo(_read_text(os.path.join(PROC_ROOT, "meminfo")) or "")
    if memory:
        result["memory"] = memory

    uptime = _parse_uptime(_read_text(os.path.join(PROC_ROOT, "uptime")))
    if uptime is not None:
        result["uptime"] = uptime

    result["network"] = _network()
    result["disks"] = _disks()
    result["filesystems"] = _filesystems()
    result["temperatures"] = _temperatures()
    result["gpu"] = _gpu()
    return result


if __name__ == "__main__":
    print(json.dumps(snapshot()))
