#!/usr/bin/env python3
"""Inventory source for handoff snapshots, including untracked, nonignored work."""
import hashlib
import os
from pathlib import Path
import subprocess
import sys


def inventory(root):
    raw = subprocess.check_output(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"], cwd=root)
    names = sorted(set(raw.split(b"\0")) - {b""})
    return [name for name in names if not any(part.startswith(b".env") for part in name.split(b"/"))
            and os.path.lexists(os.path.join(os.fsencode(root), name))]


def fingerprint(root, names):
    digest = hashlib.sha256()
    for name in names:
        path = Path(root) / os.fsdecode(name)
        digest.update(name + b"\0")
        digest.update(str(path.lstat().st_mode).encode() + b"\0")
        if path.is_symlink():
            digest.update(os.fsencode(os.readlink(path)))
        elif path.is_file():
            with path.open("rb") as f:
                for chunk in iter(lambda: f.read(1024 * 1024), b""):
                    digest.update(chunk)
        digest.update(b"\0")
    return digest.hexdigest()


if __name__ == "__main__":
    root = Path.cwd()
    names = inventory(root)
    if sys.argv[1:] == ["files"]:
        sys.stdout.buffer.write(b"\0".join(names) + (b"\0" if names else b""))
    elif sys.argv[1:] == ["fingerprint"]:
        print(fingerprint(root, names))
    else:
        raise SystemExit("Usage: handoff-inventory.py files|fingerprint")
