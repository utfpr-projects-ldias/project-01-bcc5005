#!/usr/bin/env python3
"""QA isolado: derruba SOMENTE uma conexão de teste e verifica rollback.

Nunca derruba o servidor, nunca atua no banco DEV nem interrompe sessões de outros
usuários. Cria e usa somente um banco exclusivo recém-criado pelo testes-all.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import subprocess

RAIZ = Path(__file__).resolve().parents[2]
PADRAO = re.compile(r'^pi_\d{10}_falha_conexao$')

# JS usa a URL DATABASE_URL do container só para construir a URL do DB ISOLADO.
# Não imprime usuário, senha nem a URL; verifica o nome antes de conectar.
JS = r'''
const {Client} = require('pg');
(async () => {
  const nome=process.env.QA_DB_NAME;
  if (!/^pi_\d{10}_falha_conexao$/.test(nome || '')) throw Error('Nome de banco QA não autorizado');
  const base=process.env.DATABASE_URL;
  if (!base) throw Error('DATABASE_URL ausente');
  const url=new URL(base);
  if (!['postgresql:', 'postgres:'].includes(url.protocol)) throw Error('Protocolo inválido');
  const dbOriginal=decodeURIComponent(url.pathname.slice(1));
  if (dbOriginal === nome) throw Error('Banco QA igual ao banco configurado em DEV');
  url.pathname='/'+nome;
  const config={connectionString:url.toString(), connectionTimeoutMillis:8000};
  const vitima=new Client(config);
  const controlador=new Client(config);
  vitima.on('error',()=>{});controlador.on('error',()=>{});
  let terminacaoConfirmada=false;
  try {
    await vitima.connect();await controlador.connect();
    const pid=(await vitima.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const pidControle=(await controlador.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    if (pid===pidControle) throw Error('Conexões não são distintas');
    await vitima.query('BEGIN');
    await vitima.query('CREATE TABLE qa_r36_transacao_abortada (id int PRIMARY KEY)');
    await vitima.query('INSERT INTO qa_r36_transacao_abortada VALUES (1)');
    const r=await controlador.query('SELECT pg_terminate_backend($1::int) AS encerrada',[pid]);
    if (r.rows[0].encerrada !== true) throw Error('pg_terminate_backend não encerrou conexão de teste');
    terminacaoConfirmada=true;
    try { await vitima.query('COMMIT'); throw Error('COMMIT na conexão terminada foi aceito'); }
    catch(e) { if (e.message==='COMMIT na conexão terminada foi aceito') throw e; }
  } finally {
    await vitima.end().catch(()=>{});await controlador.end().catch(()=>{});
  }
  const reconexao=new Client(config);await reconexao.connect();
  try {
    const r=await reconexao.query(`SELECT to_regclass('public.qa_r36_transacao_abortada') IS NULL AS rollback, 1 AS ok`);
    const resposta={bancoIsolado:true, conexaoTerminada:terminacaoConfirmada,
      rollback:r.rows[0].rollback===true, reconexao:r.rows[0].ok===1};
    if (!Object.values(resposta).every(Boolean)) throw Error('Rollback ou reconexão inconsistente');
    console.log(JSON.stringify(resposta));
  } finally {await reconexao.end();}
})().catch(e=>{console.error('QA falha de conexão:',e.message);process.exitCode=1;});
'''


def executar(banco: str) -> dict:
    if not PADRAO.fullmatch(banco):
        raise ValueError('Banco não isolado: recusa executar teste de conexão')
    comando=['docker','compose','exec','-T','-e',f'QA_DB_NAME={banco}','backend','node','-e',JS]
    resultado=subprocess.run(comando,cwd=RAIZ,text=True,capture_output=True,check=False,timeout=45)
    if resultado.returncode:
        raise RuntimeError(f'Teste de desconexão falhou (rc={resultado.returncode}): {resultado.stderr[-400:]}')
    dados=json.loads(resultado.stdout.strip())
    if not all(dados.get(c) is True for c in ('bancoIsolado','conexaoTerminada','rollback','reconexao')):
        raise AssertionError('Falha de conexão/rollback sem prova completa')
    return dados


def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument('--banco',required=True,help='Banco QA exclusivo pi_<timestamp>_falha_conexao')
    args=parser.parse_args()
    print(json.dumps(executar(args.banco),ensure_ascii=False))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
