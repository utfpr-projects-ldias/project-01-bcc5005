#!/usr/bin/env python3
"""Pré-voo HU07-06: somente leitura; não faz login, não grava nem reinicia serviços.

O teste real continua em validar_fluxo_real.py com login humano explícito.
"""
from __future__ import annotations

import argparse
import importlib.util
from pathlib import Path
import re
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def consultar(url: str, codigos: set[int]) -> tuple[bool, str]:
    try:
        with urlopen(Request(url, headers={'Accept': 'text/html,application/json'}), timeout=10) as resposta:
            status = resposta.status
    except HTTPError as exc:
        status = exc.code
    except (URLError, TimeoutError, OSError) as exc:
        return False, f'sem resposta: {exc}'
    return status in codigos, f'HTTP {status}'


def checar_migrations(saida: str) -> tuple[bool, str]:
    """Exige HU07-01 aplicada e ausência de migrations pendentes."""
    linhas = saida.splitlines()
    alvo = [linha for linha in linhas if 'CriarEntregaveisEvidenciasEsperadas1793700000000' in linha]
    if not alvo or not re.search(r'\[X\]', alvo[-1]):
        return False, 'HU07-01 não aparece como migration aplicada [X]'
    pendentes = [l.strip() for l in linhas if re.match(r'^\s*\[\s\]\s', l)]
    if pendentes:
        return False, f'migration pendente: {pendentes[0]}'
    return True, 'HU07-01 aplicada e nenhuma migration pendente'


def verifica_browser() -> tuple[bool, str]:
    if importlib.util.find_spec('playwright') is None:
        return False, 'Playwright Python ausente; instalar via bash qa/hu07-06/INSTALAR-LOCAL.sh'
    try:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            path = Path(pw.chromium.executable_path)
            return path.exists(), f'Chromium: {path}' + ('' if path.exists() else ' (não instalado)')
    except Exception as exc:
        return False, f'Playwright/Chromium indisponível: {exc}'


def main() -> int:
    p = argparse.ArgumentParser(description='HU07-06: verificar serviços/migrations/Chromium sem escrever')
    p.add_argument('--frontend-url', default='http://localhost:3000')
    p.add_argument('--api-url', default='http://localhost:3001')
    p.add_argument('--raiz', type=Path, default=Path(__file__).resolve().parents[2])
    args = p.parse_args()
    falhas = []
    for nome, url, status in (
        ('Next login', args.frontend_url.rstrip('/') + '/login', {200}),
        ('Nest sessão anônima', args.api_url.rstrip('/') + '/usuarios/me', {401, 403}),
    ):
        ok, detalhe = consultar(url, status)
        print('[%s] %s: %s' % ('OK' if ok else 'FALHA', nome, detalhe))
        if not ok:
            falhas.append(nome)
    try:
        retorno = subprocess.run(['docker', 'compose', 'exec', '-T', 'backend', 'npm', 'run', 'migration:show'],
                                cwd=args.raiz, capture_output=True, text=True, timeout=60, check=False)
        ok, detalhe = checar_migrations(retorno.stdout) if retorno.returncode == 0 else (False, retorno.stderr.strip()[-300:])
    except (OSError, subprocess.TimeoutExpired) as exc:
        ok, detalhe = False, str(exc)
    print('[%s] Migrations: %s' % ('OK' if ok else 'FALHA', detalhe))
    if not ok:
        falhas.append('migrations')
    ok, detalhe = verifica_browser()
    print('[%s] Chromium: %s' % ('OK' if ok else 'FALHA', detalhe))
    if not ok:
        falhas.append('chromium')
    if falhas:
        print('NÃO INICIAR QA REAL: corrigir primeiro: ' + ', '.join(falhas))
        return 1
    print('PRÉ-VOO APROVADO: ambiente pronto para login real e teste em contrato exclusivo QA.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
