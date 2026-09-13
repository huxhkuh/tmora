"""Read logical and physical file sizes, including Windows executable compression."""
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import sys

kernel = ctypes.WinDLL("kernel32", use_last_error=True)
get_size = kernel.GetCompressedFileSizeW
get_size.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(wintypes.DWORD)]
get_size.restype = wintypes.DWORD

root = Path(sys.argv[1]).resolve(strict=True)
files = []
for file in sorted(root.rglob("*")):
    if not file.is_file() or file.is_symlink():
        continue
    high = wintypes.DWORD()
    ctypes.set_last_error(0)
    low = get_size(str(file), ctypes.byref(high))
    if low == 0xFFFFFFFF and ctypes.get_last_error():
        raise ctypes.WinError(ctypes.get_last_error())
    files.append({"file": str(file.relative_to(root)), "logical": file.stat().st_size,
                  "physical": (high.value << 32) | low})
print(json.dumps({"root": str(root), "logical": sum(f["logical"] for f in files),
                  "physical": sum(f["physical"] for f in files), "files": files}))
