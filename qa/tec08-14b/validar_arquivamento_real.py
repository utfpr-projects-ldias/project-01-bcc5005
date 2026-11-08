#!/usr/bin/env python3
"""QA real do arquivamento lógico. Reaproveita sessões e endpoints da TEC08-02.

Somente contratos sintéticos. Não remove contratos, documentos ou eventos.
Nenhuma credencial, cookie ou token é exportado.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'qa' / 'tec08-02'))
from validar_integracao_real import (preflight, nova_sessao, criar_contrato, api,
    grant, revogar, exigir, aceitar, uuid_ok)


def confirmar_migration():
    cmd = subprocess.run(['docker', 'compose', 'exec', '-T', 'backend', 'npm', 'run', 'migration:show'],
        cwd=ROOT, capture_output=True, text=True, timeout=90, check=False)
    exigir(cmd.returncode == 0, 'Não foi possível consultar as migrations da API')
    exigir('[X] 12 ArquivamentoLogicoContratos1794000000000' in cmd.stdout,
           'Migration 12 de arquivamento não está aplicada; backup e migration são pré-requisitos')
    exigir('[ ]' not in cmd.stdout, 'Há migrations pendentes')


def eventos(id_contrato: str) -> tuple[int,int]:
    exigir(uuid_ok(id_contrato), 'Contrato sintético inválido para consulta SQL')
    sql = ("SELECT "
        "count(*) FILTER (WHERE acao = 'CONTRATO_ARQUIVADO'), "
        "count(*) FILTER (WHERE acao = 'CONTRATO_REATIVADO') "
        "FROM eventos_auditoria WHERE entidade_tipo='CONTRATO' "
        f"AND entidade_id='{id_contrato}';")
    c = subprocess.run(['docker', 'compose', 'exec', '-T', 'database', 'sh', '-c',
        'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F , -v ON_ERROR_STOP=1'],
        input=sql+'\n', cwd=ROOT, capture_output=True, text=True, timeout=30, check=False)
    exigir(c.returncode == 0, 'Falha na conferência SQL da auditoria')
    try:
        a,b=[int(x.strip()) for x in c.stdout.strip().split(',')]
    except Exception as exc:
        raise AssertionError('Auditoria retornou formato SQL inesperado') from exc
    return a,b


def executar(contas, visivel: bool):
    from playwright.sync_api import sync_playwright
    nome = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(3)
    pasta = ROOT/'qa'/'tec08-14b'/'.local'/'execucoes'/nome
    pasta.mkdir(parents=True, exist_ok=False, mode=0o700)
    os.chmod(pasta,0o700)
    r = {'suite':'TEC08-v14B', 'execucao':nome, 'status':'REPROVADO',
         'contratoQA':None, 'provas':[], 'restauracaoVinculos':[], 'segredosNoRelatorio':False}
    erro = None; pendentes=[]; admin = None
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=not visivel)
        ctx_admin=None
        try:
            ctx_admin,admin,_=nova_sessao(browser, 'administrador', contas)
            r['provas'].append('Sessão ADMIN real Next/SuperTokens')
            contrato=criar_contrato(admin,'ARQUIVAMENTO-'+nome)
            r['contratoQA']=contrato
            r['provas'].append('Contrato sintético próprio, sem ID informado manualmente')
            pessoa=api(admin,'/admin/usuarios/consulta?ativo=true&pagina=1&limite=20&busca='+contas['gestor-edicao'][0])
            aceitar(pessoa['status'],{200},'Consulta de gestor QA')
            candidatos=[x for x in pessoa['body']['itens'] if x.get('email','').casefold()==contas['gestor-edicao'][0].casefold()]
            exigir(len(candidatos)==1 and uuid_ok(candidatos[0].get('id')),'Gestor QA não encontrado')
            gestor_id=candidatos[0]['id']
            # Só vincular o contrato recém-criado; compensação em finally.
            pendentes.append((gestor_id, contrato))
            grant(admin,gestor_id,contrato,True)
            ctx_g,gestor,_=nova_sessao(browser,'gestor-edicao',contas)
            try:
                antes=api(gestor,'/contratos')
                aceitar(antes['status'],{200},'Lista GESTOR antes de arquivar')
                exigir(any(c['id']==contrato for c in antes['body']),'Vínculo ativo não aparece na carteira')
                r['provas'].append('GESTOR vinculado enxerga contrato ativo antes de arquivar')
                aceitar(api(gestor,f'/contratos/{contrato}/arquivar','PATCH')['status'],{403,404},'GESTOR não pode arquivar')
                r['provas'].append('Arquivo: operação exclusiva ADMIN, GESTOR negado')
                arq=api(admin,f'/contratos/{contrato}/arquivar','PATCH')
                aceitar(arq['status'],{200},'ADMIN arquivar contrato')
                exigir(arq['body'].get('arquivadoEm') and arq['body'].get('status')=='PLANEJAMENTO',
                       'Arquivamento não persistiu corretamente ou alterou status')
                r['provas'].append('ADMIN arquiva logicamente sem alterar status operacional')
                aceitar(api(admin,f'/contratos/{contrato}')['status'],{200},'ADMIN leitura histórica')
                lista=api(gestor,'/contratos')
                aceitar(lista['status'],{200},'Lista gestor pós-arquivo')
                exigir(not any(c['id']==contrato for c in lista['body']),'Arquivo vazou na listagem de GESTOR')
                r['provas'].append('Contrato arquivado ausente da carteira do GESTOR; ADMIN mantém consulta histórica')
                aceitar(api(admin,f'/contratos/{contrato}','PATCH',{'objeto':'PROIBIDO-ARQUIVADO'})['status'],{403,404,409},
                       'ADMIN não pode editar contrato arquivado')
                aceitar(api(gestor,f'/contratos/{contrato}','PATCH',{'objeto':'PROIBIDO-ARQUIVADO'})['status'],{403,404,409},
                       'GESTOR não pode editar contrato arquivado')
                # Checagem direta do guard de etapa (nenhum body necessário: deve negar no guard).
                aceitar(api(admin,f'/contratos/{contrato}/etapas','POST',{})['status'],{403,404,409},
                       'ADMIN não deve criar etapa no arquivo')
                r['provas'].append('Arquivo bloqueia edição do contrato e criação de etapa, inclusive ADMIN')
                aceitar(api(admin,f'/contratos/{contrato}/arquivar','PATCH')['status'],{409},'Arquivamento repetido deve gerar conflito')
                r['provas'].append('Operação repetida gera conflito')
                ret=api(admin,f'/contratos/{contrato}/reativar','PATCH', {'motivo':'Reativação administrativa autorizada durante auditoria sintética QA.'})
                aceitar(ret['status'],{200},'ADMIN reativar contrato')
                exigir(ret['body'].get('arquivadoEm') is None and ret['body'].get('status')=='PLANEJAMENTO',
                       'Reativação não zerou o arquivo ou alterou o status')
                lista=api(gestor,'/contratos')
                aceitar(lista['status'],{200},'Lista gestor após reativação')
                exigir(any(c['id']==contrato for c in lista['body']), 'Contrato reativado não retornou à carteira de GESTOR')
                r['provas'].append('ADMIN reativa e contrato volta à carteira vinculada')
                exigir(eventos(contrato)==(1,1),'Eventos do arquivamento/reativação não persistidos corretamente')
                r['provas'].append('PostgreSQL confirma eventos de auditoria CONTRATO_ARQUIVADO e CONTRATO_REATIVADO')
                r['status']='APROVADO'
            finally:
                ctx_g.close()
        except Exception as e:
            erro=f'{type(e).__name__}: {str(e)[:300]}'
            r['erro']=erro
        finally:
            if admin is not None:
                for pessoa,contrato in reversed(pendentes):
                    try:
                        revogar(admin,pessoa,contrato)
                        r['restauracaoVinculos'].append('OK: vínculo QA revogado')
                    except Exception:
                        r['status']='REPROVADO'
                        r['restauracaoVinculos'].append('ATENÇÃO: verificar vínculo temporário neste contrato QA')
            if ctx_admin:ctx_admin.close()
            browser.close()
    r['totalProvas']=len(r['provas'])
    arq=pasta/'resultado.json'; arq.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');os.chmod(arq,0o600)
    print(f"[v14-B] {r['status']}: {r['totalProvas']} provas. Relatório privado: {arq}")
    if erro:print('[v14-B] ERRO:',erro)
    return 0 if r['status']=='APROVADO' else 1


def main():
    p=argparse.ArgumentParser(description='QA real: arquivamento contratual auditável DEV')
    p.add_argument('--verificar',action='store_true')
    p.add_argument('--executar',action='store_true')
    p.add_argument('--confirmar-persistencia',action='store_true')
    p.add_argument('--visivel', action='store_true')
    a=p.parse_args()
    if a.verificar==a.executar:p.error('Escolha --verificar OU --executar')
    if a.executar and not a.confirmar_persistencia:p.error('Escrita de fixture DEV exige --confirmar-persistencia')
    confirmar_migration()
    contas=preflight()
    print('[v14-B] Pré-voo OK: 12 migrations, Nest, Next, SuperTokens, Chromium, contas QA')
    if a.verificar:
        print('[v14-B] Somente leitura; nenhuma alteração de dados executada')
        return 0
    return executar(contas,a.visivel)

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as exc:
        print('[v14-B] REPROVADO:',type(exc).__name__+':',str(exc)[:250]);sys.exit(1)
