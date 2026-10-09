#!/usr/bin/env python3
"""Optional classroom sharing server. Python standard library only; localhost by default."""
import argparse
import hashlib
import hmac
import json
import mimetypes
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
CATEGORIES = ['校园卡', '钥匙', '数码', '生活用品', '书籍', '其他']
STATIC = {'/': 'index.html', '/index.html': 'index.html', **{'/assets/' + name: 'assets/' + name for name in ['core.js', 'store.js', 'app.js', 'styles.css', 'favicon.svg']}}
PUBLIC = ['id', 'type', 'name', 'category', 'place', 'occurredAt', 'contact', 'description', 'status', 'createdAt']

class InputError(ValueError):
    def __init__(self, fields):
        self.fields = fields
        super().__init__(next(iter(fields.values())))

def validate(data):
    if not isinstance(data, dict): raise InputError({'form': '信息格式不正确'})
    clean, errors = {}, {}
    for key, label, limit, required in [('name','物品名称',40,True),('place','地点',60,True),('contact','联系方式',100,True),('description','物品描述',500,False)]:
        value = data.get(key, '')
        if value is None: value = ''
        if not isinstance(value, str): errors[key] = label + '格式不正确'; continue
        value = value.strip(); clean[key] = value
        if any(0xD800 <= ord(ch) <= 0xDFFF for ch in value):
            errors[key] = label + '包含无效字符'; continue
        if required and not value: errors[key] = '请填写' + label
        elif len(value) > limit: errors[key] = '%s最多%d字' % (label, limit)
    clean['type'] = data.get('type'); clean['category'] = data.get('category')
    if clean['type'] not in ('lost', 'found'): errors['type'] = '请选择寻物或招领'
    if clean['category'] not in CATEGORIES: errors['category'] = '请选择物品类别'
    value = data.get('occurredAt')
    try:
        if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})', value): raise ValueError()
        if not value.endswith('Z') and (int(value[-5:-3]) > 23 or int(value[-2:]) > 59): raise ValueError()
        when = datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(timezone.utc)
        if when > datetime.now(timezone.utc): errors['occurredAt'] = '发生时间不能晚于当前时间'
        clean['occurredAt'] = when.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError): errors['occurredAt'] = '请选择有效的日期和时间'
    if errors: raise InputError(errors)
    return clean

class Repository:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS posts (
                id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
                category TEXT NOT NULL, place TEXT NOT NULL, occurredAt TEXT NOT NULL,
                contact TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL,
                createdAt TEXT NOT NULL, ownerHash TEXT NOT NULL)''')

    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def digest(key): return hashlib.sha256(key.encode()).hexdigest() if key else ''

    def public(self, row, key):
        return {**{k: row[k] for k in PUBLIC}, 'isMine': bool(key) and hmac.compare_digest(row['ownerHash'], self.digest(key)), 'isExample': False}

    def list(self, key):
        with self.connect() as db:
            return [self.public(row, key) for row in db.execute('SELECT * FROM posts ORDER BY createdAt DESC, id DESC')]

    def create(self, data, key):
        p = {**validate(data), 'id': uuid.uuid4().hex, 'status': 'active', 'createdAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'), 'ownerHash': self.digest(key)}
        keys = PUBLIC + ['ownerHash']
        with self.connect() as db:
            db.execute('INSERT INTO posts (%s) VALUES (%s)' % (','.join(keys), ','.join('?' for _ in keys)), [p[k] for k in keys])
        return self.public(p, key)

    def close(self, identifier, key):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM posts WHERE id=?', (identifier,)).fetchone()
            if row is None: return 404, {'error': '这条信息不存在'}
            if not hmac.compare_digest(row['ownerHash'], self.digest(key)): return 403, {'error': '只有发布者可以修改状态'}
            if row['status'] != 'active': return 409, {'error': '这条信息已经结束'}
            db.execute("UPDATE posts SET status='closed' WHERE id=?", (identifier,))
            return 200, self.public({**dict(row), 'status': 'closed'}, key)

def create_server(host='127.0.0.1', port=8000, db_path=None):
    repo = Repository(db_path or ROOT / 'data' / 'campus.sqlite')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            # Paths/status only; never log the management key or submitted content.
            return

        def send(self, status, data, mime='application/json; charset=utf-8'):
            payload = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', mime)
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Referrer-Policy', 'no-referrer')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'")
            self.end_headers(); self.wfile.write(payload)

        def do_GET(self):
            path = urlsplit(self.path).path
            try:
                if path == '/api/posts':
                    key = self.headers.get('X-Owner-Key', '')
                    return self.send(200, repo.list(key))
                if path in STATIC:
                    file = ROOT / STATIC[path]
                    if file.is_file():
                        mime = mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
                        return self.send(200, file.read_bytes(), mime + '; charset=utf-8')
                return self.send(404, {'error': '页面或接口不存在'})
            except sqlite3.Error: return self.send(500, {'error': '读取数据库失败，请稍后重试'})

        def do_POST(self):
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + self.headers.get('Host', ''):
                return self.send(403, {'error': '不允许来自其他站点的修改'})
            key = self.headers.get('X-Owner-Key', '')
            if not re.fullmatch(r'[0-9a-f]{64}', key): return self.send(401, {'error': '浏览器管理凭证无效，请刷新后重试'})
            try: size = int(self.headers.get('Content-Length', '0'))
            except ValueError: return self.send(400, {'error': '请求长度不正确'})
            if size < 0 or size > 65536: return self.send(413, {'error': '提交内容过大'})
            if self.headers.get_content_type() != 'application/json': return self.send(415, {'error': '请使用JSON提交'})
            try:
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict): raise ValueError()
            except (ValueError, UnicodeDecodeError): return self.send(400, {'error': '提交内容格式不正确'})
            path = urlsplit(self.path).path
            try:
                if path == '/api/posts': return self.send(201, repo.create(data, key))
                match = re.fullmatch(r'/api/posts/([a-zA-Z0-9-]+)/close', path)
                if match:
                    status, result = repo.close(match[1], key)
                    return self.send(status, result)
                return self.send(404, {'error': '接口不存在'})
            except InputError as e: return self.send(400, {'error': str(e), 'fields': e.fields})
            except sqlite3.Error: return self.send(500, {'error': '保存失败，请稍后重试；尚未确认保存成功'})

    return ThreadingHTTPServer((host, port), Handler)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8000)
    parser.add_argument('--host', default='127.0.0.1', help='默认仅本机访问；课堂局域网可显式指定0.0.0.0')
    parser.add_argument('--db', default=str(ROOT / 'data' / 'campus.sqlite'))
    args = parser.parse_args()
    server = create_server(args.host, args.port, args.db)
    print('校园失物招领已启动：http://%s:%s（Ctrl+C停止）' % (args.host, server.server_port), flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()
