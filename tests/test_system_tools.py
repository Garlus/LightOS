#!/usr/bin/env python3
"""Unit tests for extension/systemTools.py (fixtures, no package mutation).

Covers the non-GUI helpers: command() process contract, Flatpak scope
separation, Homebrew JSON parsing and cache candidate discovery. All external
commands are mocked; nothing is installed, upgraded or removed.
"""

import importlib.util
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

import gi

gi.require_version("Gtk", "4.0")
gi.require_version("Adw", "1")
from gi.repository import GLib

ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "extension" / "systemTools.py"

_spec = importlib.util.spec_from_file_location("lightos_system_tools", MODULE_PATH)
tools = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(tools)


class FakeGLib:
    """Minimal GLib surface used by cache_candidates()."""

    def __init__(self, cache_dir):
        self._cache_dir = str(cache_dir)

    def get_user_cache_dir(self):
        return self._cache_dir

    format_size = staticmethod(GLib.format_size)


class CommandTest(unittest.TestCase):
    def test_argv_env_and_devnull_stdin(self):
        with mock.patch.object(tools.subprocess, "run") as run:
            run.return_value = subprocess.CompletedProcess(
                ["flatpak"], 0, stdout="  org.example.App \n", stderr="")
            self.assertEqual(tools.command(["flatpak", "list", "--app"]),
                             "org.example.App")
        args, kwargs = run.call_args
        self.assertEqual(args[0], ["flatpak", "list", "--app"])
        self.assertIsInstance(args[0], list)
        self.assertIs(kwargs["stdin"], subprocess.DEVNULL)
        self.assertIs(kwargs["stdout"], subprocess.PIPE)
        self.assertIs(kwargs["stderr"], subprocess.PIPE)
        self.assertTrue(kwargs["text"])
        self.assertNotIn("shell", kwargs)
        self.assertEqual(kwargs["timeout"], 180)
        self.assertEqual(kwargs["env"]["LC_ALL"], "C.UTF-8")
        self.assertEqual(kwargs["env"]["HOMEBREW_NO_AUTO_UPDATE"], "1")
        self.assertEqual(kwargs["env"]["HOMEBREW_NO_ASK"], "1")
        self.assertIn("PATH", kwargs["env"])

    def test_nonzero_exit_reports_stderr_stdout_or_code(self):
        cases = [
            ({"stdout": "", "stderr": "fatal: boom\n"}, "fatal: boom"),
            ({"stdout": "only stdout\n", "stderr": ""}, "only stdout"),
            ({"stdout": "", "stderr": ""}, "Exit 1"),
        ]
        for output, expected in cases:
            with self.subTest(expected=expected):
                with mock.patch.object(tools.subprocess, "run") as run:
                    run.return_value = subprocess.CompletedProcess(
                        ["flatpak"], 1, **output)
                    with self.assertRaises(RuntimeError) as ctx:
                        tools.command(["flatpak", "list"])
                self.assertEqual(str(ctx.exception), expected)

        # Long backend output is clipped to the last 3000 characters.
        with mock.patch.object(tools.subprocess, "run") as run:
            run.return_value = subprocess.CompletedProcess(
                ["brew"], 1, stdout="", stderr="e" * 3500)
            with self.assertRaises(RuntimeError) as ctx:
                tools.command(["brew", "info"])
        self.assertEqual(len(str(ctx.exception)), 3000)
        self.assertEqual(str(ctx.exception), "e" * 3000)

    def test_timeout_propagates_and_custom_timeout_is_forwarded(self):
        with mock.patch.object(tools.subprocess, "run") as run:
            run.side_effect = subprocess.TimeoutExpired(["flatpak", "update"], 1800)
            with self.assertRaises(subprocess.TimeoutExpired):
                tools.command(["flatpak", "update"], timeout=1800)
            self.assertEqual(run.call_args.kwargs["timeout"], 1800)


