#!/usr/bin/env python3
"""Unit tests for extension/systemStats.py (fixtures, no live /proc needed)."""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "extension" / "systemStats.py"

_spec = importlib.util.spec_from_file_location("lightos_system_stats", MODULE_PATH)
stats = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(stats)

PROC_STAT = """cpu  4321 12 900 98765 432 12 8 0 0 0
cpu0 2100 6 450 49382 216 6 4 0 0 0
cpu1 2221 6 450 49383 216 6 4 0 0 0
intr 123456
ctxt 7890
btime 1700000000
processes 1234
"""

PROC_MEMINFO = """MemTotal:       16384000 kB
MemFree:         2048000 kB
MemAvailable:   12288000 kB
Buffers:          512000 kB
Cached:          4096000 kB
SwapCached:            0 kB
SwapTotal:       8388604 kB
SwapFree:        8388604 kB
SReclaimable:     102400 kB
HugePages_Total:       0
"""

PROC_MEMINFO_LEGACY = """MemTotal:        1000000 kB
MemFree:          200000 kB
Buffers:           50000 kB
Cached:           300000 kB
SReclaimable:      25000 kB
SwapTotal:             0 kB
SwapFree:              0 kB
"""

PROC_NET_DEV = """Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:    1000      10    0    0    0     0          0         0     2000      20    0    0    0     0       0          0
  eth0: 1234567     100    0    0    0     0          0         0  7654321     200    0    0    0     0       0          0
 wlan0:      42       1    0    0    0     0          0         0       43       2    0    0    0     0       0          0
"""

PROC_DISKSTATS = """   8       0 sda 1000 0 20000 500 2000 0 40000 800 0 0 0
   8       1 sda1 500 0 10000 200 1000 0 20000 400 0 0 0
   7       0 loop0 10 0 20 0 10 0 20 0 0 0 0
 259       0 nvme0n1 3000 0 60000 900 4000 0 80000 1200 0 0 0
"""

MOUNTINFO = """36 35 8:1 / / rw,relatime shared:1 - ext4 /dev/sda1 rw
37 35 0:4 / /proc rw,nosuid - proc proc rw
38 35 0:5 / /sys rw,nosuid - sysfs sysfs rw
39 35 0:22 / /run/user/1000/doc rw - tmpfs tmpfs rw
40 35 8:17 / /media/My\\040Disk rw - vfat /dev/sdb1 rw
41 35 8:1 /home /home rw - ext4 /dev/sda1 rw
"""


class FakeStatVFS:
    def __init__(self, blocks, available, frsize=4096, bsize=4096):
        self.f_blocks = blocks
        self.f_bavail = available
        self.f_bfree = available
        self.f_frsize = frsize
        self.f_bsize = bsize


def fake_statvfs_factory(sizes):
    def fake(path):
        if path not in sizes:
            raise OSError(2, "No such file or directory")
        return sizes[path]
    return fake


class CpuTest(unittest.TestCase):
    def test_guest_time_is_not_counted_twice(self):
        self.assertEqual(stats.parse_cpu("cpu 100 20 30 40 5 6 7 8 10 2"),
                         {"total": 216, "idle": 45})

    def test_aggregate_line(self):
        self.assertEqual(stats.parse_cpu(PROC_STAT), {"total": 104450, "idle": 99197})

    def test_sums_idle_and_iowait(self):
        self.assertEqual(stats.parse_cpu("cpu 1 2 3 4 5\n"),
                         {"total": 15, "idle": 9})

    def test_missing_line(self):
        self.assertEqual(stats.parse_cpu("intr 1\n"), {})
        self.assertEqual(stats.parse_cpu(""), {})


class MeminfoTest(unittest.TestCase):
    def test_bytes_and_cached(self):
        result = stats.parse_meminfo(PROC_MEMINFO)
        self.assertEqual(result["total"], 16384000 * 1024)
        self.assertEqual(result["available"], 12288000 * 1024)
        self.assertEqual(result["swapTotal"], 8388604 * 1024)
        self.assertEqual(result["swapFree"], 8388604 * 1024)
        self.assertEqual(result["cached"], (4096000 + 102400) * 1024)
        self.assertEqual(set(result), {"total", "available", "swapTotal",
                                       "swapFree", "cached"})

    def test_available_fallback_without_memavailable(self):
        result = stats.parse_meminfo(PROC_MEMINFO_LEGACY)
        self.assertEqual(result["available"],
                         (200000 + 50000 + 300000 + 25000) * 1024)
        self.assertEqual(result["cached"], (300000 + 25000) * 1024)

    def test_missing_fields_are_omitted(self):
        self.assertEqual(stats.parse_meminfo("MemTotal: 100 kB\n"),
                         {"total": 102400})
        self.assertEqual(stats.parse_meminfo(""), {})


