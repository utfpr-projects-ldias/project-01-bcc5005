#!/usr/bin/env python3
"""QA Chromium adicional: card inteiro, modal aninhado, status e trilha.

NÃO executar sem --executar --confirmar-persistencia. Registra dados
sintéticos persistentes no DEV e não altera contratos preexistentes.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
import re
from pathlib import Path
import secrets
import sys
from pathlib import Path as _CaminhoQA
sys.path.insert(0, str(_CaminhoQA(__file__).resolve().parents[1]))
from navegacao_contrato import localizar_pagina, abrir_pagina
from fluxos_qa_atualizados import anexar_primeiro_comprovante

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'qa' / 'tec08-02'))
import validar_integracao_real as base  # noqa: E402


def opcoes():
    p = argparse.ArgumentParser()
    g = p.add_mutually_exclusive_group(required=True)
    g.add_argument('--verificar', action='store_true')
    g.add_argument('--executar', action='store_true')
    p.add_argument('--confirmar-persistencia', action='store_true')
    p.add_argument('--visivel', action='store_true')
    args = p.parse_args()
    if args.executar and not args.confirmar_persistencia:
        p.error('O QA grava dados sintéticos: inclua --confirmar-persistencia.')
    return args


def testar(contas, visivel):
    from playwright.sync_api import sync_playwright
    referencia = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(4)
    logdir = ROOT / 'qa' / 'tec08-uiux-final' / '.local' / referencia
    logdir.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(logdir, 0o700)
    rel = {'suite': 'TEC08-CARD-EVIDENCIA-REAL', 'status': 'REPROVADO', 'provas': [], 'contratoQA': None}
    with sync_playwright() as pw:
        navegador = pw.chromium.launch(headless=not visivel)
        contexto = None
        try:
            contexto, pagina, _ = base.nova_sessao(navegador, 'administrador', contas)
            contrato = base.criar_contrato(pagina, 'TEC08-UIUX-CARD-' + referencia)
            rel['contratoQA'] = contrato
            etapa = base.api(pagina, f'/contratos/{contrato}/etapas', 'POST', {'nome': 'Etapa QA UI/UX'})
            base.aceitar(etapa['status'], {201}, 'Criar etapa sintética')
            titulo = 'Obrigação de QA ' + referencia[-8:]
            entrega = base.api(pagina, f'/contratos/{contrato}/entregaveis', 'POST', {
                'etapaId': etapa['body']['id'], 'nome': titulo, 'tipo': 'UNICO',
                'inicioPrevisto': '2026-11-10',
                'peso': '1.0000',
                'evidenciasEsperadas': [
                    {'tipoEvidencia': 'Relatório de QA', 'descricao': 'Documento demonstrativo', 'obrigatoria': True},
                    {'tipoEvidencia': 'Fotografia de QA', 'descricao': 'Documento opcional', 'obrigatoria': False},
                ],
            })
            base.aceitar(entrega['status'], {201}, 'Criar obrigação sintética')
            item = entrega['body']
            # A API ordena evidências por tipo: não assumir que a ordem retornada
            # corresponde à ordem enviada no POST.
            esperada = next((e for e in item['evidenciasEsperadas'] if e['tipoEvidencia'] == 'Relatório de QA'), None)
            base.exigir(esperada is not None, 'Evidência Relatório de QA não localizada pelo tipo')
            pagina.goto(f'http://localhost:3000/contratos/{contrato}', wait_until='domcontentloaded')
            localizar_pagina(pagina, 'Etapas').click()
            pagina.get_by_role('button', name='Abrir detalhes da etapa 1: Etapa QA UI/UX').click()
            etapa_modal = pagina.get_by_role('dialog', name='1 · Etapa QA UI/UX', exact=True)
            etapa_modal.wait_for(state='visible', timeout=15000)
            painel_entregaveis = etapa_modal.get_by_role('region', name='Entregáveis da etapa')
            cartao = painel_entregaveis.get_by_role('link', name=titulo, exact=True)
            try:
                cartao.wait_for(state='visible', timeout=12000)
            except Exception as primeira_falha:
                aba_comprovados = painel_entregaveis.get_by_role('tab', name='Entregáveis finalizados')
                if aba_comprovados.count() == 0:
                    raise primeira_falha
                aba_comprovados.click()
                cartao.wait_for(state='visible', timeout=18000)
            cartao.click()
            pai = pagina.get_by_role('dialog', name=titulo, exact=True, include_hidden=True)
            pai.wait_for(state='visible', timeout=15000)
            rel['etapaAtual'] = 'Validar aba Ativas do checklist no detalhe do entregável'
            aba_ativas = pai.get_by_role('tablist', name='Consultar evidências').first.get_by_role('tab', name='Ativas', exact=True)
            aba_ativas.wait_for(state='visible', timeout=15000)
            base.exigir(aba_ativas.get_attribute('aria-selected') == 'true',
                        'A aba Ativas não está selecionada ao abrir o entregável')
            # Eventos vinculados ao contrato raiz: não expor JSONB bruto.
            historico = base.api(pagina, f'/contratos/{contrato}/entregaveis/{item["id"]}/historico')
            base.aceitar(historico['status'], {200}, 'Histórico do entregável autorizado')
            base.exigir(isinstance(historico['body'], list) and any(
                x.get('acao') == 'ENTREGAVEL_CRIADO' for x in historico['body']),
                'Evento de criação do entregável não foi encontrado')
            base.exigir(all('dadosPosteriores' not in x and 'dadosAnteriores' not in x
                             for x in historico['body']), 'API expôs JSONB interno de auditoria')
            pai.get_by_text('Rastreabilidade do entregável', exact=True).wait_for(timeout=15000)
            rel['provas'].append('Histórico do entregável separado e autorizado por contrato')
            # Clique diretamente no canto esquerdo do card; o botão invisível
            # deve ocupar a superfície toda, sem eliminar o botão Arquivar.
            rel['etapaAtual'] = 'Abrir cartão de evidência em modo de consulta'
            botao = pai.get_by_role('button', name='Ver detalhes da evidência esperada Relatório de QA')
            botao.wait_for(timeout=15000)
            botao.click(position={'x': 4, 'y': 4})
            filha = pagina.get_by_role('dialog', name='Relatório de QA', exact=True)
            filha.wait_for(state='visible', timeout=15000)
            base.exigir(pai.get_attribute('aria-hidden') == 'true', 'Modal-pai não foi isolado para acessibilidade')
            filha.get_by_role('region', name='Comprovação da evidência').wait_for(state='visible', timeout=15000)
            base.exigir(filha.get_by_role('region', name='Comprovação da evidência').is_visible(),
                        'Área de comprovação indisponível no modal filho')
            filha.get_by_test_id('status-verificacao').get_by_text('Aguardando envio').wait_for(timeout=15000)
            rel['provas'].append('Card inteiro abre camada aninhada, estado inicial e isolamento ARIA')
            # Anexação direta sem alternar um modo global de edição.
            filha.get_by_role('button', name='Anexar comprovante').wait_for(state='visible', timeout=15000)
            base.exigir(filha.get_by_role('button', name='Editar evidência Relatório de QA').count() == 0,
                        'Edição geral redundante ainda presente')
            filha.get_by_role('button', name='Fechar evidência').click()
            filha.wait_for(state='hidden', timeout=15000)
            pai.get_by_role('button', name='Ver detalhes da evidência esperada Relatório de QA').click()
            filha = pagina.get_by_role('dialog', name='Relatório de QA', exact=True)
            filha.wait_for(state='visible', timeout=15000)
            filha.get_by_role('button', name='Anexar comprovante').wait_for(state='visible', timeout=15000)
            # O clipe já abre o seletor nativo; o formulário é montado
            # depois da seleção, não antes. Helper coberto por unit tests.
            rel['etapaAtual']='Anexar primeiro comprovante pela seleção de arquivo'
            anexar_primeiro_comprovante(
                filha, nome='qa-uiux.txt', conteudo=b'QA sintetico - estado pendente')
            filha.get_by_test_id('status-verificacao').get_by_text('Pendente de verificação').wait_for(timeout=15000)
            rel['etapaAtual']='Confirmar verificação e conferir histórico'
            filha.get_by_role('button', name='Verificar comprovante').click()
            pagina.get_by_role('dialog', name='Confirmar verificação da evidência?').get_by_role('button', name='Confirmar verificação').click()
            filha.get_by_test_id('status-verificacao').get_by_text('Verificado').wait_for(timeout=15000)
            filha.get_by_text('Rastreabilidade da evidência', exact=True).click()
            filha.get_by_text('Comprovante verificado').first.wait_for(timeout=15000)
            filha.get_by_text('Arquivo: qa-uiux.txt').first.wait_for(timeout=15000)
            rel['provas'].append('ADMIN autoverificou mediante permissão; histórico auditável foi exibido')
            # Botão Voltar do navegador/mouse deve fechar somente a camada da evidência.
            rel['etapaAtual']='Retorno do navegador preserva o modal-pai'
            antes = pagina.evaluate('''() => ({
              evidencia: Boolean(history.state?.__modalEvidencia),
              editor: Boolean(history.state?.__edicaoEvidencia)
            })''')
            pagina.evaluate('window.history.back()')
            try:
                filha.wait_for(state='hidden', timeout=15000)
            except Exception as falha:
                depois = pagina.evaluate('''() => ({
                  evidencia: Boolean(history.state?.__modalEvidencia),
                  editor: Boolean(history.state?.__edicaoEvidencia),
                  camadas: document.querySelectorAll('[data-tec08-modal]').length
                })''')
                raise AssertionError(f'Voltar não fechou a evidência: histórico {antes} -> {depois}') from falha
            base.exigir(pai.is_visible(), 'Voltar do navegador fechou o entregável em vez da evidência')
            rel['provas'].append('Voltar do navegador/mouse fecha somente a evidência')
            # Evidência verificada migra para a aba Concluídas, sem duplicar cartão na lista ativa.
            pai.get_by_role('tablist', name='Consultar evidências').first.get_by_role('tab', name='Evidências finalizadas').click()
            botao_concluido = pai.get_by_role('button', name='Ver detalhes da evidência esperada Relatório de QA')
            botao_concluido.wait_for(state='visible', timeout=15000)
            botao_concluido.click()
            filha = pagina.get_by_role('dialog', name='Relatório de QA', exact=True)
            filha.wait_for(state='visible', timeout=15000)
            filha.get_by_role('button', name='Fechar evidência').click()
            filha.wait_for(state='hidden', timeout=15000)
            base.exigir(pai.is_visible(), 'Fechar camada filha fechou o entregável')
            # Regression: scroll global deve continuar bloqueado enquanto pai está aberto.
            base.exigir(pagina.evaluate('document.body.style.overflow') == 'hidden', 'Modal pai perdeu o bloqueio de rolagem')
            base.exigir(pai.get_attribute('aria-hidden') is None, 'Acessibilidade do pai não foi restaurada')
            rel['provas'].append('Retorno fecha somente camada filha e reativa o detalhe do entregável')
            pai.get_by_role('button', name='Voltar à etapa').click()
            pai.wait_for(state='hidden', timeout=15000)
            etapa_modal.get_by_role('button', name='Voltar às etapas').click()
            etapa_modal.wait_for(state='hidden', timeout=15000)
            base.exigir(pagina.evaluate('document.body.style.overflow') != 'hidden',
                        'A rolagem do documento ficou bloqueada após fechar toda a pilha de modais')
            rel['provas'].append('Scroll do body liberado após fechar modal filho e modal pai')
            rel['status'] = 'APROVADO'
        except Exception as exc:
            rel['erro'] = f'{type(exc).__name__}: {str(exc)[:300]}'
        finally:
            if contexto:
                try: contexto.close()
                except Exception: pass
            navegador.close()
    (logdir / 'resultado.json').write_text(json.dumps(rel, ensure_ascii=False, indent=2), encoding='utf-8')
    os.chmod(logdir / 'resultado.json', 0o600)
    print(f"{rel['status']} - {len(rel['provas'])} provas. Relatório privado: {logdir/'resultado.json'}")
    if rel.get('erro'): print('Etapa:',rel.get('etapaAtual','não identificada'),'| Falha:', rel['erro'])
    return rel['status'] == 'APROVADO'


def main():
    args = opcoes()
    contas = base.preflight()
    if args.verificar:
        print('Pré-voo Chromium aprovado; nenhuma fixture foi criada.')
        return
    sys.exit(0 if testar(contas, args.visivel) else 1)


if __name__ == '__main__':
    main()
