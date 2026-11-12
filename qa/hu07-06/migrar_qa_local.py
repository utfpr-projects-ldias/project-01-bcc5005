#!/usr/bin/env python3
"""Copia credenciais e relatórios legados para .local/ ignorado. NÃO apaga nada."""
from __future__ import annotations
import filecmp
from pathlib import Path
import shutil
import os

BASE = Path(__file__).resolve().parent / '.local'
LEGADO = Path.home() / '.local' / 'share' / 'hu07-06' / 'relatorios'
CRED_ANT = Path.home() / '.config' / 'hu07-06' / 'credenciais.json'


def copiar_seguro(origem: Path, destino: Path, privado: bool = False) -> str:
    if origem.is_symlink() or not origem.is_file():
        return 'ignorado: origem inexistente ou não regular'
    if privado and (origem.stat().st_uid != os.getuid() or origem.stat().st_mode & 0o077):
        raise ValueError('Credenciais antigas não são 0600 do seu usuário: verifique manualmente')
    destino.parent.mkdir(parents=True, exist_ok=True)
    if destino.is_symlink():
        raise ValueError('Destino simbólico não permitido')
    if destino.exists():
        if not destino.is_file() or not filecmp.cmp(origem, destino, shallow=False):
            raise ValueError('Arquivo existente diferente; não sobrescrever: ' + str(destino))
        return 'já idêntico'
    shutil.copyfile(origem, destino)
    os.chmod(destino, 0o600 if privado else 0o644)
    return 'copiado'


def migrar() -> int:
    BASE.mkdir(parents=True, exist_ok=True)
    os.chmod(BASE, 0o700)
    print('Credenciais:', copiar_seguro(CRED_ANT, BASE / 'credenciais.json', True))
    if LEGADO.is_dir() and not LEGADO.is_symlink():
        for arquivo in sorted(LEGADO.rglob('*.json')):
            if arquivo.is_symlink():
                continue
            relativo = arquivo.relative_to(LEGADO)
            destino = BASE / 'relatorios' / relativo
            print('Relatório:', relativo, copiar_seguro(arquivo, destino))
    print('Migração conferida. Origens legadas NÃO foram apagadas.')
    return 0

if __name__ == '__main__':
    raise SystemExit(migrar())
