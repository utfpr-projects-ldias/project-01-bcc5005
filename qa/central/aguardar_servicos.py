#!/usr/bin/env python3
"""Prontidão HTTP; não confunde container Running com API/Next disponível."""
import time
from urllib.request import urlopen
from urllib.error import URLError


def aguardar(url, timeout=120):
    limite = time.monotonic() + timeout
    ultimo = None
    while time.monotonic() < limite:
        try:
            with urlopen(url, timeout=5) as resposta:
                if 200 <= resposta.status < 400:
                    print(f'HTTP {resposta.status}: {url}', flush=True)
                    return
        except (URLError, OSError, TimeoutError) as exc:
            ultimo = exc
        time.sleep(2)
    raise RuntimeError(f'Serviço indisponível: {url}: {ultimo}')


if __name__ == '__main__':
    aguardar('http://localhost:3001/')
    aguardar('http://localhost:3000/')
