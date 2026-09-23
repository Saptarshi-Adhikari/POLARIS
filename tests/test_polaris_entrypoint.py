import unittest
import os

class TestPolarisEntrypointCanonical(unittest.TestCase):
    def setUp(self):
        self.index_path = os.path.join(os.path.dirname(__file__), '..', 'index.html')
        with open(self.index_path, 'r', encoding='utf-8') as f:
            self.index_content = f.read()

    def test_single_canonical_main_module(self):
        """Verify index.html imports exactly one canonical main.js module."""
        self.assertIn('<script type="module" src="/src/js/main.js"></script>', self.index_content)
        module_scripts = [line for line in self.index_content.splitlines() if 'type="module"' in line]
        self.assertEqual(len(module_scripts), 1)

    def test_dev_service_worker_unregistration(self):
        """Verify index.html unregisters service worker on localhost/127.0.0.1 in dev mode."""
        self.assertIn("window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'", self.index_content)
        self.assertIn("registration.unregister()", self.index_content)

    def test_no_legacy_redirect_or_flags(self):
        """Verify no legacy sidebar title or location redirects exist in index.html."""
        self.assertNotIn("ASTRALIS CONTROL SIDEBAR", self.index_content)
        self.assertNotIn("window.location.replace", self.index_content)

if __name__ == '__main__':
    unittest.main()
