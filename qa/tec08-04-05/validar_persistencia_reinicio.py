#!/usr/bin/env python3
"""TEC08-04/05: confere documento real antes/depois de reinício NÃO destrutivo.

Não cadastra, edita nem remove contratos/documentos/volumes. Em --executar,
reinicia APENAS backend e frontend do Compose DEV explicitamente autorizado.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request

RAIZ = Path(__file__).resolve().parents[2]
BRANCHES = {'tec-08--04-05', 'tec-08-04-05'}
UUID = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')

# Executado EXCLUSIVAMENTE no container backend. A saída não expõe storage_key,
# credenciais, conteúdo, nome original ou caminhos do volume.
SNAPSHOT_JS = r'''
import pg from 'pg';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
const solicitado = process.argv[1];
const client = new pg.Client({connectionString: process.env.DATABASE_URL});
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const colunas = `id, contrato_id, categoria, nome_original, tipo_mime,
                   tamanho, sha256, storage_key, arquivado_em, criado_em`;
  const consulta = solicitado === 'AUTO'
    ? await client.query(`SELECT ${colunas} FROM documentos_contratuais
                         WHERE arquivado_em IS NULL ORDER BY criado_em DESC, id DESC LIMIT 1`)
    : await client.query(`SELECT ${colunas} FROM documentos_contratuais WHERE id=$1::uuid`, [solicitado]);
  if (consulta.rows.length !== 1) throw new Error('Nenhum documento contratual encontrado: execute primeiro o QA real em DEV');
  const d = consulta.rows[0];
  if (!/^[0-9a-f]{32}$/.test(d.storage_key)) throw new Error('Chave privada invalida');
  const raiz = process.env.ARQUIVOS_DIRETORIO;
  if (!raiz || !path.isAbsolute(raiz) || raiz === '/') throw new Error('Diretorio privado invalido');
  const arquivo = path.join(raiz, d.storage_key.slice(0, 2), d.storage_key + '.bin');
  const handle = await open(arquivo, constants.O_RDONLY | constants.O_NOFOLLOW);
  let bytes;
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error('Documento nao corresponde a arquivo regular');
    bytes = await handle.readFile();
  } finally { await handle.close(); }
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== d.sha256 || bytes.length !== d.tamanho) throw new Error('Arquivo difere do hash/tamanho do PostgreSQL');
  await client.query('COMMIT');
  process.stdout.write(JSON.stringify({
    id:d.id, contratoId:d.contrato_id, categoria:d.categoria,
    mime:d.tipo_mime, tamanho:d.tamanho, sha256:d.sha256,
    arquivadoEm:d.arquivado_em, criadoEm:d.criado_em
  }));
} catch (e) {
  try { await client.query('ROLLBACK'); } catch {}
  process.stderr.write('FALHA NA INTEGRIDADE/PERSISTENCIA: ' + e.message + '\n');
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
'''


def executar(comando, *, timeout=90, capturar=True):
    resultado = subprocess.run(
        comando, cwd=RAIZ, text=True, capture_output=capturar,
        timeout=timeout, check=False,
    )
    if resultado.returncode:
        detalhe = (resultado.stderr or resultado.stdout or '').strip()
        raise RuntimeError(f'Comando falhou: {comando[0]} {comando[1]} ({resultado.returncode}). {detalhe[:500]}')
    return resultado.stdout.strip() if capturar else ''


def confirmar_contexto():
    if RAIZ.name != 'project-01-bcc5005':
        raise RuntimeError('Execução bloqueada fora do projeto esperado')
    git_raiz = Path(executar(['git', 'rev-parse', '--show-toplevel'])).resolve()
    if git_raiz != RAIZ:
        raise RuntimeError('Execução bloqueada fora da raiz do Git')
    branch = executar(['git', 'branch', '--show-current'])
    if branch not in BRANCHES:
        raise RuntimeError(f'Branch não autorizada: {branch}')
    if os.environ.get('DOCKER_HOST', '') not in ('', 'unix:///var/run/docker.sock'):
        raise RuntimeError('DOCKER_HOST remoto/não padrão: não executar sobre ambientes externos')
    if not (RAIZ / '.env').is_file():
        raise RuntimeError('Arquivo .env DEV não encontrado')
    executar(['docker', 'compose', 'config', '-q'])
    projeto = json.loads(executar(['docker', 'compose', 'config', '--format', 'json'])).get('name')
    if projeto != 'project-01-bcc5005':
        raise RuntimeError(f'Projeto Compose inesperado: {projeto!r}')
    ativos = executar(['docker', 'compose', 'ps', '--status', 'running', '--services']).splitlines()
    if not {'backend', 'frontend'}.issubset(set(ativos)):
        raise RuntimeError('Backend/frontend DEV não estão em execução; inicie o Compose sem apagar os volumes')


def obter_snapshot(identificador=None):
    if identificador is not None and not UUID.fullmatch(identificador):
        raise ValueError('Identificador de documento inválido (UUID)')
    texto = executar([
        'docker', 'compose', 'exec', '-T', 'backend', 'node',
        '--input-type=module', '-e', SNAPSHOT_JS, identificador or 'AUTO',
    ], timeout=90)
    try:
        registro = json.loads(texto)
    except json.JSONDecodeError as e:
        raise RuntimeError('Snapshot não retornou JSON válido') from e
    if not isinstance(registro, dict) or not UUID.fullmatch(str(registro.get('id', ''))):
        raise RuntimeError('Documento não identificado pelo snapshot')
    if not re.fullmatch(r'[0-9a-f]{64}', str(registro.get('sha256', ''))):
        raise RuntimeError('SHA-256 inválido no snapshot')
    if not isinstance(registro.get('tamanho'), int) or registro['tamanho'] <= 0:
        raise RuntimeError('Tamanho inválido no snapshot')
    return registro


def comparar_snapshots(antes, depois):
    if antes != depois:
        campos = [k for k in antes if antes.get(k) != depois.get(k)]
        raise RuntimeError('Metadados documentais mudaram após o reinício: ' + ', '.join(campos))


def pronto(url):
    try:
        with urllib.request.urlopen(url, timeout=2) as resposta:
            return resposta.status < 500
    except urllib.error.HTTPError as erro:
        return erro.code < 500
    except (OSError, ValueError):
        return False


def aguardar_servicos():
    for url in ('http://127.0.0.1:3001/', 'http://127.0.0.1:3000/login'):
        for _ in range(45):
            if pronto(url):
                break
            time.sleep(2)
        else:
            raise RuntimeError(f'Serviço DEV não respondeu após o reinício: {url}')


def configurar_args(argv=None):
    parser = argparse.ArgumentParser(description='Verificação TEC08-04/05 de persistência após reinício DEV')
    modo = parser.add_mutually_exclusive_group(required=True)
    modo.add_argument('--verificar', action='store_true', help='Só consulta banco e hash do storage (sem reinício)')
    modo.add_argument('--executar', action='store_true', help='Reinicia backend/frontend sem apagar volumes')
    parser.add_argument('--confirmar-reinicio', action='store_true', help='Consentimento explícito para reinício DEV')
    parser.add_argument('--documento', help='UUID de documento a conferir (padrão: último ativo)')
    args = parser.parse_args(argv)
    if args.executar and not args.confirmar_reinicio:
        parser.error('--executar exige --confirmar-reinicio')
    if args.documento and not UUID.fullmatch(args.documento):
        parser.error('--documento exige UUID válido')
    return args


def main(argv=None):
    args = configurar_args(argv)
    try:
        confirmar_contexto()
        antes = obter_snapshot(args.documento)
        print(f'ANTES: documento={antes["id"]}, bytes={antes["tamanho"]}, hash={antes["sha256"]}')
        if args.verificar:
            print('APROVADO: metadados e conteúdo físico conferem. Nenhum serviço reiniciado.')
            return 0
        print('Reiniciando apenas backend e frontend DEV (sem down, sem -v)...', flush=True)
        executar(['docker', 'compose', 'restart', 'backend', 'frontend'], timeout=120)
        aguardar_servicos()
        depois = obter_snapshot(antes['id'])
        comparar_snapshots(antes, depois)
        print('APROVADO: documento, hash SHA-256, arquivo privado e metadados persistiram após o reinício.')
        print('Volumes e registros de banco não foram removidos.')
        return 0
    except (RuntimeError, ValueError, subprocess.TimeoutExpired, OSError) as e:
        print(f'REPROVADO: {e}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
