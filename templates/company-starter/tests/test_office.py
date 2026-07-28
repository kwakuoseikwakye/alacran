"""tools/office/office.py のunittestスイート。

テンプレの約束(git+python3だけで動く)に従い標準ライブラリのみ。
偽緑禁止: 各機能はPASS側とFAIL側の両方をpinする。

実行:
    python3 -m unittest discover -s tests -p "test_office.py" -v
"""

import http.server
import json
import os
import stat
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
OFFICE_DIR = REPO_ROOT / "tools" / "office"
sys.path.insert(0, str(OFFICE_DIR))

import office  # noqa: E402


class OfficeTestCase(unittest.TestCase):
    """HOMEを一時ディレクトリに差し替える基底クラス。

    office.pyはpathlib.Path.home()経由でHOMEを解決するため、
    環境変数HOMEの差し替えで実ユーザ環境から隔離できる。
    """

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self._old_home = os.environ.get("HOME")
        os.environ["HOME"] = self._tmp.name
        self.home = Path(self._tmp.name)

    def tearDown(self):
        if self._old_home is not None:
            os.environ["HOME"] = self._old_home
        self._tmp.cleanup()

    def _with_fake_node(self, stdout, exit_code=0):
        """PATH先頭にfake nodeを差し込む。"""
        bindir = self.home / "bin"
        bindir.mkdir(parents=True, exist_ok=True)
        fake = bindir / "node"
        fake.write_text(f"#!/bin/sh\necho '{stdout}'\nexit {exit_code}\n")
        fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
        return f"{bindir}:{os.environ['PATH']}"


class TestNodeVersion(OfficeTestCase):
    def test_node_22_is_parsed(self):
        path = self._with_fake_node("v22.22.3")
        self.assertEqual(office.node_major_version(env_path=path), 22)

    def test_node_18_is_parsed(self):
        path = self._with_fake_node("v18.19.0")
        self.assertEqual(office.node_major_version(env_path=path), 18)

    def test_missing_node_returns_none(self):
        # PATHをfake binだけにしてnodeを見つけられなくする
        bindir = self.home / "emptybin"
        bindir.mkdir(parents=True)
        self.assertIsNone(office.node_major_version(env_path=str(bindir)))


class TestDoctor(OfficeTestCase):
    def test_doctor_fails_without_node(self):
        bindir = self.home / "emptybin"
        bindir.mkdir(parents=True)
        self.assertNotEqual(office.cmd_doctor(env_path=str(bindir)), 0)

    def test_doctor_succeeds_with_node22(self):
        path = self._with_fake_node("v22.22.3")
        self.assertEqual(office.cmd_doctor(env_path=path), 0)


class TestInstallHook(OfficeTestCase):
    def test_install_copies_script_and_is_idempotent(self):
        rc = office.cmd_install_hook()
        self.assertEqual(rc, 0)
        dest = self.home / ".pixel-agents" / "hooks" / "claude-hook.js"
        self.assertTrue(dest.exists())
        pixel_home = self.home / ".pixel-agents"
        self.assertEqual(pixel_home.stat().st_mode & 0o777, 0o700)
        self.assertEqual(dest.parent.stat().st_mode & 0o777, 0o700)
        # 冪等: 2回目も成功し内容が同じ
        rc2 = office.cmd_install_hook()
        self.assertEqual(rc2, 0)
        src = OFFICE_DIR / "dist" / "hooks" / "claude-hook.js"
        self.assertEqual(dest.read_bytes(), src.read_bytes())

    def test_install_fails_if_source_missing(self):
        # コピー元が無い状態をシミュレート(壊れた配布物の検知)
        rc = office.cmd_install_hook(source=self.home / "nonexistent.js")
        self.assertNotEqual(rc, 0)

    def test_install_fails_cleanly_if_destination_blocked(self):
        # ~/.pixel-agents/hooks をファイルとして先に作っておき、
        # mkdirが失敗してもtracebackを出さずNGで終わることをpinする
        pixel_home = self.home / ".pixel-agents"
        pixel_home.mkdir(parents=True)
        (pixel_home / "hooks").write_text("not a directory")
        rc = office.cmd_install_hook()
        self.assertNotEqual(rc, 0)