class NetDevTest(unittest.TestCase):
    def test_skips_loopback_and_maps_counters(self):
        entries = stats.parse_net_dev(PROC_NET_DEV)
        self.assertEqual([entry["name"] for entry in entries], ["eth0", "wlan0"])
        self.assertEqual(entries[0], {"name": "eth0", "rx": 1234567, "tx": 7654321})
        self.assertEqual(entries[1], {"name": "wlan0", "rx": 42, "tx": 43})

    def test_headers_and_empty_input(self):
        self.assertEqual(stats.parse_net_dev(""), [])
        self.assertEqual(stats.parse_net_dev(PROC_NET_DEV.splitlines()[0]), [])


class DiskstatsTest(unittest.TestCase):
    def test_only_whole_disks_and_sector_math(self):
        entries = stats.parse_diskstats(PROC_DISKSTATS, {"sda", "nvme0n1"})
        self.assertEqual(entries, [
            {"name": "sda", "read": 20000 * 512, "write": 40000 * 512},
            {"name": "nvme0n1", "read": 60000 * 512, "write": 80000 * 512},
        ])

    def test_partitions_filtered_out(self):
        entries = stats.parse_diskstats(PROC_DISKSTATS, {"sda"})
        self.assertEqual([entry["name"] for entry in entries], ["sda"])

    def test_malformed_and_empty(self):
        self.assertEqual(stats.parse_diskstats("", {"sda"}), [])
        self.assertEqual(stats.parse_diskstats("8 0 sda 1 2 3", {"sda"}), [])
        self.assertEqual(stats.parse_diskstats("8 0 sda 1 2 x 4 5 6 y 8", {"sda"}), [])


class MountinfoTest(unittest.TestCase):
    def test_parses_and_unescapes(self):
        entries = stats.parse_mountinfo(MOUNTINFO)
        self.assertEqual(len(entries), 6)
        self.assertEqual(entries[0]["path"], "/")
        self.assertEqual(entries[0]["fstype"], "ext4")
        self.assertEqual(entries[0]["source"], "/dev/sda1")
        self.assertEqual(entries[0]["device"], "8:1")
        self.assertEqual(entries[4]["path"], "/media/My Disk")
        self.assertEqual(entries[5]["fstype"], "ext4")

    def test_filesystem_selection_dedupes_and_filters(self):
        sizes = {
            "/": FakeStatVFS(1000, 250),
            "/media/My Disk": FakeStatVFS(2000, 500),
        }
        selected = stats.select_filesystems(
            stats.parse_mountinfo(MOUNTINFO),
            statvfs=fake_statvfs_factory(sizes))
        self.assertEqual(selected, [
            {"path": "/", "name": "sda1", "total": 1000 * 4096, "free": 250 * 4096},
            {"path": "/media/My Disk", "name": "sdb1",
             "total": 2000 * 4096, "free": 500 * 4096},
        ])

    def test_unreadable_mount_is_dropped(self):
        selected = stats.select_filesystems(
            stats.parse_mountinfo(MOUNTINFO), statvfs=fake_statvfs_factory({}))
        self.assertEqual(selected, [])


class SnapshotTest(unittest.TestCase):
    def test_shape_and_json_serialisability(self):
        result = stats.snapshot()
        self.assertIsInstance(result, dict)
        for section in ("network", "disks", "filesystems",
                        "temperatures", "gpu"):
            self.assertIsInstance(result[section], list)
        if "cpu" in result:
            self.assertIsInstance(result["cpu"]["total"], int)
            self.assertIsInstance(result["cpu"]["idle"], int)
        if "memory" in result:
            self.assertIsInstance(result["memory"]["total"], int)
        if "uptime" in result:
            self.assertIsInstance(result["uptime"], float)
        self.assertIsInstance(json.dumps(result), str)


if __name__ == "__main__":
    unittest.main()
