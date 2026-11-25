#!/usr/bin/env python3
"""HU07-06 — integração verificável pelo navegador Next + SuperTokens + Nest + PostgreSQL.

Sessões SuperTokens são criadas por login real no Chromium (manual ou automático
com credenciais de arquivo local protegido). Senhas, cookies e tokens não vão ao relatório.
Gravações ficam no contrato indicado, somente com opt-in.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import secrets
import subprocess
import sys
import time
from urllib.parse import quote, urlsplit

from credenciais_locais import carregar_credenciais, entrar_no_next

UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.I)
PERFIS = {
    'administrador': ('ADMINISTRADOR', True, True),
    'gestor-edicao': ('GESTOR', True, True),
    'gestor-leitura': ('GESTOR', True, False),
    'colaborador': ('COLABORADOR', True, False),
    'sem-vinculo': (None, False, False),
}
TIPOS = ('UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO')


def exigir(condicao: bool, descricao: str) -> None:
    if not condicao:
        raise AssertionError(descricao)


def argumentos() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='HU07-06: QA REAL pelo navegador, API, SuperTokens e PostgreSQL')
    p.add_argument('--contrato-id', required=True, help='UUID de contrato REAL de QA, já criado')
    p.add_argument('--perfil', required=True, choices=PERFIS)
    p.add_argument('--escrita', action='store_true', help='Cria uma etapa e CINCO entregáveis no banco DEV')
    p.add_argument('--confirmar-persistencia', action='store_true', help='Consinto com dados QA permanentes no contrato')
    p.add_argument('--entregavel-id', help='UUID existente para checagem de leitura/negação nos perfis sem escrita')
    p.add_argument('--retomar-relatorio', type=Path, help='JSON reprovado com etapa criada e nenhum entregável; retoma sem duplicar a etapa')
    p.add_argument('--outro-contrato-id', help='Contrato adicional para comprovar anti-IDOR')
    p.add_argument('--validar-banco', action='store_true', help='Conferência SQL de leitura no PostgreSQL do ambiente DEV')
    p.add_argument('--reiniciar-backend', action='store_true', help='Reinicia APENAS o container backend; requer --escrita')
    p.add_argument('--frontend-url', default='http://localhost:3000')
    p.add_argument('--api-url', default='http://localhost:3001')
    p.add_argument('--largura', type=int, default=1280)
    p.add_argument('--saida', type=Path, help='Arquivo JSON exclusivo para evidências; não armazena tokens ou senhas')
    p.add_argument('--login-automatico', action='store_true', help='Preenche login real usando arquivo privado local, sem pausa')
    p.add_argument('--credenciais-arquivo', type=Path, help='Caminho opcional do arquivo privado, fora do Git')
    a = p.parse_args()
    for arg in ('contrato_id', 'entregavel_id', 'outro_contrato_id'):
        v = getattr(a, arg)
        if v and not UUID.fullmatch(v):
            p.error(f'--{arg.replace("_", "-")} precisa ser UUID válido')
    if a.escrita and (not a.confirmar_persistencia or not PERFIS[a.perfil][2]):
        p.error('--escrita exige --confirmar-persistencia e perfil administrador/gestor-edicao')
    if a.retomar_relatorio and not a.escrita:
        p.error('--retomar-relatorio exige --escrita e --confirmar-persistencia')
    if a.reiniciar_backend and not a.escrita:
        p.error('--reiniciar-backend só é permitido no cenário de escrita')
    if not a.escrita and not a.entregavel_id:
        p.error('cenários de leitura/negação exigem --entregavel-id de um registro de QA existente')
    if a.credenciais_arquivo and not a.login_automatico:
        p.error('--credenciais-arquivo exige --login-automatico')
    if a.largura < 320 or a.largura > 2560:
        p.error('--largura deve estar entre 320 e 2560')
    for arg in ('frontend_url', 'api_url'):
        v = urlsplit(getattr(a, arg))
        if v.scheme not in ('http', 'https') or not v.netloc or v.query or v.fragment:
            p.error(f'URL inválida: --{arg.replace("_", "-")}')
    if a.login_automatico:
        for endereco in (a.frontend_url, a.api_url):
            if urlsplit(endereco).hostname not in ('localhost', '127.0.0.1'):
                p.error('Login automático restrito a localhost/127.0.0.1 em ambiente DEV')
    return a


def requisitar(page, api: str, caminho: str, metodo: str = 'GET', corpo=None) -> dict:
    """Fetch no navegador autenticado: utiliza a mesma sessão e interceptor da UI."""
    return page.evaluate('''async ({url, metodo, corpo}) => {
      try {
        const headers = {Accept: 'application/json'};
        const init = {method: metodo, credentials: 'include', cache: 'no-store', headers};
        if (corpo !== null) {headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corpo);}
        const response = await fetch(url, init);
        const texto = await response.text();
        let data = null; try {data = JSON.parse(texto);} catch { /* corpo vazio */ }
        return {status: response.status, body: data};
      } catch (err) {return {status: 0, error: String(err)};}
    }''', {'url': api.rstrip('/') + caminho, 'metodo': metodo, 'corpo': corpo})


def rota(contrato: str, id: str | None = None) -> str:
    base = f'/contratos/{quote(contrato)}/entregaveis'
    return base + ('/' + quote(id) if id else '')


def itens_api(page, api: str, contrato: str) -> list[dict]:
    r = requisitar(page, api, rota(contrato))
    exigir(r['status'] == 200, f'GET entregáveis: esperado 200, veio {r["status"]}')
    exigir(isinstance(r['body'], list), 'GET entregáveis não devolveu array')
    exigir(all(x.get('contratoId') == contrato for x in r['body']), 'Vazamento de dados entre contratos na API')
    return r['body']


def detalhe_api(page, api: str, contrato: str, id: str) -> dict:
    r = requisitar(page, api, rota(contrato, id))
    exigir(r['status'] == 200, f'GET detalhe {id}: esperado 200, veio {r["status"]}')
    x = r['body']
    exigir(isinstance(x, dict) and x.get('id') == id and x.get('contratoId') == contrato,
           'Resposta de detalhe fora do contrato ou identificador')
    return x


def pg_direto(raiz: Path, contrato: str, etapa: str, ids: list[str]) -> dict:
    """Consulta read-only com pg no backend, sem expor DATABASE_URL no terminal."""
    js = r'''
      import pg from 'pg';
      const db = new pg.Client({connectionString: process.env.DATABASE_URL});
      try {
        await db.connect();
        await db.query('BEGIN READ ONLY');
        const [contrato, etapa, ids] = [process.argv[1], process.argv[2], JSON.parse(process.argv[3])];
        const es = await db.query(`SELECT e.id, e.contrato_id, e.etapa_id, e.nome, e.codigo, e.tipo, e.responsavel_id,
           e.quantidade_prevista, e.unidade_medida, e.periodicidade, e.configuracao_periodicidade,
           e.peso, e.status_execucao, e.percentual_execucao, e.situacao_comprovacao,
           e.quantidade_realizada, e.criterio_conclusao,
           (SELECT count(*)::int FROM eventos_auditoria a WHERE a.entidade_tipo='ENTREGAVEL'
             AND a.entidade_id=e.id::text AND a.acao='ENTREGAVEL_CRIADO') AS auditoria_criacao,
           (SELECT count(*)::int FROM eventos_auditoria a WHERE a.entidade_tipo='ENTREGAVEL'
             AND a.entidade_id=e.id::text AND a.acao='ENTREGAVEL_EDITADO') AS auditoria_edicao
           FROM entregaveis e WHERE e.contrato_id=$1 AND e.etapa_id=$2 AND e.id=ANY($3::uuid[]) ORDER BY e.codigo`,
           [contrato, etapa, ids]);
        const cs = await db.query(`SELECT ee.entregavel_id, ee.id, ee.tipo_evidencia, ee.descricao, ee.obrigatoria
            FROM evidencias_esperadas ee JOIN entregaveis e ON e.id=ee.entregavel_id
            WHERE e.contrato_id=$1 AND e.etapa_id=$2 AND e.id=ANY($3::uuid[]) ORDER BY ee.tipo_evidencia`,
            [contrato, etapa, ids]);
        process.stdout.write(JSON.stringify({entregaveis: es.rows, checklist: cs.rows}));
        await db.query('COMMIT');
      } finally {await db.end();}
    '''
    cmd = ['docker', 'compose', 'exec', '-T', 'backend', 'node', '--input-type=module', '-e', js,
           contrato, etapa, json.dumps(ids)]
    ret = subprocess.run(cmd, cwd=raiz, capture_output=True, text=True, check=False)
    exigir(ret.returncode == 0, 'Consulta SQL falhou; confira Docker/PostgreSQL. ' + ret.stderr[:350])
    return json.loads(ret.stdout)


def conferir_db_por_api(pg: dict, registros: list[dict], etapa_id: str) -> None:
    linhas = {e['id']: e for e in pg['entregaveis']}
    exigir(len(linhas) == len(registros), 'PostgreSQL não retornou todos os entregáveis')
    for x in registros:
        e = linhas[x['id']]
        exigir(str(e['contrato_id']) == x['contratoId'] and str(e['etapa_id']) == etapa_id,
               'FKs persistidas não correspondem ao contrato/etapa da API')
        exigir((e['tipo'], e['nome'], e['codigo']) == (x['tipo'], x['nome'], x['codigo']),
               f'SQL e API divergentes para {x["codigo"]}')
        exigir((str(e['responsavel_id']) if e['responsavel_id'] else None) == x.get('responsavelId'),
               'Responsável cadastral divergente entre PostgreSQL e API')
        exigir(e['status_execucao'] is None and e['percentual_execucao'] is None and
               e['situacao_comprovacao'] is None and e['quantidade_realizada'] is None,
               'HU07 indevidamente marcou execução/comprovação')
        exigir(e['auditoria_criacao'] >= 1 and e['auditoria_edicao'] >= 1,
               'Auditoria de criação/edição ausente')
        itens = [i for i in pg['checklist'] if str(i['entregavel_id']) == x['id']]
        exigir(len(itens) == len(x['evidenciasEsperadas']), 'Checklist SQL e API divergente')
        esperado = {(i['id'], i['tipoEvidencia'], i['obrigatoria']) for i in x['evidenciasEsperadas']}
        real = {(str(i['id']), i['tipo_evidencia'], i['obrigatoria']) for i in itens}
        exigir(esperado == real, 'IDs, tipos ou obrigatoriedade divergentes no PostgreSQL')
        if x['tipo'] == 'RECORRENTE':
            exigir(e['configuracao_periodicidade'] == {'versao': 1} and e['periodicidade'] in
                   ('DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'),
                   'Contrato de periodicidade V1 inválido para HU09')
        if x['tipo'] == 'QUANTITATIVO':
            exigir(e['quantidade_prevista'] is not None and float(e['quantidade_prevista']) > 0
                   and e['unidade_medida'], 'Quantitativo inválido para TEC09')


def validar_checklist_api(evidencias: list[dict], *, pode_alterar_obrigatoriedade: bool = True) -> None:
    """Checklist documental atual: 2 registros separados do POST do entregável.

    Em ADMIN, Relatório obrigatório e Foto opcional; em GESTOR com edição
    sem delegação específica, ambos obrigatórios. IDs sempre distintos.
    Não confundir edição geral de entregável com poder de alterar requisitos.
    """
    exigir(isinstance(evidencias, list) and len(evidencias) == 2,
           'Checklist deve conter exatamente duas evidências após os POSTs próprios')
    ids = [e.get('id') for e in evidencias]
    exigir(len(set(ids)) == 2 and all(UUID.fullmatch(x or '') for x in ids),
           'Checklist contém ID repetido ou inválido')
    esperado = {('Relatório', True), ('Foto', not pode_alterar_obrigatoriedade)}
    exigir({(e.get('tipoEvidencia'), e.get('obrigatoria')) for e in evidencias} == esperado,
           f'Checklist inconsistente com permissão alterarObrigatoriedade={pode_alterar_obrigatoriedade}: esperado {esperado}')


def validar_acesso_obrigatoriedade(acesso: dict, perfil: str) -> bool:
    """Confere o perfil efetivo da API; nunca promove um gestor por teste.

    O QA integrado concede apenas vínculo de edição ao gestor, sem a delegação
    granular alterarObrigatoriedade; ADMIN deve ter autorização completa.
    """
    esperado = perfil == 'administrador'
    permissoes = acesso.get('permissoes')
    exigir(isinstance(permissoes, dict) and isinstance(permissoes.get('alterarObrigatoriedade'), bool),
           'GET acesso não retornou permissão granular alterarObrigatoriedade')
    atual = permissoes['alterarObrigatoriedade']
    exigir(atual is esperado,
           f'Permissão alterarObrigatoriedade inesperada no cenário {perfil}: {atual}; '
           f'esperado {esperado}. Verifique os vínculos do QA.')
    return atual


def verificar_modal_etapa(page, painel, etapa_nome: str, saida: dict) -> None:
    """Confere modal atual: detalhe primeiro, edição por botão interno e retorno seguro."""
    botao = painel.get_by_role('button', name=re.compile(
        r'Abrir detalhes da etapa \d+: ' + re.escape(etapa_nome)))
    botao.wait_for(state='visible', timeout=25000)
    url_original = page.url
    botao.click()
    detalhe = page.get_by_role('dialog', name=re.compile(r'^\d+\s*·\s*' + re.escape(etapa_nome) + r'$'))
    detalhe.wait_for(state='visible', timeout=15000)
    exigir(detalhe.get_attribute('aria-modal') == 'true', 'Detalhe da etapa não é modal acessível')
    detalhe.get_by_role('button', name='Editar etapa').click()
    form = page.get_by_role('form', name=f'Editar etapa {etapa_nome}')
    form.wait_for(state='visible', timeout=15000)
    form.get_by_role('button', name='Voltar sem salvar').click()
    detalhe = page.get_by_role('dialog', name=re.compile(r'^\d+\s*·\s*' + re.escape(etapa_nome) + r'$'))
    detalhe.wait_for(state='visible', timeout=15000)
    detalhe.get_by_role('button', name='Voltar às etapas').click()
    detalhe.wait_for(state='detached', timeout=15000)
    exigir(page.url == url_original, 'Fechar detalhe/edição mudou a rota do contrato')
    botao.wait_for(state='visible', timeout=15000)
    saida['provas'].append('Etapa: detalhe acessível, edição no modal e retorno sem salvar, mantendo a rota')


def localizar_entregavel_cadastrado(bloco, nome: str, contrato: str, identificador: str):
    """Acha âncora por ID do POST/GET, independentemente do texto aninhado.

    A acessibilidade continua obrigatória: aria-label exato, âncora visível,
    href do recurso correto e ausência de aria-hidden em ancestrais.
    """
    esperado = rota(contrato, identificador)
    titulo = bloco.locator(f'li[data-tec08-item-clicavel] a[href="{esperado}"]')
    titulo.wait_for(state='visible', timeout=25000)
    exigir(titulo.count() == 1, f'Cartão ausente ou duplicado para {nome!r}')
    exigir(titulo.get_attribute('aria-label') == nome,
           f'Nome acessível do entregável não corresponde ao banco: {nome!r}')
    exigir(titulo.evaluate("a => a.tagName === 'A' && a.hasAttribute('href') && !a.closest('[aria-hidden=true]') && a.tabIndex >= 0"),
           f'Cartão {nome!r} não é link acessível pelo teclado')
    return titulo


def verificar_atualizacao_entregaveis(bloco, nome: str, contrato: str, identificador: str, saida: dict):
    """Exige inserção automática visível após o POST, sem refresh manual."""
    titulo = localizar_entregavel_cadastrado(bloco, nome, contrato, identificador)
    exigir(bloco.get_by_role('button', name='Atualizar entregáveis', exact=True).count() == 0,
           'A listagem voltou a depender de atualização manual')
    saida['provas'].append(f'Autoatualização: entregável {nome} único, visível, acessível, UUID/URL confirmados na API')
    return titulo


def cadastrar_checklist_no_detalhe(page, api: str, contrato: str, identificador: str,
                                  nome: str, bloco, saida: dict,
                                  *, pode_alterar_obrigatoriedade: bool) -> list[dict]:
    """Exercita o fluxo real: planejamento (POST) -> detalhe -> evidência (POST x2).

    Não aceita evidência inventada pelo QA via API: ambos os POSTs de checklist
    devem ser acionados nos formulários Next, observados no Chromium e lidos
    novamente da API para conferir UUID, tipo e obrigatoriedade.
    """
    link = localizar_entregavel_cadastrado(bloco, nome, contrato, identificador)
    link.click()
    modal = page.get_by_role('dialog', name=nome, exact=True)
    modal.wait_for(state='visible', timeout=25000)
    aba = modal.get_by_role('tab', name='Evidências', exact=True)
    aba.click()
    url = rota(contrato, identificador) + '/evidencias-esperadas'
    criados = []
    for tipo, obrigatoria in (('Relatório', True), ('Foto', False)):
        modal.get_by_role('button', name='Nova evidência', exact=True).click()
        novo = page.get_by_role('dialog', name='Nova evidência esperada')
        novo.wait_for(state='visible', timeout=15000)
        formulario = novo.get_by_role('form', name='Cadastrar evidência esperada')
        formulario.get_by_label('Tipo de evidência').select_option(tipo)
        formulario.get_by_label('Orientações (opcional)').fill(f'Exigência HU07-06: {tipo}')
        campo = formulario.get_by_role('checkbox', name='Obrigatória')
        if pode_alterar_obrigatoriedade:
            campo.wait_for(state='visible', timeout=10000)
            if obrigatoria:
                campo.check()
            else:
                campo.uncheck()
        else:
            exigir(campo.count() == 0,
                   'Gestor sem delegação visualizou controle de obrigatoriedade no cadastro')
            exigir(formulario.get_by_text('Obrigatória por padrão.', exact=False).count() == 1,
                   'Formulário do gestor não informou a obrigatoriedade padrão')
        with page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path == url,
                                  timeout=25000) as resposta_observada:
            formulario.get_by_role('button', name='Cadastrar evidência', exact=True).click()
        resposta = resposta_observada.value
        exigir(resposta.status == 201, f'Cadastro da evidência {tipo}: HTTP {resposta.status}; {resposta.text()[:180]}')
        corpo = resposta.json()
        exigir(isinstance(corpo, dict) and UUID.fullmatch(corpo.get('id') or ''),
               'POST da evidência não retornou identificador válido')
        criados.append(corpo['id'])
        novo.wait_for(state='detached', timeout=25000)
        modal.get_by_role('button', name=f'Ver detalhes da evidência esperada {tipo}', exact=True).wait_for(
            state='visible', timeout=25000)
    detalhado = detalhe_api(page, api, contrato, identificador)
    evidencias = detalhado['evidenciasEsperadas']
    validar_checklist_api(evidencias, pode_alterar_obrigatoriedade=pode_alterar_obrigatoriedade)
    if not pode_alterar_obrigatoriedade:
        # Exercitar o backend real: UI oculta o checkbox E a API rejeita POST opcional.
        tentativa = requisitar(page, api, url, 'POST', {
            'tipoEvidencia': 'QA tentativa não autorizada', 'obrigatoria': False,
        })
        exigir(tentativa['status'] == 403,
               f'Gestor sem delegação conseguiu cadastrar evidência opcional (HTTP {tentativa["status"]})')
        mantidos = detalhe_api(page, api, contrato, identificador)['evidenciasEsperadas']
        exigir({e['id'] for e in mantidos} == set(criados),
               'POST opcional negado modificou o checklist')
        saida['provas'].append('Gestor: controle opcional ausente e POST opcional bloqueado pela API (403), sem efeitos no banco')
    exigir({e['id'] for e in evidencias} == set(criados),
           'IDs das duas evidências criadas pela UI não correspondem ao GET da API')
    modal.get_by_role('button', name='Voltar à etapa').click()
    modal.wait_for(state='detached', timeout=15000)
    saida['provas'].append('Checklist: dois POSTs reais via modal, IDs e obrigatoriedade compatíveis com ACL; persistência conferida')
    return evidencias




def validar_acl_planejamento_leitor(acesso: dict, perfil: str) -> None:
    """Um vínculo com podeEditar=false pode conter exceções granulares antigas.

    O QA não revoga essas exceções: reprova a fixture e explica a divergência,
    sem confundir um privilégio realmente delegado com erro de renderização.
    """
    chaves = ('criarEtapas', 'editarEtapas', 'reordenarEtapas',
              'criarEntregaveis', 'editarEntregaveis', 'criarEvidencias', 'editarEvidencias')
    permissoes = acesso.get('permissoes')
    exigir(isinstance(permissoes, dict), 'GET acesso do leitor sem permissões granulares')
    inesperadas = [chave for chave in chaves if permissoes.get(chave) is not False]
    exigir(not inesperadas,
           f'Fixture {perfil} não é somente leitura no planejamento: {inesperadas}; '
           'verifique o vínculo e as delegações existentes, sem alterar a política de produção')


def verificar_navegacao_leitor(page, painel, etapa: dict, entregavel: dict,
                              contrato: str, saida: dict) -> None:
    """Comprova leitura na hierarquia real: aba Etapas -> modal etapa -> lista -> detalhe.

    Um botão não encontrado no painel fechado NÃO comprova que a ACL o ocultou.
    As ações proibidas são verificadas somente depois de cada nível estar montado.
    A etapa é obtida pelo ID persistido do entregável, nunca por uma posição fixa.
    """
    nome_etapa = etapa['nome']
    nome_entregavel = entregavel['nome']
    abrir = painel.get_by_role('button', name=re.compile(
        r'^Abrir detalhes da etapa \d+: ' + re.escape(nome_etapa) + r'$'))
    abrir.wait_for(state='visible', timeout=25000)
    exigir(abrir.count() == 1, f'Etapa {nome_etapa!r} ausente ou duplicada na aba Etapas')
    abrir.click()
    modal_etapa = page.get_by_role('dialog', name=re.compile(
        r'^\d+\s*·\s*' + re.escape(nome_etapa) + r'$'))
    modal_etapa.wait_for(state='visible', timeout=20000)
    exigir(modal_etapa.get_attribute('aria-modal') == 'true',
           'Detalhe da etapa não foi aberto como diálogo acessível')
    exigir(modal_etapa.get_by_role('button', name='Editar etapa', exact=True).count() == 0,
           'Etapa em modo de leitura disponibilizou edição no modal real')
    bloco = modal_etapa.get_by_role('region', name='Entregáveis da etapa')
    bloco.wait_for(state='visible', timeout=20000)
    lista = bloco.get_by_role('list', name='Entregáveis planejados da etapa', exact=True)
    lista.wait_for(state='visible', timeout=25000)
    # A lista possui aria-label, não texto visível "Entregáveis planejados".
    link = localizar_entregavel_cadastrado(lista, nome_entregavel, contrato, entregavel['id'])
    exigir(bloco.get_by_role('button', name='Novo entregável', exact=True).count() == 0,
           'Gestor/Colaborador leitor recebeu ação Novo entregável dentro do modal')
    link.click()
    modal_entregavel = page.get_by_role('dialog', name=nome_entregavel, exact=True)
    modal_entregavel.wait_for(state='visible', timeout=25000)
    exigir(modal_entregavel.get_attribute('aria-modal') == 'true',
           'Detalhe aninhado do entregável não está acessível como diálogo')
    exigir(modal_entregavel.get_by_role('button', name='Editar entregável', exact=True).count() == 0,
           'Entregável leitor recebeu ação de edição no detalhe aninhado')
    modal_entregavel.get_by_role('button', name='Voltar à etapa', exact=True).click()
    modal_entregavel.wait_for(state='detached', timeout=15000)
    modal_etapa.get_by_role('button', name='Voltar às etapas', exact=True).click()
    modal_etapa.wait_for(state='detached', timeout=15000)
    saida['provas'].append('Leitor: navegação contextual Etapas → modal da etapa → lista acessível → entregável, sem criação/edição')


def selecionar_responsavel_real(page, form, api: str, contrato: str, saida: dict) -> dict:
    """Não insere UUID visível: busca e seleciona diretamente pelo e-mail."""
    resposta = requisitar(page, api, rota(contrato) + '/responsaveis')
    exigir(resposta['status'] == 200 and isinstance(resposta['body'], dict),
           f'Pesquisa de funcionários deveria retornar 200, veio {resposta["status"]}')
    usuarios = resposta['body'].get('itens')
    exigir(isinstance(usuarios, list) and len(usuarios) > 0,
           'Contrato de QA exige ao menos um funcionário ativo pesquisável')
    pessoa = usuarios[0]
    exigir(UUID.fullmatch(pessoa['id']) and bool(pessoa.get('email')),
           'API de responsável não retornou ID e e-mail válidos')
    # O dropdown deve aceitar seleção pelo mouse e limitar a quantidade exibida.
    abrir = form.get_by_role('button', name='Abrir lista de responsáveis')
    abrir.click()
    lista = form.get_by_role('listbox', name='E-mails encontrados')
    lista.get_by_role('option').first.wait_for(timeout=15000)
    exigir(1 <= lista.get_by_role('option').count() <= 20,
           'Dropdown deveria limitar os resultados a 20 opções de funcionário')
    form.get_by_role('button', name='Fechar lista de responsáveis').click()
    saida['provas'].append('Responsável: menu por seta com até 20 e-mails e nomes, selecionável com mouse')
    campo = form.get_by_role('combobox', name='Buscar responsável por e-mail')
    campo.fill(pessoa['email'])
    opcao = form.get_by_role('option', name=re.compile(re.escape(pessoa['email'])))
    opcao.wait_for(timeout=15000)
    opcao.click()
    exigir(form.get_by_text(pessoa['email'], exact=True).count() == 1,
           'E-mail escolhido não ficou identificado no formulário')
    exigir(form.get_by_role('button', name='Remover atribuição').count() == 1,
           'Atribuição individual não permite remover o responsável')
    saida['provas'].append('Responsável: seleção única por e-mail na API protegida, sem digitar UUID')
    return pessoa


def criar_cinco_na_ui(page, api: str, web: str, contrato: str, saida: dict,
                    retomar: dict | None = None, *, pode_alterar_obrigatoriedade: bool = True) -> tuple[str, list[dict]]:
    """TODOS os POSTs partem dos botões da interface Next — não do validador."""
    page.goto(f'{web}/contratos/{quote(contrato)}', wait_until='domcontentloaded')
    page.get_by_role('tab', name='Etapas', exact=True).click()
    painel = page.locator('section[aria-labelledby="titulo-etapas"]')
    painel.wait_for(state='visible', timeout=25000)
    caminho_etapas = f'/contratos/{quote(contrato)}/etapas'
    info_contrato = requisitar(page, api, f'/contratos/{quote(contrato)}')
    exigir(info_contrato['status'] == 200 and isinstance(info_contrato['body'], dict),
           'Não foi possível obter o modo de cálculo do contrato de QA')
    modo_calculo = info_contrato['body'].get('modoCalculo')
    # Este roteiro integrado foi preparado com 5 cadastros e 5 edições por perfil:
    # ao final soma mais de 100%. É válido apenas para contratos SIMPLES, como
    # aqueles gerados pelo bootstrap oficial. PONDERADO requer outra fixture.
    exigir(modo_calculo == 'SIMPLES',
           f'HU07-06 integrado exige contrato em modo SIMPLES; recebido {modo_calculo!r}')
    saida['modoCalculo'] = modo_calculo
    saida['provas'].append('Contrato SIMPLES confirmado na API; soma de pesos não deve bloquear cadastros adicionais')
    if retomar is None:
        marca = secrets.token_hex(4).upper()
        etapa_nome = f'QA HU07-06 Etapa {marca}'
        etapa_codigo = f'QA706-{marca}'
        painel.get_by_role('button', name='Nova etapa').click()
        form = page.get_by_role('form', name='Criar etapa')
        form.locator('#etapa-nome').fill(etapa_nome)
        form.locator('#etapa-codigo').fill(etapa_codigo)
        with page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path == caminho_etapas
                                  and r.status == 201, timeout=25000):
            form.get_by_role('button', name='Salvar etapa').click()
    resp = requisitar(page, api, caminho_etapas)
    exigir(resp['status'] == 200 and isinstance(resp['body'], list), 'Falha ao consultar etapa real')
    if retomar is None:
        etapas = [e for e in resp['body'] if e.get('nome') == etapa_nome and e.get('codigo') == etapa_codigo]
    else:
        etapas = [e for e in resp['body'] if e.get('id') == retomar['etapaCriada']
                  and e.get('nome', '').startswith('QA HU07-06 Etapa ')]
        exigir(len(etapas) == 1, 'Etapa do relatório anterior não existe neste contrato ou não pertence a QA')
        etapa_nome, etapa_codigo = etapas[0]['nome'], etapas[0]['codigo']
        marca = etapa_codigo.removeprefix('QA706-')
        exigir(re.fullmatch(r'[A-F0-9]{8}', marca) is not None,
               'Código da etapa retomada não é da HU07-06')
    exigir(len(etapas) == 1, 'Etapa HU06 não persistiu de forma única')
    etapa_id = etapas[0]['id']
    saida['etapaCriada'] = etapa_id
    if retomar is None:
        saida['provas'].append('Etapa HU06 criada pelo formulário Next e persistida na API real')
    else:
        saida['retomadaDe'] = retomar.get('inicioUtc')
        saida['provas'].append('Etapa HU06 já criada pelo teste anterior; UUID confirmado em GET real (sem duplicação)')
    verificar_modal_etapa(page, painel, etapa_nome, saida)
    registros = []
    for n, tipo in enumerate(TIPOS, 1):
        # A UI pode mudar o tamanho da listagem após cada inserção.
        # A listagem de etapas abre detalhes; os entregáveis ficam no portal do modal.
        pagina_etapa = painel.get_by_role('button', name=re.compile(r'Abrir detalhes da etapa \d+: ' + re.escape(etapa_nome)))
        pagina_etapa.wait_for(state='visible', timeout=25000)
        pagina_etapa.click()
        detalhe_etapa = page.get_by_role('dialog', name=re.compile(r'^\d+\s*·\s*' + re.escape(etapa_nome) + r'$'))
        detalhe_etapa.wait_for(state='visible', timeout=15000)
        bloco = detalhe_etapa.get_by_role('region', name='Entregáveis da etapa')
        bloco.get_by_role('button', name='Novo entregável').click()
        form = page.get_by_role('form', name='Cadastrar entregável')
        try:
            form.wait_for(state='visible', timeout=12000)
        except Exception as erro:
            limite = page.get_by_role('dialog', name='Limite do peso operacional')
            if limite.count() and limite.is_visible():
                soma = sum(float(item.get('peso') or 0) for item in itens_api(page, api, contrato))
                raise AssertionError(
                    f'BUG FRONTEND: cadastro bloqueado pelo teto de pesos no modo SIMPLES; '
                    f'tipo={tipo}, soma={soma:.2f}%, contrato={contrato}'
                ) from erro
            raise
        if n == 1:
            responsavel = selecionar_responsavel_real(page, form, api, contrato, saida)
        else:
            responsavel = None
        codigo = f'Q706-{marca}-{n}'
        nome = f'QA HU07-06 {tipo} {marca}'
        form.locator('input[id$="-codigo"]').fill(codigo)
        form.locator('input[id$="-nome"]').fill(nome)
        form.locator('select[id$="-tipo"]').select_option(tipo)
        # A API exige data de início para TODOS os cinco tipos; para contínuo
        # e recorrente também é necessário explicitar o término.
        form.locator('input[id$="-inicioPrevisto"]').fill('2026-11-10')
        if tipo in ('CONTINUO', 'RECORRENTE'):
            form.locator('input[id$="-terminoPrevisto"]').fill('2026-12-10')
        form.locator('input[id$="-peso"]').fill('10.0000')
        if tipo == 'QUANTITATIVO':
            form.locator('input[id$="-quantidadePrevista"]').fill('2.500')
            form.locator('input[id$="-unidadeMedida"]').fill('unidades')
        if tipo == 'RECORRENTE':
            form.locator('select[id$="-periodicidade"]').select_option('MENSAL')
        if tipo in ('CONTINUO', 'MARCO'):
            form.locator('textarea[id$="-criterioConclusao"]').fill('Conclusão por comprovação de marco operacional')
        with page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path == rota(contrato)
                                  and r.status == 201, timeout=25000):
            form.get_by_role('button', name='Cadastrar entregável').click()
        # Exigir estado real da UI atualizado por hook de leitura.
        encontrados = [x for x in itens_api(page, api, contrato) if x.get('codigo') == codigo]
        exigir(len(encontrados) == 1, f'{tipo} não persistiu uma única vez')
        x = encontrados[0]
        verificar_atualizacao_entregaveis(bloco, nome, contrato, x['id'], saida)
        cadastrar_checklist_no_detalhe(page, api, contrato, x['id'], nome, bloco, saida,
                                      pode_alterar_obrigatoriedade=pode_alterar_obrigatoriedade)
        x = detalhe_api(page, api, contrato, x['id'])
        exigir(x['etapaId'] == etapa_id and x['tipo'] == tipo and len(x['evidenciasEsperadas']) == 2,
               f'Campos/checklist do tipo {tipo} não persistiram')
        if responsavel is not None:
            exigir(x.get('responsavelId') == responsavel['id'] and
                   (x.get('responsavel') or {}).get('email') == responsavel['email'],
                   'Responsável escolhido na UI não persistiu com nome/e-mail na API')
        esperado_flags = [False, True] if pode_alterar_obrigatoriedade else [True, True]
        exigir(sorted(i['obrigatoria'] for i in x['evidenciasEsperadas']) == esperado_flags,
               'Checklist persistido divergiu da permissão granular de obrigatoriedade')
        exigir(x['statusExecucao'] == 'NAO_INICIADO' and all(x[k] is None for k in ('percentualExecucao', 'situacaoComprovacao', 'quantidadeRealizada')),
               'Novo entregável deve iniciar sem progresso nem comprovação artificial')
        if tipo == 'RECORRENTE':
            exigir(x['periodicidade'] == 'MENSAL' and x['configuracaoPeriodicidade'] == {'versao': 1},
                   'Contrato de periodicidade incompatível com HU09')
        registros.append(x)
        saida['entregaveisCriados'].append({'id': x['id'], 'tipo': tipo, 'codigo': codigo})
        print('[OK] Cadastro UI → API Nest:', tipo, x['id'])
        detalhe_etapa.get_by_role('button', name='Voltar às etapas').click()
        detalhe_etapa.wait_for(state='detached', timeout=15000)
    saida['provas'].append('Cinco POSTs de entregáveis + dez POSTs de evidências esperadas via UI, com persistência')

    # Edição é exercida na tela de detalhe de cada tipo, e verificada após reload.
    for x in registros:
        id = x['id']
        page.goto(f'{web}/contratos/{quote(contrato)}/entregaveis/{quote(id)}', wait_until='domcontentloaded')
        page.get_by_role('heading', name=x['nome'], exact=True).wait_for(timeout=25000)
        page.get_by_role('tab', name='Evidências', exact=True).wait_for(timeout=20000)
        page.get_by_role('button', name='Editar entregável').click()
        form = page.get_by_role('form', name=f'Editar entregável {x["nome"]}')
        nome_novo = x['nome'] + ' validado'
        form.locator('input[id$="-nome"]').fill(nome_novo)
        # O campo da UI aceita no maximo 6 caracteres e 2 decimais em pt-BR.
        # Preencher 12.5000 (7 caracteres) violava o contrato do proprio input.
        entrada_peso = form.locator('input[id$="-peso"]')
        entrada_peso.fill('12,50')
        entrada_peso.blur()
        exigir(entrada_peso.input_value() == '12,50',
               f'Formulario nao conservou o peso 12,50: {entrada_peso.input_value()!r}')
        if x['tipo'] == 'QUANTITATIVO':
            form.locator('input[id$="-quantidadePrevista"]').fill('3.125')
        # A obrigatoriedade pertence à evidência, não ao PATCH de planejamento.
        caminho_detalhe = rota(contrato, id)
        # Capturar QUALQUER status. O servidor ja devolveu HTTP 400 aqui;
        # exigir somente 200 no predicado escondia a causa sob 25s de timeout.
        with page.expect_response(lambda r: r.request.method == 'PATCH' and urlsplit(r.url).path == caminho_detalhe,
                                  timeout=25000) as evento_planejamento:
            form.get_by_role('button', name='Salvar alterações').click()
        conferir_resposta_planejamento(evento_planejamento.value, id)
        page.get_by_role('heading', name=nome_novo, exact=True).wait_for(timeout=25000)
        # Segundo fluxo: editar o checklist documental individualmente.
        page.get_by_role('tab', name='Evidências', exact=True).click()
        evid_id = next(e['id'] for e in x['evidenciasEsperadas'] if e['tipoEvidencia'] == 'Relatório')
        page.get_by_role('button', name='Ver detalhes da evidência esperada Relatório', exact=True).click()
        modal_evidencia = page.get_by_role('dialog', name='Relatório', exact=True)
        modal_evidencia.wait_for(state='visible', timeout=15000)
        modal_evidencia.get_by_role('button', name='Editar orientações').wait_for(state='visible', timeout=15000)
        exigir(modal_evidencia.get_by_role('button', name='Editar evidência Relatório').count() == 0, 'Edição geral redundante ainda presente')
        check = modal_evidencia.get_by_role('checkbox', name='Evidência obrigatória')
        url_evidencia = rota(contrato, id) + '/evidencias-esperadas/' + evid_id
        if pode_alterar_obrigatoriedade:
            check.wait_for(state='visible', timeout=15000)
            with page.expect_response(lambda r: r.request.method == 'PATCH' and urlsplit(r.url).path == url_evidencia,
                                      timeout=25000) as edicao_obrigatoria:
                check.uncheck()
            exigir(edicao_obrigatoria.value.status == 200,
                   f'Obrigatoriedade não foi alterada pela API: HTTP {edicao_obrigatoria.value.status}')
            exigir(any(e['id'] == evid_id and e['obrigatoria'] is False
                       for e in detalhe_api(page, api, contrato, id)['evidenciasEsperadas']),
                   'Administrador: edição da obrigatoriedade não persistiu')
        else:
            exigir(check.count() == 0,
                   'Gestor sem delegação visualizou controle de obrigatoriedade ao editar evidência')
            # O gestor ainda deve poder EDITAR os campos para os quais foi autorizado.
            texto_editado = f'Exigência HU07-06: Relatório editado {x["codigo"]}'
            modal_evidencia.get_by_role('button', name='Editar orientações').click()
            modal_evidencia.get_by_label('Orientações da evidência').fill(texto_editado)
            with page.expect_response(lambda r: r.request.method == 'PATCH' and urlsplit(r.url).path == url_evidencia,
                                      timeout=25000) as edicao_orientacoes:
                modal_evidencia.get_by_role('button', name='Salvar orientações').click()
            exigir(edicao_orientacoes.value.status == 200,
                   f'Gestor não conseguiu editar orientações permitidas (HTTP {edicao_orientacoes.value.status})')
            atualizadas = detalhe_api(page, api, contrato, id)['evidenciasEsperadas']
            exigir(any(e['id'] == evid_id and e['descricao'] == texto_editado and e['obrigatoria'] is True
                       for e in atualizadas),
                   'Gestor não persistiu orientações ou modificou obrigatoriedade indevidamente')
            # Não confiar apenas na UI: o PATCH direto também deve falhar fechado.
            negada = requisitar(page, api, url_evidencia, 'PATCH', {'obrigatoria': False})
            exigir(negada['status'] == 403,
                   f'Gestor sem delegação conseguiu alterar obrigatoriedade via API (HTTP {negada["status"]})')
            preservada = detalhe_api(page, api, contrato, id)['evidenciasEsperadas']
            exigir(any(e['id'] == evid_id and e['obrigatoria'] is True for e in preservada),
                   'PATCH de obrigatoriedade negado alterou dados no PostgreSQL')
            saida['provas'].append('Gestor: PATCH de orientações permitido (200), PATCH de obrigatoriedade negado (403), sem mutação indevida')
        page.reload(wait_until='domcontentloaded')
        page.get_by_role('heading', name=nome_novo, exact=True).wait_for(timeout=25000)
        novo = detalhe_api(page, api, contrato, id)
        exigir(novo['nome'] == nome_novo and float(novo['peso']) == 12.5, 'PATCH de nome/peso não persistiu')
        exigir(novo['tipo'] == x['tipo'] and novo['etapaId'] == etapa_id, 'PATCH corrompeu tipo/vínculos')
        exigir(novo['codigo'] == x['codigo'], 'PATCH parcial apagou o código persistido do entregável')
        originais = {i['id']: i for i in x['evidenciasEsperadas']}
        posteriores = {i['id']: i for i in novo['evidenciasEsperadas']}
        exigir(set(originais) == set(posteriores), 'PATCH regenerou IDs de checklist esperado')
        esperado_total = 0 if pode_alterar_obrigatoriedade else 2
        exigir(sum(i['obrigatoria'] for i in posteriores.values()) == esperado_total,
               'Obrigatoriedade final divergiu das permissões e mutações permitidas')
        if x['tipo'] == 'QUANTITATIVO':
            exigir(float(novo['quantidadePrevista']) == 3.125, 'Quantidade editada não persistiu')
        registros[registros.index(x)] = novo
        print('[OK] Edição UI → PATCH → reload → GET:', x['tipo'])
    saida['provas'].append('Cinco PATCHs de planejamento e cinco PATCHs de evidência autorizados; reload, ACL, IDs estáveis e peso validados')
    return etapa_id, registros


def conferir_resposta_planejamento(resposta, entregavel_id: str) -> None:
    """Nao mascarar HTTP 400/403 como timeout ou sucesso de um PATCH real.

    Nunca registra cookies, cabecalhos, tokens nem objetos do usuario; apenas
    campos de planejamento sinteticos e mensagem de dominio da API.
    """
    if resposta.status == 200:
        return
    try:
        corpo = resposta.json()
        mensagem = corpo.get('message', corpo.get('error', 'sem mensagem')) if isinstance(corpo, dict) else 'sem mensagem JSON'
    except Exception:
        mensagem = 'sem resposta JSON'
    try:
        pedido = resposta.request.post_data_json
        campos = {k: pedido[k] for k in ('nome', 'peso', 'quantidadePrevista', 'inicioPrevisto',
                 'terminoPrevisto') if isinstance(pedido, dict) and k in pedido}
        chaves = sorted(k for k in pedido if k in ('nome', 'peso', 'quantidadePrevista', 'inicioPrevisto', 'terminoPrevisto', 'etapaId', 'tipo', 'codigo', 'descricao', 'responsavelId', 'periodicidade', 'configuracaoPeriodicidade', 'criterioConclusao', 'observacoes', 'unidadeMedida', 'evidenciasEsperadas')) if isinstance(pedido, dict) else []
    except Exception:
        campos, chaves = {}, []
    raise AssertionError(
        f'PATCH de planejamento rejeitado para entregavel {entregavel_id}: '
        f'HTTP {resposta.status}; API={str(mensagem)[:350]!r}; '
        f'campos_enviados={chaves}; valores_planejamento={campos}. '
        'Nao alterar backend ou expectativa de teste sem validar esta causa.'
    )


def validar_relatorio_retomada(arquivo: Path, contrato: str, perfil: str) -> dict:
    """Somente estágio confirmado, sem um único entregável criado no teste anterior."""
    dado = json.loads(arquivo.read_text(encoding='utf-8'))
    exigir(dado.get('contratoId') == contrato and dado.get('perfilSolicitado') == perfil,
           'Relatório de retomada pertence a outro contrato/perfil')
    exigir(dado.get('status') == 'REPROVADO' and UUID.fullmatch(dado.get('etapaCriada') or '')
           and dado.get('entregaveisCriados') == [],
           'Somente retomar relatório reprovado com etapa e zero entregáveis; evite duplicação')
    return dado


def main() -> int:
    args = argumentos()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print('ERRO: instale Playwright Python e Chromium; veja LEIA-PRIMEIRO.md', file=sys.stderr)
        return 2
    contrato = args.contrato_id.lower()
    api = args.api_url.rstrip('/')
    web = args.frontend_url.rstrip('/')
    raiz = Path(__file__).resolve().parents[2]
    retomar = None
    if args.retomar_relatorio:
        try:
            retomar = validar_relatorio_retomada(args.retomar_relatorio, contrato, args.perfil)
        except (ValueError, OSError, AssertionError) as exc:
            print(f'[HU07-06] Retomada bloqueada: {exc}', file=sys.stderr)
            return 2
    saida = {
        'hu': 'HU07-06', 'tipoTeste': 'NAVEGADOR_REAL_SEM_MOCK',
        'inicioUtc': datetime.now(timezone.utc).isoformat(),
        'perfilSolicitado': args.perfil, 'contratoId': contrato,
        'largura': args.largura, 'escrita': args.escrita,
        'etapaCriada': None, 'entregaveisCriados': [], 'provas': [],
        'rede': [], 'sqlValidado': False, 'status': 'EM_ANDAMENTO',
    }
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=False)
            context = browser.new_context(viewport={'width': args.largura, 'height': 860}, locale='pt-BR')
            page = context.new_page()
            # Registrar METADADOS de rede, nunca URL com query, cookies ou payload sensível.
            def vigiar(r):
                path = urlsplit(r.url).path
                if path.startswith(rota(contrato)) or path == f'/contratos/{contrato}/etapas':
                    saida['rede'].append({'metodo': r.request.method, 'caminho': path, 'http': r.status})
            page.on('response', vigiar)
            page.goto(web + '/login', wait_until='domcontentloaded')
            print('\n[HU07-06] Login REAL no Chromium, cenário:', args.perfil)
            email_esperado = None
            if args.login_automatico:
                email_esperado, senha = carregar_credenciais(args.perfil, args.credenciais_arquivo)
                try:
                    entrar_no_next(page, email_esperado, senha)
                finally:
                    del senha
                print('[HU07-06] Autenticação pelo formulário Next concluída (credencial privada local).')
            else:
                input('Entre na conta correspondente e confirme o dashboard; depois pressione ENTER: ')
            me = requisitar(page, api, '/usuarios/me')
            exigir(me['status'] == 200, f'Sessão SuperTokens inválida: HTTP {me["status"]}')
            if email_esperado:
                exigir(str(me['body'].get('email', '')).strip().casefold() == email_esperado.casefold(),
                       'A sessão autenticada não corresponde à conta configurada para este cenário')
            perfil = me['body'].get('perfil')
            esperado, pode_ler, pode_escrever = PERFIS[args.perfil]
            if esperado is not None:
                exigir(perfil == esperado, f'Perfil de teste errado: esperado {esperado}, veio {perfil}')
            else:
                exigir(perfil in ('GESTOR', 'COLABORADOR'), 'Sem vínculo deve ser gestor/colaborador')
            exigir(me['body'].get('ativo') is True, 'Usuário de domínio não está ativo')
            saida['provas'].append('Sessão real SuperTokens, usuário de domínio ativo e perfil validado')
            if perfil == 'ADMINISTRADOR':
                page.goto(f'{web}/usuario', wait_until='domcontentloaded')
                page.get_by_role('form', name='Alterar meu e-mail').wait_for(timeout=20000)
                page.get_by_role('form', name='Alterar minha senha').wait_for(timeout=20000)
                exigir(page.get_by_role('link', name='Voltar a Funcionários').count() == 0,
                       'Minha conta ainda contém o link Voltar a Funcionários')
                exigir(page.get_by_role('form', name='Alterar meu e-mail').get_by_label('Senha atual').count() == 1,
                       'Minha conta do Administrador não exige a senha atual')
                # DTO rejeita payload inválido ANTES de qualquer chamada de mutação/identidade.
                invalidos = requisitar(page, api, '/usuarios/me/email', 'PATCH', {'email': 'inválido'})
                exigir(invalidos['status'] == 400, 'Endpoint de credencial aceitou ausência de senha atual')
                saida['provas'].append('Administrador: Minha conta própria acessível, formulários protegidos e DTO rejeita ausência de senha')
                # O mesmo admin não deve ser gerenciável em Funcionários.
                # A busca no servidor pelo e-mail próprio cobre toda a paginação, não só a primeira página.
                email_admin = me['body']['email']
                consulta = requisitar(page, api,
                    '/admin/usuarios/consulta?ativo=true&pagina=1&limite=20&busca=' + quote(email_admin, safe=''))
                exigir(consulta['status'] == 200 and consulta['body'].get('total') == 0,
                       'A API de Funcionários ainda lista a conta do próprio Administrador')
                page.goto(web + '/admin/usuarios', wait_until='domcontentloaded')
                area_funcionarios = page.get_by_role('region', name='Funcionários')
                area_funcionarios.wait_for(timeout=20000)
                exigir(area_funcionarios.get_by_text(email_admin, exact=True).count() == 0,
                       'A interface Funcionários exibe a conta administrativa')
                saida['provas'].append('Administrador: conta própria ausente de Funcionários (API e interface); Minha conta separada')
            acesso = requisitar(page, api, f'/contratos/{quote(contrato)}/acesso')
            if pode_ler:
                exigir(acesso['status'] == 200 and bool(acesso['body'].get('podeEditar')) == pode_escrever,
                       f'Vínculo divergente para {args.perfil}: HTTP {acesso["status"]}, '
                       f'podeEditar={acesso.get("body", {}).get("podeEditar") if isinstance(acesso.get("body"), dict) else "indisponível"}; '
                       'configure o funcionário pelo e-mail antes de executar este cenário')
                pode_alterar_obrigatoriedade = validar_acesso_obrigatoriedade(acesso['body'], args.perfil)
                if pode_escrever:
                    saida['provas'].append(f'ACL consultada pela API: alterarObrigatoriedade={pode_alterar_obrigatoriedade} para {args.perfil}')
                else:
                    validar_acl_planejamento_leitor(acesso['body'], args.perfil)
                    saida['provas'].append('ACL de leitura confirmada sem delegações de criação/edição de etapas, entregáveis ou checklist')
            else:
                exigir(acesso['status'] in (403, 404), 'Perfil sem vínculo obteve permissão de contrato')
            caminho_lista = rota(contrato)
            if not pode_ler:
                r = requisitar(page, api, caminho_lista)
                exigir(r['status'] in (403, 404), 'Usuário sem vínculo consultou entregáveis!')
                r = requisitar(page, api, rota(contrato, args.entregavel_id))
                exigir(r['status'] in (403, 404), 'Usuário sem vínculo consultou detalhe!')
                saida['provas'].append('Sem vínculo: listagem e detalhe negados pela API real')
            elif not pode_escrever:
                # Primeiro obter o registro real, inclusive o ID da etapa, para
                # não confundir um contrato com várias etapas ou nomes iguais.
                detalhe = detalhe_api(page, api, contrato, args.entregavel_id)
                resposta_etapas = requisitar(page, api, f'/contratos/{quote(contrato)}/etapas')
                exigir(resposta_etapas['status'] == 200 and isinstance(resposta_etapas['body'], list),
                       f'Leitor não consultou etapas do contrato: HTTP {resposta_etapas["status"]}')
                correspondentes = [e for e in resposta_etapas['body'] if
                                  e.get('id') == detalhe['etapaId'] and e.get('contratoId') == contrato]
                exigir(len(correspondentes) == 1, 'Etapa do entregável ausente ou fora do contrato raiz')
                etapa = correspondentes[0]
                exigir(not etapa.get('arquivadoEm'), 'Entregável QA de leitura está em etapa arquivada')
                page.goto(f'{web}/contratos/{quote(contrato)}', wait_until='domcontentloaded')
                aba = page.get_by_role('tab', name='Etapas', exact=True)
                aba.wait_for(state='visible', timeout=25000)
                aba.click()
                exigir(aba.get_attribute('aria-selected') == 'true', 'Aba Etapas não selecionada no leitor')
                painel = page.locator('section[aria-labelledby="titulo-etapas"]')
                painel.wait_for(state='visible', timeout=25000)
                painel.get_by_role('tab', name='Ativas', exact=True).click()
                verificar_navegacao_leitor(page, painel, etapa, detalhe, contrato, saida)
                # Exercitar também a URL direta, sem confundi-la com o modal.
                page.goto(f'{web}/contratos/{quote(contrato)}/entregaveis/{quote(args.entregavel_id)}',
                          wait_until='domcontentloaded')
                page.get_by_role('heading', name=detalhe['nome'], exact=True).wait_for(timeout=25000)
                exigir(page.get_by_role('button', name='Editar entregável', exact=True).count() == 0,
                       'Rota direta do entregável expôs edição para perfil leitor')
                corpo_invalido = {'__qaTestePermissaoSemEscrita': True}
                post = requisitar(page, api, caminho_lista, 'POST', corpo_invalido)
                patch = requisitar(page, api, rota(contrato, args.entregavel_id), 'PATCH', corpo_invalido)
                exigir(post['status'] in (403, 404) and patch['status'] in (403, 404),
                       f'Backend permitiu POST/PATCH ou retornou status inesperado: {post["status"]}/{patch["status"]}')
                # 404 é a política deliberada do guard operacional para não revelar o recurso.
                saida['negacoesEscrita'] = {'POST': post['status'], 'PATCH': patch['status']}
                if args.validar_banco:
                    psql = consultar_pg_leitor(raiz, contrato, args.entregavel_id)
                    exigir(str(psql['id']) == args.entregavel_id and
                           str(psql['contrato_id']) == contrato and str(psql['etapa_id']) == detalhe['etapaId'],
                           'SQL/rota não correspondem a entregável, contrato e etapa solicitados')
                    saida['sqlValidado'] = True
                    saida['provas'].append('PostgreSQL direto: leitor comparou identificador, contrato e etapa')
                saida['provas'].append(f'Leitor: detalhe Next real, nenhuma ação de edição e POST/PATCH negados HTTP {post["status"]}/{patch["status"]}')
            else:
                if args.escrita:
                    etapa, registros = criar_cinco_na_ui(
                        page, api, web, contrato, saida, retomar,
                        pode_alterar_obrigatoriedade=pode_alterar_obrigatoriedade)
                    saida['idsEntregaveis'] = [x['id'] for x in registros]
                    if args.reiniciar_backend:
                        subprocess.run(['docker', 'compose', 'restart', 'backend'], cwd=raiz, check=True)
                        r = None
                        for _ in range(50):
                            r = requisitar(page, api, rota(contrato, registros[0]['id']))
                            if r['status'] == 200:
                                break
                            time.sleep(1)
                        exigir(r is not None and r['status'] == 200, 'Backend não voltou após restart')
                        saida['provas'].append('Backend reiniciado sem apagar volumes; API voltou e dados persistiram')
                    # Anti-IDOR: entidade válida de contrato A não pode ser consultada pelo pai B.
                    if args.outro_contrato_id:
                        outro = args.outro_contrato_id.lower()
                        r = requisitar(page, api, rota(outro, registros[0]['id']))
                        exigir(r['status'] in (403, 404), f'Detalhe aninhado entre contratos vazou (HTTP {r["status"]})')
                        saida['provas'].append('IDOR: ID real de entregável não pode ser usado sob outro contrato')
                    for x in registros:
                        reconsultado = detalhe_api(page, api, contrato, x['id'])
                        exigir(reconsultado == x, 'Dados mudaram após recarregar/reiniciar')
                    lista = itens_api(page, api, contrato)
                    exigir(all(sum(1 for y in lista if y['id'] == x['id']) == 1 for x in registros),
                           'GET do contrato perdeu ou duplicou item criado')
                    if args.validar_banco:
                        pg = pg_direto(raiz, contrato, etapa, [x['id'] for x in registros])
                        conferir_db_por_api(pg, registros, etapa)
                        saida['sqlValidado'] = True
                        saida['provas'].append('PostgreSQL direto: vínculos, tipos, checklist, status NULL, auditoria e parâmetros HU09/TEC09')
                    saida['provas'].append('GET real pós-reload: cinco entregáveis únicos, sem duplicidade')
                else:
                    r = detalhe_api(page, api, contrato, args.entregavel_id)
                    page.goto(f'{web}/contratos/{quote(contrato)}/entregaveis/{quote(args.entregavel_id)}',
                              wait_until='domcontentloaded')
                    page.get_by_role('heading', name=r['nome'], exact=True).wait_for(timeout=25000)
                    exigir(page.get_by_role('button', name='Editar entregável').count() == 1,
                           'Perfil editor não pode abrir o formulário no detalhe')
                    saida['provas'].append('Editor: consulta real e botão de edição no Next habilitado')
            # Rede observada: provar UI efetivamente chamou backend, não mock.
            if args.escrita:
                metodos = [r['metodo'] for r in saida['rede'] if r['caminho'].startswith(caminho_lista)]
                exigir(metodos.count('POST') >= 5 and metodos.count('PATCH') >= 5,
                       'Não foram observados cinco POST e cinco PATCH reais no tráfego do Chromium')
                saida['provas'].append('Network Chromium: POST×5 e PATCH×5 sem interceptação ou mock')
            page.get_by_role('button', name='Sair', exact=True).click()
            confirmacao_saida = page.get_by_role('dialog', name='Sair da conta?')
            confirmacao_saida.wait_for(state='visible', timeout=15000)
            confirmacao_saida.get_by_role('button', name='Sair da conta', exact=True).click()
            page.get_by_role('heading', name='Acesse sua conta').wait_for(timeout=20000)
            r = requisitar(page, api, caminho_lista)
            exigir(r['status'] == 401, f'Após logout real a API deveria responder 401; veio {r["status"]}')
            saida['provas'].append('Logout SuperTokens real: GET após logout retorna HTTP 401')
            context.close()
            browser.close()
        saida['status'] = 'APROVADO'
        return 0
    except Exception as exc:
        saida['status'] = 'REPROVADO'
        saida['erro'] = str(exc)[:900]
        print('[FALHA HU07-06]', exc, file=sys.stderr)
        return 1
    finally:
        saida['fimUtc'] = datetime.now(timezone.utc).isoformat()
        saida['totalProvas'] = len(saida['provas'])
        print(f'\n[HU07-06] {args.perfil}: {saida["status"]}, {saida["totalProvas"]} provas')
        if args.saida:
            try:
                args.saida.parent.mkdir(parents=True, exist_ok=True)
                with args.saida.open('x', encoding='utf-8') as f:
                    json.dump(saida, f, ensure_ascii=False, indent=2)
                    f.write('\n')
                args.saida.chmod(0o600)
                print('[HU07-06] Relatório:', args.saida)
            except OSError as exc:
                print('[AVISO] Falha ao salvar evidência:', exc, file=sys.stderr)


def consultar_pg_leitor(raiz: Path, contrato: str, entregavel: str) -> dict:
    """SQL independente para confirmar que o ID visto no Next é persistido."""
    js = r'''
      import pg from 'pg';
      const db = new pg.Client({connectionString: process.env.DATABASE_URL});
      try {
        await db.connect();
        const r = await db.query('SELECT id, contrato_id, etapa_id FROM entregaveis WHERE contrato_id=$1 AND id=$2',
          [process.argv[1], process.argv[2]]);
        process.stdout.write(JSON.stringify(r.rows[0] || null));
      } finally {await db.end();}
    '''
    cmd = ['docker', 'compose', 'exec', '-T', 'backend', 'node', '--input-type=module', '-e', js,
           contrato, entregavel]
    res = subprocess.run(cmd, cwd=raiz, capture_output=True, text=True, check=False)
    exigir(res.returncode == 0, 'SELECT leitor falhou: ' + res.stderr[:300])
    registro = json.loads(res.stdout)
    exigir(bool(registro), 'SELECT direto não encontrou entregável')
    return registro


if __name__ == '__main__':
    sys.exit(main())
