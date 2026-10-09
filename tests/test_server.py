"""Integration tests use a real temporary SQLite database and HTTP server."""
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
try:
    from server import create_server
except ImportError:
    create_server = None

A = 'a' * 64
B = 'b' * 64
VALID = dict(type='found', name='校园卡', category='校园卡', place='图书馆', occurredAt='2026-01-01T01:00:00Z', contact='测试联系方式', description='蓝色卡套')

class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(create_server), 'create_server must implement the shared HTTP service')
        self.temp = tempfile.TemporaryDirectory()
        self.db = str(Path(self.temp.name) / 'test.sqlite')
        self.server = create_server('127.0.0.1', 0, self.db)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:%s' % self.server.server_port

    def tearDown(self):
        if hasattr(self, 'server'):
            self.server.shutdown(); self.server.server_close(); self.thread.join()
            self.temp.cleanup()

    def req(self, path='/api/posts', data=None, key=A, raw=None, headers=None):
        h = {'X-Owner-Key': key}
        if data is not None or raw is not None: h['Content-Type'] = 'application/json'
        if headers: h.update(headers)
        body = raw if raw is not None else (json.dumps(data).encode() if data is not None else None)
        request = urllib.request.Request(self.url + path, data=body, headers=h)
        try: response = urllib.request.urlopen(request)
        except urllib.error.HTTPError as e: response = e
        with response:
            content = response.read()
            return response.status, json.loads(content) if response.headers.get_content_type() == 'application/json' else content

    def test_create_and_share_without_leaking_owner(self):
        status, post = self.req(data=VALID)
        self.assertEqual(status, 201); self.assertTrue(post['isMine'])
        status, others = self.req(key=B)
        self.assertEqual(status, 200); self.assertEqual(others[0]['name'], '校园卡'); self.assertFalse(others[0]['isMine'])
        self.assertNotIn('owner', json.dumps(others).lower()); self.assertNotIn(A, json.dumps(others))

    def test_nonowner_forbidden_owner_can_close(self):
        _, p = self.req(data=VALID); path = '/api/posts/' + p['id'] + '/close'
        self.assertEqual(self.req(path, {}, key=B)[0], 403)
        self.assertEqual(self.req()[1][0]['status'], 'active')
        self.assertEqual(self.req(path, {})[1]['status'], 'closed')
        self.assertEqual(self.req(key=B)[1][0]['status'], 'closed')
        self.assertEqual(self.req(path, {})[0], 409)

    def test_data_survives_service_restart(self):
        _, p = self.req(data=VALID)
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.server = create_server('127.0.0.1', 0, self.db)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
        self.url = 'http://127.0.0.1:%s' % self.server.server_port
        self.assertEqual(self.req()[1][0]['id'], p['id'])

    def test_invalid_input_never_saved(self):
        for changes in [dict(name='　 '), dict(contact=''), dict(type='bad'), dict(category='bad'), dict(occurredAt='2099-01-01T00:00:00Z'), dict(occurredAt='2026-02-30T00:00:00Z'), dict(name=12)]:
            with self.subTest(changes=changes): self.assertEqual(self.req(data={**VALID, **changes})[0], 400)
        self.assertEqual(self.req()[1], [])

    def test_length_limits_match_unicode_characters(self):
        self.assertEqual(self.req(data={**VALID, 'name': '🌱' * 40})[0], 201)
        self.assertEqual(self.req(data={**VALID, 'name': '🌱' * 41})[0], 400)

    def test_invalid_timezone_offset_is_not_normalized(self):
        self.assertEqual(self.req(data={**VALID, 'occurredAt': '2026-01-01T12:00:00+00:99'})[0], 400)

    def test_unpaired_unicode_surrogate_returns_validation_error(self):
        self.assertEqual(self.req(data={**VALID, 'name': '\ud800'})[0], 400)

    def test_malformed_and_nonobject_json(self):
        for raw in [b'{', b'[]', b'null']:
            self.assertEqual(self.req(raw=raw)[0], 400)

    def test_missing_or_invalid_owner_key(self):
        for key in ['', 'short']:
            self.assertEqual(self.req(data=VALID, key=key)[0], 401)

    def test_oversized_body_rejected(self):
        self.assertEqual(self.req(raw=b'x' * 70000)[0], 413)

    def test_cross_origin_mutation_rejected(self):
        self.assertEqual(self.req(data=VALID, headers={'Origin': 'https://unrelated.example'})[0], 403)

    def test_missing_record(self):
        self.assertEqual(self.req('/api/posts/nonexistent/close', {})[0], 404)

    def test_private_files_not_served(self):
        for path in ['/server.py', '/data/campus.sqlite', '/.git/config', '/tests/test_server.py', '/assets/../server.py']:
            self.assertEqual(self.req(path)[0], 404)

if __name__ == '__main__': unittest.main()