class _StubHandler(http.server.BaseHTTPRequestHandler):
    """POST /api/hooks/claude に200を返す最小スタブ。"""

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


class TestPorts(OfficeTestCase):
    def test_find_free_port_skips_occupied(self):
        # 3100を塞ぐと3101が返る
        import socket
        s = socket.socket()
        s.bind(("127.0.0.1", 3100))
        s.listen(1)
        try:
            self.assertEqual(office.find_free_port(3100, 3109), 3101)
        finally:
            s.close()

    def test_find_free_port_none_when_all_busy(self):
        self.assertIsNone(office.find_free_port(3100, 3099))  # 空レンジ=全滅相当


class TestServerInfo(OfficeTestCase):
    def test_none_when_missing(self):
        self.assertIsNone(office.server_info())

    def test_reads_server_json(self):
        p = self.home / ".pixel-agents"
        p.mkdir(parents=True)
        (p / "server.json").write_text(
            json.dumps({"port": 3100, "pid": 12345, "token": "t"})
        )
        info = office.server_info()
        self.assertEqual(info["port"], 3100)

    def test_none_when_pid_and_port_missing(self):
        # pid/portを欠いたJSON(壊れた/中途半端なserver.json)は
        # is_pid_alive(-1)がmacOSで誤ってTrueを返す入口になるため、
        # server_info()の時点でスキーマ検証してNoneにする
        p = self.home / ".pixel-agents"
        p.mkdir(parents=True)
        (p / "server.json").write_text(json.dumps({"token": "t"}))
        self.assertIsNone(office.server_info())

    def test_none_when_pid_not_positive(self):
        p = self.home / ".pixel-agents"
        p.mkdir(parents=True)
        (p / "server.json").write_text(json.dumps({"pid": -1, "port": 3100}))
        self.assertIsNone(office.server_info())

    def test_is_pid_alive(self):
        self.assertTrue(office.is_pid_alive(os.getpid()))
        # PID 2^22 近辺はまず存在しない(macOSのpid_maxは99998)
        self.assertFalse(office.is_pid_alive(4194000))
        # os.kill(-1/0, 0)はmacOSでは例外を投げず誤ってTrue扱いになりうる
        # sentinel値なので、is_pid_alive側で明示的にFalse扱いにする
        self.assertFalse(office.is_pid_alive(-1))
        self.assertFalse(office.is_pid_alive(0))

    def test_is_pid_alive_windows_branch(self):
        """Finding F1: os.nameがntのときはOpenProcessで生存確認する。

        macOS上ではntパスを本物には実行できないため、os.nameをmockし、
        sys.modules['ctypes']を偽のwindllを持つMagicMockに差し替えて
        分岐だけをpinする(office.py側はis_pid_alive内でその都度
        `import ctypes` するため、sys.modulesのキャッシュを差し替えれば
        そのままfakeを拾う)。
        """
        from unittest import mock

        fake_ctypes = mock.MagicMock()
        fake_ctypes.windll.kernel32.OpenProcess.return_value = 0
        with mock.patch.object(office.os, "name", "nt"), \
                mock.patch.dict(sys.modules, {"ctypes": fake_ctypes}):
            self.assertFalse(office.is_pid_alive(12345))
        fake_ctypes.windll.kernel32.OpenProcess.assert_called_with(
            0x1000, False, 12345
        )

        fake_ctypes2 = mock.MagicMock()
        fake_ctypes2.windll.kernel32.OpenProcess.return_value = 1
        with mock.patch.object(office.os, "name", "nt"), \
                mock.patch.dict(sys.modules, {"ctypes": fake_ctypes2}):
            self.assertTrue(office.is_pid_alive(12345))
        fake_ctypes2.windll.kernel32.OpenProcess.assert_called_with(
            0x1000, False, 12345
        )
        fake_ctypes2.windll.kernel32.CloseHandle.assert_called_with(1)


