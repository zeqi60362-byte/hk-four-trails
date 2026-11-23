# -*- coding: utf-8 -*-
"""本地静态服务器 + 全景图路由。

    python serve.py            # http://localhost:8000/
    /pano/05111_W.jpg          -> G:\000_Hiking SVI存放\1_All Panos\images\images\05111_W.jpg

只依赖标准库；不需要 pandas / torch。
"""
import http.server
import os
import sys
import urllib.parse
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
PANO_DIR = r"G:\000_Hiking SVI存放\1_All Panos\images\images"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path.startswith("/pano/"):
            name = os.path.basename(path)
            local = os.path.join(ROOT, "pano", name)
            fp = local if os.path.isfile(local) else os.path.join(PANO_DIR, name)
            if os.path.isfile(fp):
                with open(fp, "rb") as fh:
                    data = fh.read()
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=604800")
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_error(404, "panorama not found")
            return
        return super().do_GET()

    def log_message(self, fmt, *args):
        if "/pano/" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


def main():
    if not os.path.isdir(PANO_DIR):
        print("warning: panorama folder not found:", PANO_DIR)
    url = f"http://localhost:{PORT}/"
    print("serving", ROOT)
    print("open   ", url)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
