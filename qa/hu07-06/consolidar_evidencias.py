#!/usr/bin/env python3
"""Aceite estrito HU07-06: valida evidências reais de todos os cinco perfis.

Não executa browser nem afirma que algo foi testado sem prova JSON correspondente.
"""
import argparse
from collections import Counter
import json
from pathlib import Path
import sys

PERFIS = {'administrador', 'gestor-edicao', 'gestor-leitura', 'colaborador', 'sem-vinculo'}
TIPOS = {'UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO'}


def validar(relatorios: list[dict]) -> list[str]:
    erros = []
    vistos = Counter(r.get('perfilSolicitado') for r in relatorios)
    for perfil in sorted(PERFIS):
        if vistos[perfil] == 0:
            erros.append(f'FALTA sessão real para perfil {perfil}')
        if vistos[perfil] > 1:
            erros.append(f'PERFIL repetido: {perfil}; use exatamente um relatório por papel')
    contratos = {r.get('contratoId') for r in relatorios}
    if len(contratos) != 1 or not next(iter(contratos), None):
        erros.append('Os relatórios devem testar o mesmo contrato real')
    for r in relatorios:
        perfil = r.get('perfilSolicitado')
        if perfil not in PERFIS:
            erros.append('Perfil desconhecido no relatório')
            continue
        if r.get('hu') != 'HU07-06' or r.get('tipoTeste') != 'NAVEGADOR_REAL_SEM_MOCK':
            erros.append(f'{perfil}: relatório não identifica integração real')
        if r.get('status') != 'APROVADO':
            erros.append(f'{perfil}: execução não aprovada')
        provas = r.get('provas') or []
        if not isinstance(provas, list) or not any('SuperTokens' in str(p) for p in provas):
            erros.append(f'{perfil}: prova de sessão real ausente')
        if not any('Logout' in str(p) for p in provas):
            erros.append(f'{perfil}: prova de logout HTTP 401 ausente')
        if perfil in {'administrador', 'gestor-edicao'}:
            if r.get('escrita') is not True:
                erros.append(f'{perfil}: exige escrita real pelo formulário')
            criados = r.get('entregaveisCriados') or []
            if {x.get('tipo') for x in criados} != TIPOS or len(criados) != 5:
                erros.append(f'{perfil}: não há cinco tipos reais distintos')
            if not r.get('etapaCriada'):
                erros.append(f'{perfil}: etapa real HU06 não demonstrada')
            for trecho in ('Cinco POST', 'Cinco PATCH', 'PostgreSQL', 'Network Chromium'):
                if not any(trecho in str(p) for p in provas):
                    erros.append(f'{perfil}: falta evidência {trecho}')
        elif perfil == 'sem-vinculo':
            if not any('Sem vínculo' in str(p) for p in provas):
                erros.append('sem-vinculo: falta prova de leitura negada')
        elif not any('POST/PATCH HTTP 403' in str(p) for p in provas):
            erros.append(f'{perfil}: falta prova de POST e PATCH negados')
    return erros


def main() -> int:
    p = argparse.ArgumentParser(description='Consolida cinco execuções reais da HU07-06')
    p.add_argument('relatorios', nargs='+', type=Path, help='Cinco JSONs gerados pelo navegador (um por perfil)')
    a = p.parse_args()
    relatorios = []
    try:
        for path in a.relatorios:
            dados = json.loads(path.read_text(encoding='utf-8'))
            if not isinstance(dados, dict):
                raise ValueError(f'{path}: não é objeto JSON')
            relatorios.append(dados)
    except (ValueError, OSError) as exc:
        print('[HU07-06] NÃO APROVADO:', exc, file=sys.stderr)
        return 2
    erros = validar(relatorios)
    if erros:
        print('[HU07-06] INTEGRAÇÃO NÃO CONCLUÍDA:')
        for erro in erros:
            print('  -', erro)
        return 1
    print('[HU07-06] INTEGRAÇÃO REAL APROVADA: cinco perfis, POST/PATCH, API, SQL, HU09/TEC09, logout.')
    print('[HU07-06] Nenhuma evidência foi gerada artificialmente pelo consolidador.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
