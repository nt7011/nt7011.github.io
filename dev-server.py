#!/usr/bin/env python3
"""Local development server that disables browser caching."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse


class NoCacheHTTPRequestHandler(SimpleHTTPRequestHandler):
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
        print(f"Serving {args.directory} at http://{args.bind}:{args.port}/")
        print("Cache-Control: no-store")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
