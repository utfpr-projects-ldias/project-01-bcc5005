#!/usr/bin/env python3
"""QA real de verificação de comprovantes: UI Chromium + Nest + SuperTokens + PostgreSQL.

Somente fixtures próprias; tokens/senhas nunca são exportados para relatório.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'qa'/'tec08-02'))
import validar_integracao_real as base  # noqa: E402
WEB='http://localhost:3000'
API='http://localhost:3001'


def argumentos():
    p=argparse.ArgumentParser(description='QA real de recebimento/verificação, integrado às contas QA existentes')
    p.add_argument('--verificar', action='store_true')
    p.add_argument('--executar', action='store_true')
    p.add_argument('--confirmar-persistencia', action='store_true')
    modos=p.add_mutually_exclusive_group()
    modos.add_argument('--visivel', action='store_true')
    modos.add_argument('--sem-janela', action='store_true')
    a=p.parse_args()
    if a.verificar == a.executar: p.error('Escolha --verificar ou --executar')
    if a.executar and not a.confirmar_persistencia:
        p.error('Execução grava contratos, entregáveis e comprovantes sintéticos: confirme com --confirmar-persistencia')
    return a


def verificar_migracao():
    r=subprocess.run(['docker','compose','exec','-T','backend','npm','run','migration:show'], cwd=ROOT,
                     capture_output=True,text=True,timeout=100,check=False)
    base.exigir(r.returncode==0, 'Migration:show indisponível')
    base.exigir(re.search(r'^\[X\]\s+13 ComprovantesEvidencias1794100000000',r.stdout,re.M) is not None,
                'Migration 13 de comprovantes não aplicada')
    base.exigir(re.search(r'^\[X\]\s+14 ArquivamentoPlanejamento1794200000000',r.stdout,re.M) is not None,
                'Migration 14 de arquivamento de planejamento não aplicada')
    base.exigir(re.search(r'^\[X\]\s+15 PermissoesGranularesContratos1794300000000',r.stdout,re.M) is not None,
                'Migration 15 de permissões granulares não aplicada')
    base.exigir(not re.search(r'^\[\s\]\s',r.stdout,re.M),'Há migrations pendentes')


def postar_arquivo(page,caminho,nome='qa-evidencia.txt',texto='Evidência sintética verificável TEC08'):
    return page.evaluate('''async ({url,nome,texto})=>{
      const form=new FormData(); form.append('arquivo',new File([texto],nome,{type:'text/plain'}));
      form.append('descricao','Comprovante sintético de QA');
      const r=await fetch(url,{method:'POST',credentials:'include',cache:'no-store',body:form});
      let data=null; try{data=await r.json();}catch{}
      return {status:r.status,body:data};
    }''',{'url':API+caminho,'nome':nome,'texto':texto})


def eventos(id_contrato: str, id_entregavel: str) -> tuple[int,int,int]:
    base.exigir(base.uuid_ok(id_contrato) and base.uuid_ok(id_entregavel),'UUID inválido para SQL')
    sql=("SELECT "
        "count(*) FILTER (WHERE acao='ENTREGAVEL_COMPROVANTE_ENVIADO'),"
        "count(*) FILTER (WHERE acao='ENTREGAVEL_COMPROVANTE_VERIFICADO'),"
        "count(*) FILTER (WHERE COALESCE(dados_posteriores ? 'storageKey', false)) "
        f"FROM eventos_auditoria WHERE contrato_id='{id_contrato}' "
        f"AND entidade_tipo='ENTREGAVEL' AND entidade_id='{id_entregavel}';")
    cmd=subprocess.run(['docker','compose','exec','-T','database','sh','-c',
        'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t -A -F , -v ON_ERROR_STOP=1'],
        input=sql+'\n', cwd=ROOT,text=True,capture_output=True,timeout=40,check=False)
    base.exigir(cmd.returncode==0,'Consulta SQL de auditoria não executada')
    return tuple(map(int,cmd.stdout.strip().split(',')))


def fluxo(contas,visivel):
    from playwright.sync_api import sync_playwright
    nome=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(3)
    pasta=ROOT/'qa'/'evidencias-verificacao'/'.local'/'execucoes'/nome
    pasta.mkdir(parents=True,mode=0o700,exist_ok=False);os.chmod(pasta,0o700)
    rel={'suite':'EVIDENCIAS_VERIFICACAO','execucao':nome,'status':'REPROVADO',
         'contratosQA':[],'comprovantesQA':[],'provas':[],'restauracaoVinculos':[],
         'segredosNoRelatorio':False,'navegadorVisivel':visivel}
    admin=gestor=None; contextos=[];pendentes=[]
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(headless=not visivel)
            try:
                ctx,admin,admin_dados=base.nova_sessao(browser,'administrador',contas);contextos.append(ctx)
                ctx,gestor,gestor_dados=base.nova_sessao(browser,'gestor-edicao',contas);contextos.append(ctx)
                rel['provas'].append('ADMIN e GESTOR autenticados via Next/SuperTokens')
                contrato=base.criar_contrato(admin,'COMPROVANTES-'+nome)
                contrato_b=base.criar_contrato(admin,'ISOLAMENTO-COMPROVANTES-'+nome)
                rel['contratosQA']=[contrato,contrato_b]
                etapa=base.api(admin,f'/contratos/{contrato}/etapas','POST',{'nome':'Etapa de evidências '+nome[-6:]})
                base.aceitar(etapa['status'],{201},'Criar etapa sintética')
                etapa_id=etapa['body']['id']
                nome_entregavel='QA verificacao '+nome[-6:]
                entrega=base.api(admin,f'/contratos/{contrato}/entregaveis','POST',{
                    'etapaId':etapa_id, 'nome':nome_entregavel, 'tipo':'UNICO',
                    'evidenciasEsperadas':[
                        {'tipoEvidencia':'Relatório de QA','descricao':'Planejado','obrigatoria':True},
                        {'tipoEvidencia':'Fotografia de QA','descricao':'Item preservado','obrigatoria':False},
                    ],
                })
                base.aceitar(entrega['status'],{201},'Criar entregável com duas evidências esperadas')
                entregavel=entrega['body']['id']
                evidencias_por_nome={x['tipoEvidencia']:x['id'] for x in entrega['body']['evidenciasEsperadas']}
                base.exigir(set(evidencias_por_nome)=={'Relatório de QA','Fotografia de QA'},
                            'Resposta de criação retornou evidências incompletas')
                e1=evidencias_por_nome['Relatório de QA']
                e2=evidencias_por_nome['Fotografia de QA']
                path=f'/contratos/{contrato}/entregaveis/{entregavel}/evidencias-esperadas/{e1}'
                rel['provas'].append('Contratos, etapa, entregável e duas exigências criados automaticamente')
                base.aceitar(base.api(gestor,path)['status'],{404,403},'GESTOR sem vínculo')
                rel['provas'].append('GESTOR sem vínculo não consulta evidência')
                pendentes.append((gestor_dados['id'],contrato))
                base.grant(admin,gestor_dados['id'],contrato,False)
                # Gestor tem somente leitura: mesmo quando não é autor, não verifica.
                base.aceitar(base.api(gestor,path)['status'],{200},'GESTOR leitura com vínculo')
                editado=base.api(admin,path,'PATCH',{'descricao':'Editado apenas este item','obrigatoria':True})
                base.aceitar(editado['status'],{200},'Editar item esperado individualmente')
                detalhes=base.api(admin,f'/contratos/{contrato}/entregaveis/{entregavel}')
                base.aceitar(detalhes['status'],{200},'Conferir checklist após edição')
                itens={x['id']:x for x in detalhes['body']['evidenciasEsperadas']}
                base.exigir(len(itens)==2 and itens[e2]['descricao']=='Item preservado' and
                            itens[e1]['descricao']=='Editado apenas este item',
                            'Editar uma evidência alterou outra do checklist')
                rel['provas'].append('PATCH individual preserva a outra exigência planejada')
                envio=postar_arquivo(admin,path+'/comprovantes')
                base.aceitar(envio['status'],{201},'Enviar comprovante')
                comprovante=envio['body']['id'];rel['comprovantesQA'].append(comprovante)
                base.exigir(envio['body']['status']=='PENDENTE_VERIFICACAO' and
                            'storageKey' not in envio['body'], 'Envio deve ficar pendente sem revelar storageKey')
                rel['provas'].append('Upload produz estado pendente (laranja), metadados privados')
                base.aceitar(base.api(gestor,path+f'/comprovantes/{comprovante}/verificar','POST')['status'],{403},
                            'GESTOR apenas leitura não verifica')
                rel['provas'].append('Verificação exige permissão nominal. ADMIN autorizado pode verificar seu próprio envio.')
                # Concessão editora ao GESTOR para revisão, sem conceder a outro contrato.
                base.aceitar(base.api(admin,f"/admin/usuarios/{gestor_dados['id']}/permissoes",'PUT',
                                     {'contratoId':contrato,'podeEditar':True})['status'],{200,201},'Promover vínculo GESTOR de QA')
                # ACL de obrigação: mesmo com edição geral, o gestor não altera obrigatoriedade sem delegação.
                negado=base.api(gestor,path,'PATCH',{'obrigatoria':False})
                base.aceitar(negado['status'],{403},'GESTOR não altera obrigatoriedade sem delegação')
                base.aceitar(base.api(admin,f"/admin/usuarios/{gestor_dados['id']}/permissoes",'PUT',
                    {'contratoId':contrato,'podeEditar':True,
                     'permissoesDetalhadas':{'editarEvidencias':False}})['status'],{200,201},
                    'ADMIN retira edição específica das evidências sem retirar edição do entregável')
                # Guard operacional mascara recursos sem acesso como 404 (sem revelar sua existência).
                # Não alterar a política para forçar 403: confirmar também que NENHUM dado mudou.
                negado=base.api(gestor,path,'PATCH',{'descricao':'Edição não permitida'})
                base.aceitar(negado['status'],{404},'PATCH individual bloqueado por permissão granular')
                leitura_admin=base.api(admin,path)
                base.aceitar(leitura_admin['status'],{200},'ADMIN consulta após PATCH negado')
                base.exigir(leitura_admin['body']['descricao']=='Editado apenas este item',
                            'PATCH granular negado alterou os dados da evidência')
                teste_aninhado = base.api(gestor,f'/contratos/{contrato}/entregaveis/{entregavel}','PATCH',
                    {'evidenciasEsperadas':[
                      {'id':e1,'tipoEvidencia':'Relatório de QA','descricao':'Alteração indevida','obrigatoria':True},
                      {'id':e2,'tipoEvidencia':'Fotografia de QA','descricao':'Item preservado','obrigatoria':False},
                    ]})
                # 400 = estrutura de atualização recusada pela validação; 403/404 = autorização.
                # Todos são bloqueios, mas o fato decisivo é que NENHUM item foi alterado.
                base.aceitar(teste_aninhado['status'], {400,403,404}, 'PATCH aninhado não autorizado deve ser rejeitado')
                depois_aninhado = base.api(admin, f'/contratos/{contrato}/entregaveis/{entregavel}')
                base.aceitar(depois_aninhado['status'], {200}, 'Conferir ausência de alteração após PATCH aninhado')
                itens_aninhados = {x['id']:x for x in depois_aninhado['body']['evidenciasEsperadas']}
                base.exigir(itens_aninhados[e1]['descricao'] == 'Editado apenas este item' and
                            itens_aninhados[e2]['descricao'] == 'Item preservado',
                            'PATCH aninhado conseguiu alterar evidência sem permissão')
                rel['provas'].append('ACL: editar entregável não permite editar o checklist por endpoint aninhado')
                base.aceitar(base.api(admin,f"/admin/usuarios/{gestor_dados['id']}/permissoes",'PUT',
                    {'contratoId':contrato,'podeEditar':True,
                     'permissoesDetalhadas':{'alterarObrigatoriedade':True}})['status'],{200,201},
                    'ADMIN delega mudança de obrigatoriedade ao GESTOR')
                autorizado=base.api(gestor,path,'PATCH',{'obrigatoria':False})
                base.aceitar(autorizado['status'],{200},'Gestor delegado pode tornar evidência opcional')
                base.exigir(autorizado['body']['obrigatoria'] is False,
                            'Delegação não alterou a obrigatoriedade no backend')
                base.aceitar(base.api(admin,path,'PATCH',{'obrigatoria':True})['status'],{200},
                    'ADMIN restaura exigência obrigatória')
                base.aceitar(base.api(admin,f"/admin/usuarios/{gestor_dados['id']}/permissoes",'PUT',
                    {'contratoId':contrato,'podeEditar':True,'permissoesDetalhadas':{}})['status'],{200,201},
                    'ADMIN revoga delegação específica')
                base.aceitar(base.api(gestor,path,'PATCH',{'obrigatoria':False})['status'],{403},
                    'Revogação da delegação deve voltar a negar mudança de obrigatoriedade')
                rel['provas'].append('Obrigatoriedade: sem delegação 403, delegação ADMIN 200, revogação 403')
                rel['etapaAtual'] = 'Abrir etapa, entregável e evidência no Chromium'
                gestor.goto(f'{WEB}/contratos/{contrato}',wait_until='domcontentloaded')
                gestor.get_by_role('tab', name='Etapas').click()
                gestor.get_by_role('button', name='Abrir detalhes da etapa 1: Etapa de evidências '+nome[-6:]).click()
                modal_etapa=gestor.get_by_role('dialog', name=re.compile(r'^\d+\s*·\s*' + re.escape('Etapa de evidências '+nome[-6:]) + r'$'))
                modal_etapa.wait_for(state='visible',timeout=15000)
                painel_entregaveis=modal_etapa.get_by_role('region',name='Entregáveis da etapa')
                titulo=painel_entregaveis.get_by_role('link',name=nome_entregavel,exact=True)
                try:
                    titulo.wait_for(state='visible',timeout=12000)
                except Exception as primeira_falha:
                    aba_comprovados=painel_entregaveis.get_by_role('tab',name='Entregáveis verificados')
                    if aba_comprovados.count()==0:
                        raise primeira_falha
                    aba_comprovados.click()
                    titulo.wait_for(state='visible',timeout=18000)
                titulo.scroll_into_view_if_needed()
                scroll=gestor.evaluate('window.scrollY')
                titulo.click()
                modal=gestor.get_by_role('dialog',name=nome_entregavel)
                modal.wait_for(state='visible',timeout=20000)
                modal.get_by_role('button',name='Ver detalhes da evidência esperada Relatório de QA').click()
                modal_evidencia=gestor.get_by_role('dialog',name='Relatório de QA')
                modal_evidencia.wait_for(state='visible', timeout=12000)
                painel=modal_evidencia.get_by_test_id('painel-comprovacao-evidencia')
                painel.get_by_test_id('status-verificacao').get_by_text('Pendente de verificação').wait_for(timeout=20000)
                base.exigir(painel.get_by_role('button',name='Substituir comprovante').count()==0,
                            'Detalhe de consulta expôs substituição')
                modal_evidencia.get_by_role('button', name='Fechar evidência').click()
                modal_evidencia.wait_for(state='hidden', timeout=15000)
                modal.get_by_role('tablist',name='Consultar evidências').first.get_by_role('tab',name='Evidências',exact=True).click()
                modal.get_by_role('button', name='Editar evidência Relatório de QA').click()
                modal_evidencia=gestor.get_by_role('dialog',name='Relatório de QA')
                modal_evidencia.wait_for(state='visible',timeout=15000)
                painel=modal_evidencia.get_by_test_id('painel-comprovacao-evidencia')
                # O lápis de um arquivo pendente abre SUBSTITUIÇÃO em janela própria.
                # Ação oficial de Cancelar: não depender de history.back() durante uma
                # atualização de React/Next, pois o histórico tem também as camadas pai.
                rel['etapaAtual'] = 'Cancelar substituição de comprovante pendente'
                painel.get_by_role('button',name='Substituir comprovante').click()
                editor=gestor.get_by_role('dialog',name='Substituir comprovante')
                editor.get_by_role('region',name='Edição individual da evidência').wait_for(state='visible',timeout=12000)
                base.exigir(editor.get_by_role('form',name='Enviar comprovação').count()==1,
                            'Modal de substituição não apresentou o formulário atual')
                editor.get_by_role('button',name='Cancelar edição do arquivo').click()
                editor.wait_for(state='hidden',timeout=15000)
                # O modal do entregável é aria-hidden durante a evidência (a11y),
                # mas continua visualmente montado na pilha de portais.
                base.exigir(gestor.locator('[data-tec08-modal] [data-testid="modal-detalhe-entregavel"]').count() == 1
                            and gestor.locator('[data-tec08-modal] [data-testid="modal-detalhe-entregavel"]').is_visible()
                            and modal_evidencia.is_visible(),
                            'Cancelar substituição fechou a evidência ou o entregável')
                anterior=base.api(gestor,path)
                base.exigir(anterior['status']==200 and anterior['body']['status']=='PENDENTE_VERIFICACAO'
                            and len(anterior['body']['versoes'])==1,
                            'Cancelar substituição modificou a versão pendente')
                rel['provas'].append('Chromium: cancelar substituição mantém modal e versão pendente')
                painel.get_by_role('button',name='Verificar comprovante').click()
                rel['etapaAtual'] = 'Confirmar verificação de comprovante pelo Gestor'
                gestor.get_by_role('dialog', name='Confirmar verificação da evidência?').get_by_role('button', name='Confirmar verificação').click()
                painel.get_by_test_id('status-verificacao').get_by_text('Verificado').wait_for(timeout=20000)
                # Política revisada: arquivo verificado é imutável. O botão de
                # substituição não deve reaparecer após a conferência.
                base.exigir(painel.get_by_role('button',name='Substituir comprovante').count()==0,
                            'Interface permite substituir comprovante já verificado')
                rel['provas'].append('Chromium: comprovante verificado não oferece substituição')
                rel['provas'].append('Chromium: GESTOR confirma pelo modal; estado muda de pendente para verificado')
                base.aceitar(base.api(gestor,path+f'/comprovantes/{comprovante}/verificar','POST')['status'],{409},
                            'Confirmação repetida deve gerar conflito')
                base.aceitar(base.api(admin,f'/contratos/{contrato_b}/entregaveis/{entregavel}/evidencias-esperadas/{e1}')['status'],{404},
                            'IDOR entre contratos reais')
                rel['provas'].append('Confirmação repetida e acesso com contrato incorreto negados')
                modal_evidencia.get_by_role('button',name='Fechar evidência').click()
                try:
                    modal_evidencia.wait_for(state='hidden',timeout=12000)
                except Exception as falha:
                    # Diagnóstico sem cookies, tokens ou dados contratuais: útil
                    # quando um popstate do Next devolve uma entrada intermediária.
                    estado = gestor.evaluate('''() => ({
                      evidencia: Boolean(history.state?.__modalEvidencia),
                      editor: Boolean(history.state?.__edicaoEvidencia),
                      aberto: document.querySelectorAll('[data-tec08-modal]').length
                    })''')
                    raise AssertionError(f'Fechar evidência não desmontou o diálogo; histórico: {estado}') from falha
                modal.get_by_role('tablist',name='Consultar evidências').first.get_by_role('tab',name='Evidências',exact=True).wait_for(timeout=12000)
                gestor.keyboard.press('Escape')
                modal.wait_for(state='hidden',timeout=12000)
                modal_etapa.get_by_role('button',name='Voltar às etapas').click()
                gestor.wait_for_function("(top)=>document.body.style.overflow !== 'hidden' && Math.abs(window.scrollY-top)<=100",arg=scroll,timeout=10000)
                rel['provas'].append('Voltar na pilha de modais preserva a posição do contrato')
                # Mesmo ADMIN não pode sobrescrever evidência já verificada.
                negado_verificado=postar_arquivo(admin,path+'/comprovantes','qa-nova-versao.txt','ARQUIVO NEGADO')
                base.aceitar(negado_verificado['status'],{409},'Arquivo verificado não admite nova versão')
                detalhes=base.api(admin,path)
                versoes=detalhes['body']['versoes']
                base.exigir(len(versoes)==1 and detalhes['body']['status']=='VERIFICADA' and
                            versoes[0]['id']==comprovante,
                            'Novo upload alterou comprovante já verificado')
                rel['provas'].append('Arquivo verificado imutável no backend, sem exclusão do original')
                # Versionamento continua permitido entre envios PENDENTES. O teste
                # usa uma segunda evidência, sem mexer na evidência já validada.
                caminho_e2=f'/contratos/{contrato}/entregaveis/{entregavel}/evidencias-esperadas/{e2}'
                pendente1=postar_arquivo(admin,caminho_e2+'/comprovantes','qa-primeira-pendente.txt')
                base.aceitar(pendente1['status'],{201},'Primeira versão pendente em segunda evidência')
                pendente2=postar_arquivo(admin,caminho_e2+'/comprovantes','qa-segunda-pendente.txt')
                base.aceitar(pendente2['status'],{201},'Segunda versão ainda pendente')
                rel['comprovantesQA'].extend([pendente1['body']['id'],pendente2['body']['id']])
                versoes2=base.api(admin,caminho_e2)
                base.exigir(versoes2['status']==200 and len(versoes2['body']['versoes'])==2 and
                            versoes2['body']['status']=='PENDENTE_VERIFICACAO',
                            'Versionamento de comprovantes pendentes não preservou histórico')
                base.aceitar(base.api(admin,caminho_e2+f"/comprovantes/{pendente2['body']['id']}/verificar",'POST')['status'],{200},
                            'ADMIN autorizado pode verificar seu próprio último envio')
                rel['provas'].append('Duas versões pendentes preservadas; somente a última é verificada')
                rel['etapaAtual'] = 'Conferir eventos reais da auditoria PostgreSQL'
                enviados,verificados,segredos=eventos(contrato,entregavel)
                base.exigir(enviados==3 and verificados==2 and segredos==0,
                            'Auditoria não corresponde aos três envios e duas verificações')
                rel['provas'].append('SQL: três envios, duas verificações e auditoria sem segredos de storage')
                # Arquivamento lógico: item arquivado permanece persistido, sem envio nem edição.
                caminho_e2=f'/contratos/{contrato}/entregaveis/{entregavel}/evidencias-esperadas/{e2}'
                base.aceitar(base.api(admin,caminho_e2+'/arquivar','PATCH')['status'],{200},'Arquivar evidência isolada')
                visao=base.api(admin,f'/contratos/{contrato}/entregaveis/{entregavel}')
                base.exigir(visao['status']==200 and len(visao['body']['evidenciasEsperadas'])==1,
                            'Evidência arquivada permanece indevidamente no checklist ativo')
                historico=base.api(admin,f'/contratos/{contrato}/entregaveis/{entregavel}/evidencias-esperadas/arquivadas')
                base.exigir(historico['status']==200 and any(x['id']==e2 for x in historico['body']),
                            'Evidência arquivada não consta da lista de arquivados')
                base.aceitar(base.api(admin,caminho_e2,'PATCH',{'descricao':'Alteração proibida'})['status'],{409},
                            'Edição de evidência arquivada deve ser bloqueada')
                base.aceitar(base.api(admin,caminho_e2+'/reativar','PATCH', {'motivo':'Reativação sintética da evidência para QA auditável.'})['status'],{200},'Reativar evidência')
                base.exigir(len(base.api(admin,f'/contratos/{contrato}/entregaveis/{entregavel}')['body']['evidenciasEsperadas'])==2,
                            'Evidência reativada não reapareceu no checklist')
                rel['provas'].append('Evidência: arquivar, ocultar, listar, bloquear alteração, reativar e manter checklist')
                raiz_entrega=f'/contratos/{contrato}/entregaveis/{entregavel}'
                base.aceitar(base.api(admin,raiz_entrega+'/arquivar','PATCH')['status'],{200},'Arquivar entregável')
                ativos=base.api(admin,f'/contratos/{contrato}/entregaveis?etapaId={etapa_id}')
                arquivados=base.api(admin,f'/contratos/{contrato}/entregaveis/arquivados?etapaId={etapa_id}')
                base.exigir(ativos['status']==200 and not any(x['id']==entregavel for x in ativos['body'])
                            and arquivados['status']==200 and any(x['id']==entregavel for x in arquivados['body']),
                            'Entregável arquivado não foi isolado da carteira ativa')
                base.aceitar(base.api(admin,raiz_entrega,'PATCH',{'nome':'Alteração proibida'})['status'],{409},
                            'Entregável arquivado não pode ser editado')
                base.aceitar(postar_arquivo(admin,path+'/comprovantes','qa-arquivado.txt')['status'],{409},
                            'Arquivo arquivado deve negar operações de escrita')
                base.aceitar(base.api(admin,raiz_entrega+'/reativar','PATCH', {'motivo':'Reativação sintética do entregável para QA auditável.'})['status'],{200},'Reativar entregável')
                visao=base.api(admin,path)
                base.exigir(visao['status']==200 and len(visao['body']['versoes'])==1,
                            'Reativação não preservou comprovante verificado')
                rel['provas'].append('Entregável: arquivar, isolar, bloquear edição, reativar e preservar original')
                rel['etapaAtual'] = 'Concluído'
                rel['status']='APROVADO'
            finally:
                if admin:
                    for pessoa, c in reversed(pendentes):
                        try: base.revogar(admin,pessoa,c); rel['restauracaoVinculos'].append('OK: vínculo temporário revogado')
                        except Exception: rel['restauracaoVinculos'].append('FALHA: revisar vínculo temporário de QA')
                for c in contextos:
                    try:c.close()
                    except Exception:pass
                browser.close()
    except Exception as e:
        rel['erro']=f'{type(e).__name__}: {str(e)[:280]}'
    finally:
        (pasta/'resultado.json').write_text(json.dumps(rel,indent=2,ensure_ascii=False),encoding='utf-8')
        os.chmod(pasta/'resultado.json',0o600)
        print(f"[EVIDENCIAS] {rel['status']}: {len(rel['provas'])} provas. Relatório privado: {pasta/'resultado.json'}")
        if rel.get('erro'):print('[EVIDENCIAS] ETAPA:',rel.get('etapaAtual','não identificada'),'| ERRO:',rel['erro'])
    return rel['status']=='APROVADO'


def main():
    a=argumentos()
    contas=base.preflight();verificar_migracao()
    print('[EVIDENCIAS] Pré-voo OK: Next, Nest, SuperTokens, migração 13, 3 contas QA, Chromium')
    if a.verificar:
        print('[EVIDENCIAS] Somente leitura; nenhum dado alterado');return
    sys.exit(0 if fluxo(contas,a.visivel) else 1)

if __name__=='__main__': main()
