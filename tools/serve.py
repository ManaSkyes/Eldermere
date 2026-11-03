# tools/serve.py — a local web server for Eldermere that tells the browser never to keep old copies of the
# game's files, so a normal refresh always loads the latest code (the plain `python -m http.server` lets the
# browser cache scripts, and an updated file can be ignored until the cache runs out).
#   python tools/serve.py [port]      (start-eldermere.bat runs this)
import http.server, sys, os

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        # Loading a page also wipes any copies the browser kept from before (from the old server, which let it
        # cache), so the scripts after it are fetched fresh
        if self.path.split('?')[0].endswith(('.html', '/')): self.send_header('Clear-Site-Data', '"cache"')
        super().end_headers()

os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
print(f'Eldermere on http://localhost:{port}/  (keep this window open; close it to stop)')
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
