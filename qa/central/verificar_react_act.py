#!/usr/bin/env python3
"""Falha se o log Jest React contém avisos act() (sem silenciar console.error)."""
from __future__ import annotations
import argparse
from pathlib import Path
import re

AVISO = re.compile(r"(?:not wrapped in act\(\.\.\.\)|not wrapped in act\(\))", re.IGNORECASE)


def avaliar(texto: str) -> int:
    # Os logs Jest podem conter a mensagem de ajuda do React além do aviso:
    # buscamos apenas a assinatura inequívoca do diagnóstico.
    return len(AVISO.findall(texto))


def main() -> int:
    parser = argparse.ArgumentParser(description="Reprova warnings React act() após Jest")
    parser.add_argument('arquivo', type=Path, help='Log da execução de 02-FRONTEND-JEST-TODOS')
    args = parser.parse_args()
    if not args.arquivo.is_file():
        parser.error(f'Log Jest não encontrado: {args.arquivo}')
    resultado = avaliar(args.arquivo.read_text(encoding='utf-8', errors='replace'))
    print(f'React act() warnings: {resultado}')
    if resultado:
        print('FALHA: corrigir sincronização dos testes; os avisos não são suprimidos.')
        return 1
    print('PASS: nenhuma atualização React fora de act() detectada.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
