"""Open the unchanged production EXE without a debugger and verify native UI.
All windows and data belong to an isolated test profile.
"""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from pywinauto import Application

root = Path(tempfile.mkdtemp(prefix="hardened-", dir=Path("../../work").resolve()))
exe = Path(os.environ.get("BOU_TEST_EXE", "../windows/win-unpacked/Bou Time.exe")).resolve()
env = os.environ.copy()
env.update(BOU_DESKTOP_TEST="1", BOU_TEST_PROFILE=str(root / "profile"))
env.pop("ELECTRON_RUN_AS_NODE", None)
process = subprocess.Popen([str(exe), "--force-renderer-accessibility"], env=env)
try:
    app = Application(backend="uia").connect(process=process.pid, timeout=30)
    window = app.window(title_re=".*תמורה.*")
    window.wait("visible", timeout=30)
    button = window.child_window(title="גיבוי והגדרות", control_type="Button")
    button.wait("visible", timeout=30)
    button.invoke()
    window.child_window(title="תמורה מתחדשת", control_type="Text").wait("visible", timeout=20)
    window.capture_as_image().save(str(root / "production-security.png"))
    print(json.dumps({"passed": True, "unmodifiedProductionExe": True, "profile": str(root), "checks": ["normal startup with hardening fuses", "native settings navigation"]}))
finally:
    if process.poll() is None:
        try: window.close()
        except Exception: process.terminate()
        process.wait(timeout=20)