class TestStop(OfficeTestCase):
    """cmd_stopのstale server.json掃除をpinする(stop→start同一port再起動レース対策)。"""

    def test_stop_without_server_json_returns_0_no_crash(self):
        # server.json自体が無い(未起動)場合の既存パス。落ちずに0を返す
        self.assertEqual(office.cmd_stop(), 0)

    def test_stop_removes_stale_server_json_with_dead_pid(self):
        # サーバが既に落ちているのにserver.jsonだけ残っているケース。
        # 掃除しないと後続のstartが同一portで即座にこの古いファイルを
        # 拾ってしまい、起動確認が偽NGになる(本findingの再現条件)
        p = self.home / ".pixel-agents"
        p.mkdir(parents=True)
        server_json = p / "server.json"
        server_json.write_text(json.dumps({"pid": 4194000, "port": 3100}))
        rc = office.cmd_stop()
        self.assertEqual(rc, 0)
        self.assertFalse(server_json.exists())

    def test_stop_kills_alive_process_and_removes_file(self):
        # 実際に生きているプロセス(使い捨てのsleep)をpidとして向け、
        # cmd_stopが確実に殺してファイルも消すことを確認する
        proc = subprocess.Popen(["sleep", "30"])
        try:
            p = self.home / ".pixel-agents"
            p.mkdir(parents=True)
            server_json = p / "server.json"
            server_json.write_text(
                json.dumps({"pid": proc.pid, "port": 3100})
            )
            rc = office.cmd_stop()
            self.assertEqual(rc, 0)
            proc.wait(timeout=5)
            self.assertFalse(office.is_pid_alive(proc.pid))
            self.assertFalse(server_json.exists())
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()

    def test_stop_survives_process_gone_between_check_and_kill(self):
        """Finding F3: is_pid_alive(sig 0)がTrueを返した直後にプロセスが消え、
        実際のkill(sig 15)がProcessLookupErrorを投げるレースをpinする。
        tracebackで落ちず0を返し、server.jsonは必ず消える。
        """
        from unittest import mock

        p = self.home / ".pixel-agents"
        p.mkdir(parents=True)
        server_json = p / "server.json"
        server_json.write_text(json.dumps({"pid": 99999, "port": 3100}))

        def fake_kill(pid, sig):
            if sig == 0:
                return None  # is_pid_alive視点では生存している
            raise ProcessLookupError("no such process")

        with mock.patch.object(office.os, "kill", side_effect=fake_kill):
            rc = office.cmd_stop()
        self.assertEqual(rc, 0)
        self.assertFalse(server_json.exists())


class TestHookDelivery(OfficeTestCase):
    def test_delivery_ok_against_stub_server(self):
        # スタブサーバを立て、server.jsonを向けてhookスクリプトを実行
        srv = http.server.HTTPServer(("127.0.0.1", 0), _StubHandler)
        port = srv.server_address[1]
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        try:
            p = self.home / ".pixel-agents"
            p.mkdir(parents=True)
            (p / "server.json").write_text(
                json.dumps({"port": port, "pid": os.getpid(), "token": "t"})
            )
            office.cmd_install_hook()
            log = self.home / "hook-debug.log"
            self.assertTrue(office.verify_hook_delivery(debug_log=log))
        finally:
            srv.shutdown()

    def test_delivery_fails_without_server(self):
        # server.jsonが無い→hookスクリプトは静かに終了し、到達ログが出ない
        office.cmd_install_hook()
        log = self.home / "hook-debug.log"
        self.assertFalse(office.verify_hook_delivery(debug_log=log))


