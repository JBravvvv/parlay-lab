"""Run with python3 -B -m unittest discover -s tests -p test_handoff_inventory.py."""
import importlib.util
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("handoff_inventory", Path(__file__).resolve().parents[1] / "tools/handoff-inventory.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HandoffInventoryTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pl-handoff-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", self.temp.name], check=True)
        (self.root / ".gitignore").write_text("ignored.txt\n.env*\n")
        (self.root / "tracked.ts").write_text("first")
        (self.root / "deleted.ts").write_text("delete")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        (self.root / "deleted.ts").unlink()
        (self.root / "new file.ts").write_text("new")
        (self.root / "ignored.txt").write_text("omit")
        (self.root / ".env.test").write_text("synthetic test sentinel")

    def test_new_deleted_ignored_and_secret_paths(self):
        names = module.inventory(self.root)
        self.assertIn(b"new file.ts", names)
        for name in (b"deleted.ts", b"ignored.txt", b".env.test"):
            self.assertNotIn(name, names)

    def test_same_size_same_timestamp_edit_changes_fingerprint(self):
        names = module.inventory(self.root)
        before = module.fingerprint(self.root, names)
        path = self.root / "tracked.ts"
        st = path.stat()
        path.write_text("other")
        os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns))
        self.assertNotEqual(before, module.fingerprint(self.root, names))

    def test_archive_preserves_new_file_and_symlink_without_reading_target(self):
        (self.root / "link.ts").symlink_to(".env.test")
        names = module.inventory(self.root)
        listing = self.root / "paths"
        listing.write_bytes(b"\0".join(names) + b"\0")
        archive = self.root / "snapshot.tgz"
        subprocess.run(["tar", "-c", "-z", "-f", str(archive), "--null", "-T", str(listing)], cwd=self.root, check=True)
        with tarfile.open(archive) as saved:
            self.assertEqual(saved.extractfile("new file.ts").read(), b"new")
            self.assertTrue(saved.getmember("link.ts").issym())
            self.assertNotIn(".env.test", saved.getnames())
            self.assertNotIn("deleted.ts", saved.getnames())
