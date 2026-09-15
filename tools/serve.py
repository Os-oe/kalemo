#!/usr/bin/env python3
"""Statischer Dev-Server für Kalemo (korrekte MIME-Typen für .mjs/.wasm/.task, kein Cache).
Aufruf: python3 tools/serve.py [port]   (Root = Repo-Wurzel)"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
import json, re
try:
    VERCEL_HEADERS = json.load(open(os.path.join(ROOT, 'vercel.json'))).get('headers', []) if os.environ.get('KALEMO_NO_CSP') != '1' else []
except Exception:
    VERCEL_HEADERS = []

class H(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
        '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.tflite': 'application/octet-stream',
        '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
        '.bin': 'application/octet-stream', '.txt': 'text/plain; charset=utf-8', '.html': 'text/html; charset=utf-8',
    }
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        # Sicherheits-Header wie auf Vercel (vercel.json), damit CSP-Probleme lokal auffallen
        path = self.path.split('?')[0]
        for rule in VERCEL_HEADERS:
            if re.fullmatch(rule['source'].replace('(.*)', '.*'), path):
                for h in rule['headers']:
                    if h['key'] not in ('Cache-Control', 'Content-Type'):
                        self.send_header(h['key'], h['value'])
        super().end_headers()
    def log_message(self, *a):
        pass

class T(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    with T(('127.0.0.1', PORT), H) as s:
        print(f'serving {ROOT} on http://127.0.0.1:{PORT}', flush=True)
        s.serve_forever()
