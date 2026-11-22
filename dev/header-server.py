"""Loopback static preview. Browser tests replace Firebase with an isolated mock."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os,subprocess
ROOT=Path(__file__).resolve().parents[1];os.chdir(ROOT)
BASELINE=subprocess.check_output(['git','show','9b8351e:index.html'])
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path=='/baseline':
   self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(BASELINE)
  else:super().do_GET()
ThreadingHTTPServer(('127.0.0.1',8775),Handler).serve_forever()
