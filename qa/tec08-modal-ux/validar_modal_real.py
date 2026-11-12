#!/usr/bin/env python3
"""QA Chromium do fluxo card -> detalhes -> edição -> confirmação de arquivamento.

Usa contas de QA privadas já configuradas em qa/tec08-02.
Cria um contrato, uma etapa e um entregável de teste persistentes; não apaga dados.
Sem senhas, cookies ou tokens em logs/relatórios.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'qa' / 'tec08-02'))
import validar_integracao_real as base  # noqa: E402

WEB = 'http://localhost:3000'


def opcoes():
    p = argparse.ArgumentParser()
    p.add_argument('--verificar', action='store_true')
    p.add_argument('--executar', action='store_true')
    p.add_argument('--confirmar-persistencia', action='store_true')
    modo = p.add_mutually_exclusive_group()
    modo.add_argument('--visivel', action='store_true')
    modo.add_argument('--sem-janela', action='store_true')
    args = p.parse_args()
    if args.verificar == args.executar:
        p.error('Informe --verificar ou --executar')
    if args.executar and not args.confirmar_persistencia:
        p.error('Este QA grava fixtures sintéticas; use --confirmar-persistencia')
    return args


def fluxo(contas, visivel):
    from playwright.sync_api import sync_playwright
    referencia = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
    nome = 'QA UX Entregavel ' + referencia[-6:]
    pasta = ROOT / 'qa' / 'tec08-modal-ux' / '.local' / referencia
    pasta.mkdir(parents=True, mode=0o700, exist_ok=False)
    os.chmod(pasta, 0o700)
    relatorio = {'suite': 'TEC08-MODAL-UX-PRE04', 'status': 'REPROVADO',
                 'referencia': referencia, 'provas': [], 'contratoSintetico': None,
                 'segredosNoRelatorio': False}
    contexto = None
    try:
        with sync_playwright() as pw:
            navegador = pw.chromium.launch(headless=not visivel)
            try:
                contexto, pagina, _ = base.nova_sessao(navegador, 'administrador', contas)
                contrato = base.criar_contrato(pagina, 'MODAL-UX-' + referencia)
                relatorio['contratoSintetico'] = contrato
                etapa = base.api(pagina, f'/contratos/{contrato}/etapas', 'POST', {'nome': 'QA UI ' + referencia[-6:]})
                base.aceitar(etapa['status'], {201}, 'Criar etapa sintética')
                id_etapa = etapa['body']['id']
                resp = base.api(pagina, f'/contratos/{contrato}/entregaveis', 'POST', {
                    'etapaId': id_etapa, 'nome': nome, 'tipo': 'UNICO',
                    'evidenciasEsperadas': [{'tipoEvidencia': 'Relatório de QA',
                                            'descricao': 'Planejamento sintético', 'obrigatoria': True}],
                })
                base.aceitar(resp['status'], {201}, 'Criar entregável')
                id_entregavel = resp['body']['id']
                relatorio['provas'].append('ADMIN autenticado, contrato, etapa e entregável sintéticos criados')

                pagina.goto(f'{WEB}/contratos/{contrato}', wait_until='domcontentloaded')
                pagina.get_by_role('tab', name='Etapas').click()
                pagina.get_by_role('button', name='Abrir detalhes da etapa 1: QA UI ' + referencia[-6:]).click()
                etapa_modal = pagina.get_by_role('dialog', name=re.compile(r'^\d+\s*·\s*' + re.escape('QA UI ' + referencia[-6:]) + r'$'))
                etapa_modal.wait_for(state='visible', timeout=15000)
                painel = etapa_modal.get_by_role('region', name='Entregáveis da etapa')
                cartao = painel.get_by_role('link', name=nome, exact=True)
                try:
                    cartao.wait_for(state='visible', timeout=12000)
                except Exception as primeira_falha:
                    # A aba documental é independente da execução física; buscar em
                    # Comprovados somente se o item saiu de Entregáveis.
                    aba_comprovados = painel.get_by_role('tab', name='Entregáveis verificados')
                    if aba_comprovados.count() == 0:
                        raise primeira_falha
                    aba_comprovados.click()
                    cartao.wait_for(state='visible', timeout=18000)
                base.exigir(cartao.get_attribute('aria-haspopup') == 'dialog', 'Card sem indicação de detalhe modal')
                bloco_cartao = cartao.locator('xpath=..')
                botao_editar = painel.get_by_role('button', name='Editar entregável ' + nome)
                botao_arquivar = painel.get_by_role('button', name='Arquivar entregável ' + nome)
                base.exigir(botao_editar.is_visible() and botao_arquivar.is_visible(),
                            'Ações de editar/arquivar precisam ficar no cartão, não no cabeçalho')
                cartao.scroll_into_view_if_needed()
                pagina_y = pagina.evaluate('window.scrollY')
                relatorio['etapaAtual'] = 'Abrir e fechar detalhes sem sair do contrato'
                cartao.click()
                modal = pagina.get_by_role('dialog', name=nome, exact=True)
                modal.wait_for(state='visible', timeout=12000)
                base.exigir(modal.locator('header').get_by_role('button', name='Editar entregável').count() == 0,
                            'Modal de consulta não deve oferecer edição')
                modal.get_by_role('button', name='Voltar à etapa').click()
                modal.wait_for(state='hidden', timeout=12000)
                botao_editar.click()
                formulario = pagina.get_by_role('form', name='Editar entregável ' + nome)
                formulario.wait_for(state='visible')
                base.exigir(formulario.get_by_role('region', name='Evidências do entregável').count() == 0,
                            'Edição do entregável repetiu checklist')
                formulario.get_by_role('button', name='Cancelar').click()
                formulario.wait_for(state='hidden', timeout=12000)
                base.exigir(pagina.get_by_role('dialog', name=nome, exact=True).count()==0,
                            'Cancelar exigiu uma segunda volta ao modal pai')
                relatorio['provas'].append('Detalhe somente leitura; lápis no cartão abre edição direta')
                relatorio['etapaAtual'] = 'Confirmar cancelamento de arquivamento'
                botao_arquivar.click()
                alerta = pagina.get_by_role('dialog', name='Arquivar entregável?')
                alerta.wait_for(state='visible')
                alerta.get_by_role('button', name='Cancelar').click()
                alerta.wait_for(state='hidden')
                base.aceitar(base.api(pagina, f'/contratos/{contrato}/entregaveis/{id_entregavel}')['status'], {200},
                            'Cancelar não arquivou entregável')
                relatorio['provas'].append('Cancelar arquivamento não altera dados')
                botao_arquivar.click()
                pagina.get_by_role('dialog', name='Arquivar entregável?').get_by_role(
                    'button', name='Confirmar arquivamento').click()
                cartao.wait_for(state='hidden', timeout=15000)
                arquivados = base.api(pagina, f'/contratos/{contrato}/entregaveis/arquivados?etapaId={id_etapa}')
                base.aceitar(arquivados['status'], {200}, 'Listar entregáveis arquivados')
                base.exigir(any(x['id'] == id_entregavel for x in arquivados['body']),
                            'Item arquivado não aparece em Arquivados')
                relatorio['etapaAtual'] = 'Reativar entregável pela aba Arquivados'
                painel.get_by_role('tab', name='Entregáveis arquivados', exact=True).click()
                aba_arch = painel.get_by_role('tabpanel', name='Entregáveis arquivados')
                aba_arch.get_by_text(nome, exact=True).wait_for(timeout=15000)
                aba_arch.get_by_role('button', name='Reativar', exact=True).click()
                # Reativar exige justificativa de 15 a 200 caracteres;
                # sem preenchimento o botão fica corretamente desabilitado.
                confirmacao = pagina.get_by_role('dialog', name='Reativar entregável?')
                confirmacao.get_by_role('textbox', name=re.compile('Justificativa obrigatória')).fill(
                    'Reativação do entregável no teste automatizado de integração.'
                )
                confirmacao.get_by_role('button', name='Confirmar reativação').click()
                aba_arch.get_by_text(nome, exact=True).wait_for(state='hidden', timeout=15000)
                painel.get_by_role('tab', name='Entregáveis', exact=True).click()
                cartao.wait_for(state='visible', timeout=15000)
                relatorio['provas'].append('Arquivar e reativar por cartões com confirmação e listas atualizadas')
                cartao.click()
                modal.wait_for(state='visible')
                pagina.keyboard.press('Escape')
                modal.wait_for(state='hidden')
                base.exigir(cartao.is_visible(), 'Cartão não ficou visível após voltar do modal')
                relatorio['provas'].append('Escape fecha detalhe sem perder o contrato')
                # Depois de fechar a ETAPA, o cartão do entregável pertence a
                # um modal fechado e deve ficar OCULTO. Quem deve ficar visível
                # novamente é o cartão da ETAPA na página do contrato.
                relatorio['etapaAtual'] = 'Retorno ao cartão da etapa e restauração da rolagem'
                etapa_modal.get_by_role('button', name='Voltar às etapas').click()
                etapa_modal.wait_for(state='hidden', timeout=12000)
                pagina.wait_for_function('''(y) => document.body.style.overflow !== 'hidden' &&
                    Math.abs(window.scrollY-y)<=100''', arg=pagina_y, timeout=10000)
                botao_etapa = pagina.get_by_role('button',name='Abrir detalhes da etapa 1: QA UI '+referencia[-6:])
                botao_etapa.wait_for(state='visible',timeout=15000)
                base.exigir(cartao.count()==0 or not cartao.is_visible(),
                            'Cartão do entregável permaneceu exposto após fechar a etapa')
                relatorio['provas'].append('Fechar etapa restaura seu cartão, rolagem e interação do contrato')
                relatorio['status'] = 'APROVADO'
            finally:
                if contexto:
                    try: contexto.close()
                    except Exception: pass
                navegador.close()
    except Exception as e:
        relatorio['erro'] = f'{type(e).__name__}: {str(e)[:300]}'
    finally:
        (pasta / 'resultado.json').write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding='utf-8')
        os.chmod(pasta / 'resultado.json', 0o600)
        print(f"[UX] {relatorio['status']}: {len(relatorio['provas'])} provas. Relatório privado: {pasta/'resultado.json'}")
        if 'erro' in relatorio:
            print('[UX] Etapa:',relatorio.get('etapaAtual','não identificada'),'| Falha:', relatorio['erro'])
    return relatorio['status'] == 'APROVADO'


def main():
    args = opcoes()
    contas = base.preflight()
    if args.verificar:
        print('[UX] Pré-voo OK. Nenhum registro alterado.')
        return
    sys.exit(0 if fluxo(contas, args.visivel) else 1)


if __name__ == '__main__':
    main()
