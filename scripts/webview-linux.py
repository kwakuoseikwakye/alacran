#!/usr/bin/env python3
"""Native Linux window for Alacrán — a WebKitGTK view on the local server.

Replaces `xdg-open <url>`, which handed the app to whatever browser the user
had set as default. This is an ordinary GTK application window: its own entry
in the taskbar, its own icon, its own close button.

Contract (shared with scripts/webview-macos.swift, and with whatever Windows
gets later): argv[1] is the URL to show. The process runs in the FOREGROUND
and exits when the window closes — the launcher script relies on that to know
the user quit, and kills the server on the way out.

Python + GObject introspection rather than a compiled C shell on purpose: it
needs no compiler in CI and no per-architecture build, which is what keeps the
.deb `Architecture: all` (see DEBIAN/control in scripts/package-linux.sh).

ponytail: GTK3 + WebKit2 4.1/4.0 only. Ceiling: a distro that ships ONLY
WebKitGTK 6.0 (GTK4) won't satisfy the dependency and won't install. That is
no current Debian/Ubuntu target — 4.1 is present through Debian 13 and Ubuntu
24.04 — and GTK4 is a different API (Gtk.Application, set_child, no
Gtk.main), so it is a second code path, not a version bump. Add it when a
target distro actually drops 4.1.
"""
import subprocess
import sys

import gi

# 4.1 is the current build (libsoup3); 4.0 is the older one still present on
# Ubuntu 22.04. Try newest first and fall back, rather than pinning one and
# failing to start on half the supported distros.
for _webkit_version in ("4.1", "4.0"):
    try:
        gi.require_version("WebKit2", _webkit_version)
        break
    except ValueError:
        continue
gi.require_version("Gtk", "3.0")

from gi.repository import Gio, GLib, Gtk, WebKit2  # noqa: E402

START_URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4319/"
LOCAL_HOSTS = ("127.0.0.1", "localhost", "::1", "[::1]")


def is_local(uri):
    """Only the local server belongs in this window."""
    if not uri:
        return False
    try:
        host = GLib.Uri.parse(uri, GLib.UriFlags.NONE).get_host()
    except Exception:
        return False
    return host in LOCAL_HOSTS


def open_externally(uri):
    """The GitHub release page, the changelog, a tool's docs — the wider
    internet goes to the user's real browser, which is what a native app does.
    Without this the app's target="_blank" links would silently do nothing:
    WebKitGTK drops a request for a new window unless `create` is handled."""
    if not uri or not uri.startswith(("http://", "https://", "mailto:")):
        return
    try:
        Gio.AppInfo.launch_default_for_uri(uri, None)
    except Exception:
        # No portal / no desktop-file association — xdg-open is the fallback
        # every desktop environment still ships. Popen, not GLib.spawn_async,
        # whose introspected signature takes six positional arguments and is
        # easy to call wrongly in a path that only runs when something else
        # has already failed.
        try:
            subprocess.Popen(["xdg-open", uri])
        except OSError:
            pass


def on_create(webview, navigation_action, *_):
    open_externally(navigation_action.get_request().get_uri())
    return None


def on_decide_policy(webview, decision, decision_type):
    if decision_type == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
        action = decision.get_navigation_action()
        uri = action.get_request().get_uri()
        if action.get_navigation_type() == WebKit2.NavigationType.LINK_CLICKED and not is_local(uri):
            open_externally(uri)
            decision.ignore()
            return True
    return False


def on_load_failed(webview, _event, _uri, _error):
    """The launcher polls the server for readiness before starting this, so a
    failure here means it died mid-session (an update restarting it, a crash).
    Retry briefly rather than leaving the user on a WebKit error page."""
    def retry():
        webview.load_uri(START_URL)
        return False  # one-shot: never reschedule

    GLib.timeout_add_seconds(1, retry)
    return True


def main():
    window = Gtk.Window(title="Alacrán")
    window.set_default_size(1280, 860)
    window.set_size_request(720, 480)
    # Installed by the .deb into hicolor; looked up by name so the desktop
    # environment uses the same icon as the launcher entry.
    Gtk.Window.set_default_icon_name("alacran")

    webview = WebKit2.WebView()
    webview.connect("create", on_create)
    webview.connect("decide-policy", on_decide_policy)
    webview.connect("load-failed", on_load_failed)
    webview.load_uri(START_URL)

    window.add(webview)
    window.connect("destroy", Gtk.main_quit)
    window.show_all()
    Gtk.main()


if __name__ == "__main__":
    main()