FLATPAK_USER_UPDATES = "org.gimp.GIMP\tGIMP\t2.10.36\norg.gnome.Builder\tBuilder\t46.1\n"
FLATPAK_SYSTEM_UPDATES = "org.example.Tool\tExample\t1.0\n"


class FlatpakTest(unittest.TestCase):
    def test_updates_query_each_scope_separately_with_scoped_update_argv(self):
        calls = []

        def fake_command(argv, timeout=180):
            calls.append(argv)
            return (FLATPAK_USER_UPDATES if "--user" in argv
                    else FLATPAK_SYSTEM_UPDATES)

        with mock.patch.object(tools.shutil, "which", return_value="/usr/bin/flatpak"), \
                mock.patch.object(tools, "command", side_effect=fake_command):
            items = tools.flatpaks(updates=True)

        self.assertEqual(calls, [
            ["flatpak", "remote-ls", "--user", "--app",
             "--columns=application,name,version", "--updates"],
            ["flatpak", "remote-ls", "--system", "--app",
             "--columns=application,name,version", "--updates"],
        ])
        self.assertEqual([item["name"] for item in items],
                         ["GIMP", "Builder", "Example"])
        self.assertEqual(items[0]["detail"], "Flatpak · user · 2.10.36")
        self.assertEqual(items[2]["detail"], "Flatpak · system · 1.0")
        self.assertEqual(items[0]["argv"], ["flatpak", "update", "--user",
                                            "--noninteractive", "org.gimp.GIMP"])
        self.assertEqual(items[2]["argv"], ["flatpak", "update", "--system",
                                            "--noninteractive", "org.example.Tool"])

    def test_list_builds_scoped_uninstall_argv_and_falls_back_to_app_id(self):
        calls = []

        def fake_command(argv, timeout=180):
            calls.append(argv)
            if "--user" in argv:
                return "org.gimp.GIMP\tGIMP\norg.gnome.Builder\tBuilder\t46.1\n"
            return "org.example.Tool\n"

        with mock.patch.object(tools.shutil, "which", return_value="/usr/bin/flatpak"), \
                mock.patch.object(tools, "command", side_effect=fake_command):
            items = tools.flatpaks(updates=False)

        self.assertEqual(calls, [
            ["flatpak", "list", "--user", "--app", "--columns=application,name,version"],
            ["flatpak", "list", "--system", "--app", "--columns=application,name,version"],
        ])
        # A line without a tab is not a valid --columns record.
        self.assertEqual(len(items), 2)
        # Empty version column falls back to the application ID in the detail.
        self.assertEqual(items[0]["detail"], "Flatpak · user · org.gimp.GIMP")
        self.assertEqual(items[0]["argv"], ["flatpak", "uninstall", "--user",
                                            "--noninteractive", "org.gimp.GIMP"])
        self.assertEqual(items[1]["argv"], ["flatpak", "uninstall", "--user",
                                            "--noninteractive", "org.gnome.Builder"])

    def test_missing_flatpak_binary_returns_no_items(self):
        with mock.patch.object(tools.shutil, "which", return_value=None), \
                mock.patch.object(tools, "command") as command:
            self.assertEqual(tools.flatpaks(updates=True), [])
            self.assertEqual(tools.flatpaks(updates=False), [])
        command.assert_not_called()


BREW = "/home/linuxbrew/.linuxbrew/bin/brew"

OUTDATED_JSON = json.dumps({
    "formulae": [
        {"name": "wget", "installed_versions": ["1.21.4"],
         "current_version": "1.24.5"},
        {"name": "python@3.12", "installed_versions": ["3.12.3", "3.12.4"],
         "current_version": "3.12.5"},
    ],
    "casks": [],
})

INFO_JSON = json.dumps({
    "formulae": [
        {"name": "wget", "installed": [{"version": "1.24.5"}]},
        {"name": "jq", "installed": [{"version": "1.7.1"}]},
    ],
    "casks": [],
})