class TestUninstall(OfficeTestCase):
    def _write_settings(self, hooks):
        p = self.home / ".claude"
        p.mkdir(parents=True, exist_ok=True)
        sp = p / "settings.json"
        sp.write_text(json.dumps({"model": "opus", "hooks": hooks}, indent=2))
        return sp

    def _pa_entry(self):
        return {
            "matcher": "",
            "hooks": [{
                "type": "command",
                "command": f'node "{self.home}/.pixel-agents/hooks/claude-hook.js"',
                "timeout": 5,
            }],
        }

    def _other_entry(self):
        return {
            "matcher": "",
            "hooks": [{"type": "http", "url": "http://localhost:4900/hook"}],
        }

    def test_removes_only_our_entries(self):
        sp = self._write_settings({
            "PreToolUse": [self._other_entry(), self._pa_entry()],
            "SubagentStart": [self._pa_entry()],
        })
        changed = office.remove_hooks_from_settings(sp)
        self.assertTrue(changed)
        after = json.loads(sp.read_text())
        # 偽緑禁止: 消える側(pixel-agents)と残る側(既存)の両方をpin
        self.assertEqual(after["hooks"]["PreToolUse"], [self._other_entry()])
        self.assertNotIn("SubagentStart", after["hooks"])  # 空になったキーは削除
        self.assertEqual(after["model"], "opus")  # hooks以外は不変

    def test_no_change_when_absent(self):
        sp = self._write_settings({"PreToolUse": [self._other_entry()]})
        self.assertFalse(office.remove_hooks_from_settings(sp))

    def test_uninstall_removes_script_and_server_json(self):
        office.cmd_install_hook()
        p = self.home / ".pixel-agents"
        (p / "server.json").write_text(json.dumps({"port": 3100, "pid": 4194000}))
        self._write_settings({"Stop": [self._pa_entry()]})
        rc = office.cmd_uninstall()
        self.assertEqual(rc, 0)
        self.assertFalse((p / "hooks" / "claude-hook.js").exists())
        self.assertFalse((p / "server.json").exists())

    def test_remove_hooks_with_non_dict_root_returns_false(self):
        """Finding 1: settings.json root not a dict crashes remove_hooks_from_settings."""
        p = self.home / ".claude"
        p.mkdir(parents=True, exist_ok=True)
        sp = p / "settings.json"
        # Write invalid JSON structure (array instead of dict)
        sp.write_text(json.dumps([1, 2, 3]))
        # Should return False without raising AttributeError
        result = office.remove_hooks_from_settings(sp)
        self.assertFalse(result)

    def test_uninstall_returns_0_with_non_dict_settings(self):
        """Finding 1: cmd_uninstall must always return 0, even with malformed settings.json."""
        p = self.home / ".claude"
        p.mkdir(parents=True, exist_ok=True)
        sp = p / "settings.json"
        sp.write_text(json.dumps([1, 2, 3]))
        # Even with malformed settings, uninstall must return 0
        rc = office.cmd_uninstall()
        self.assertEqual(rc, 0)

    def test_empty_hooks_key_fully_removed(self):
        """Finding 2: hooks key is removed when it becomes empty after filtering."""
        sp = self._write_settings({
            "Stop": [self._pa_entry()],
        })
        # Only pixel-agents entries, should all be removed
        changed = office.remove_hooks_from_settings(sp)
        self.assertTrue(changed)
        after = json.loads(sp.read_text())
        # Hooks key should be completely gone
        self.assertNotIn("hooks", after)
        # Other fields should remain
        self.assertEqual(after["model"], "opus")

    def test_non_dict_hook_element_is_kept_without_crashing(self):
        """Finding F4: hooksイベント配列に文字列要素(不正データ)が混じっても
        例外を出さず、pixel-agentsエントリのみ除去しそれ以外は保持する。
        """
        sp = self._write_settings({
            "PreToolUse": ["not-a-dict-entry", self._pa_entry(), self._other_entry()],
        })
        changed = office.remove_hooks_from_settings(sp)
        self.assertTrue(changed)
        after = json.loads(sp.read_text())
        self.assertEqual(
            after["hooks"]["PreToolUse"],
            ["not-a-dict-entry", self._other_entry()],
        )


if __name__ == "__main__":
    unittest.main()
