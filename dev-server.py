#!/usr/bin/env python3
"""Local development server that disables browser caching."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
import io
import json
import os


class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in ("index.html", "index.htm"):
                index_path = os.path.join(path, index)
                if os.path.isfile(index_path):
                    return self.send_file(index_path)

        generated_index = self.send_live_translator_index(path)
        if generated_index is not None:
            return generated_index

        return super().send_head()

    def send_live_translator_index(self, path):
        if os.path.exists(path) or os.path.basename(path) != "live-translator-files.json":
            return None

        payload_root = os.path.join(os.path.dirname(path), "live-translator")
        if not os.path.isdir(payload_root):
            return None

        files = []
        for directory, _, file_names in os.walk(payload_root):
            for file_name in file_names:
                full_path = os.path.join(directory, file_name)
                relative_path = os.path.relpath(full_path, payload_root)
                files.append(relative_path.replace(os.sep, "/"))

        response = json.dumps({"files": sorted(files)}, indent=2) + "\n"
        body = io.BytesIO(response.encode("utf-8"))

        self.send_response(200)
        self.send_header("Content-type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(body.getbuffer().nbytes))
        self.end_headers()
        return body

    def send_file(self, path):
        try:
            file_handle = open(path, "rb")
        except OSError:
            self.send_error(404, "File not found")
            return None

        file_stats = os.fstat(file_handle.fileno())
        self.send_response(200)
        self.send_header("Content-type", self.guess_type(path))
        self.send_header("Content-Length", str(file_stats.st_size))
        self.send_header("Last-Modified", self.date_time_string(file_stats.st_mtime))
        self.end_headers()
        return file_handle

    def end_headers(self):
        self.send_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        )
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(
        description="Serve this static site locally with caching disabled."
    )
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("port", nargs="?", type=int, default=4173)
    parser.add_argument("--directory", default=".")
    args = parser.parse_args()

    handler = partial(NoCacheHTTPRequestHandler, directory=args.directory)
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        port = server.server_address[1]
        print(f"Serving {args.directory} at http://{args.bind}:{port}/")
        print("Cache-Control: no-store")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