class BrewTest(unittest.TestCase):
    def test_outdated_json_builds_upgrade_argv(self):
        with mock.patch.object(tools, "brew_path", return_value=BREW), \
                mock.patch.object(tools, "command", return_value=OUTDATED_JSON) as command:
            items = tools.brew_items(updates=True)

        command.assert_called_once_with([BREW, "outdated", "--json=v2"])
        self.assertEqual([item["name"] for item in items], ["wget", "python@3.12"])
        self.assertEqual(items[0]["detail"], "Homebrew · 1.21.4 → 1.24.5")
        self.assertEqual(items[1]["detail"], "Homebrew · 3.12.3, 3.12.4 → 3.12.5")
        self.assertEqual(items[0]["argv"], [BREW, "upgrade", "wget"])

    def test_info_json_builds_uninstall_argv(self):
        with mock.patch.object(tools, "brew_path", return_value=BREW), \
                mock.patch.object(tools, "command", return_value=INFO_JSON) as command:
            items = tools.brew_items(updates=False)

        command.assert_called_once_with([BREW, "info", "--json=v2", "--installed"])
        self.assertEqual([item["name"] for item in items], ["wget", "jq"])
        self.assertEqual(items[0]["detail"], "Homebrew · 1.24.5")
        self.assertEqual(items[0]["argv"], [BREW, "uninstall", "wget"])

    def test_missing_brew_returns_no_items(self):
        with mock.patch.object(tools, "brew_path", return_value=None), \
                mock.patch.object(tools, "command") as command:
            self.assertEqual(tools.brew_items(updates=True), [])
            self.assertEqual(tools.brew_items(updates=False), [])
        command.assert_not_called()


class CacheCandidatesTest(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.base = pathlib.Path(self._tmp.name)
        self.cache = self.base / "cache"
        self.cache.mkdir()
        patcher = mock.patch.object(tools, "GLib", FakeGLib(self.cache))
        patcher.start()
        self.addCleanup(patcher.stop)

    def write(self, relative, size):
        path = self.cache / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"x" * size)
        return path

    def test_only_whitelisted_directories_and_recursive_sizes(self):
        self.write("thumbnails/normal/a.png", 10)
        self.write("thumbnails/large/b.png", 20)
        (self.cache / "gnome-software").mkdir()
        for ignored in ("pip", "meson-private", "chromium", "lightos-project"):
            self.write(f"{ignored}/blob.bin", 4096)

        items = tools.cache_candidates()

        self.assertEqual([item["name"] for item in items],
                         ["Vorschaubilder", "Software-Katalog"])
        self.assertEqual(items[0]["detail"],
                         f"{GLib.format_size(30)} · {self.cache / 'thumbnails'}")
        self.assertEqual(items[1]["detail"],
                         f"{GLib.format_size(0)} · {self.cache / 'gnome-software'}")
        self.assertEqual(items[0]["path"], str(self.cache / "thumbnails"))
        self.assertEqual(len(items), 2)

    def test_symlinked_cache_directory_is_skipped(self):
        outside = self.base / "outside"
        (outside / "normal").mkdir(parents=True)
        (outside / "normal" / "a.png").write_bytes(b"x" * 128)
        (self.cache / "thumbnails").symlink_to(outside)
        self.write("gnome-software/catalog.bin", 7)

        items = tools.cache_candidates()

        self.assertEqual([item["name"] for item in items], ["Software-Katalog"])
        self.assertEqual(items[0]["detail"],
                         f"{GLib.format_size(7)} · {self.cache / 'gnome-software'}")

    def test_symlinked_subdirectories_are_not_followed(self):
        outside = self.base / "outside"
        outside.mkdir()
        (outside / "big.bin").write_bytes(b"x" * 65536)
        self.write("gnome-software/real.bin", 5)
        (self.cache / "gnome-software" / "linked").symlink_to(outside)

        items = tools.cache_candidates()

        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["detail"],
                         f"{GLib.format_size(5)} · {self.cache / 'gnome-software'}")

    def test_missing_cache_directories_yield_no_items(self):
        self.assertEqual(tools.cache_candidates(), [])


if __name__ == "__main__":
    unittest.main()
