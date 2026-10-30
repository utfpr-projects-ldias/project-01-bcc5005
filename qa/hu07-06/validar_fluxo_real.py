#!/usr/bin/env python3
"""HU07-06 — integração verificável pelo navegador Next + SuperTokens + Nest + PostgreSQL.

Sessões são criadas por login humano no Chromium; cookies/senhas/tokens não são
armazenados ou impressos. Gravações ficam no contrato indicado, somente com opt-in.
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
    p.add_argument('--outro-contrato-id', help='Contrato adicional para comprovar anti-IDOR')
    p.add_argument('--validar-banco', action='store_true', help='Conferência SQL de leitura no PostgreSQL do ambiente DEV')
    p.add_argument('--reiniciar-backend', action='store_true', help='Reinicia APENAS o container backend; requer --escrita')
    p.add_argument('--frontend-url', default='http://localhost:3000')
    p.add_argument('--api-url', default='http://localhost:3001')
    p.add_argument('--largura', type=int, default=1280)
    p.add_argument('--saida', type=Path, help='Arquivo JSON exclusivo para evidências; não armazena tokens ou senhas')
    a = p.parse_args()
    for arg in ('contrato_id', 'entregavel_id', 'outro_contrato_id'):
        v = getattr(a, arg)
        if v and not UUID.fullmatch(v):
            p.error(f'--{arg.replace("_", "-")} precisa ser UUID válido')
    if a.escrita and (not a.confirmar_persistencia or not PERFIS[a.perfil][2]):
        p.error('--escrita exige --confirmar-persistencia e perfil administrador/gestor-edicao')
    if a.reiniciar_backend and not a.escrita:
        p.error('--reiniciar-backend só é permitido no cenário de escrita')
    if not a.escrita and not a.entregavel_id:
        p.error('cenários de leitura/negação exigem --entregavel-id de um registro de QA existente')
    if a.largura < 320 or a.largura > 2560:
        p.error('--largura deve estar entre 320 e 2560')
    for arg in ('frontend_url', 'api_url'):
        v = urlsplit(getattr(a, arg))
        if v.scheme not in ('http', 'https') or not v.netloc or v.query or v.fragment:
            p.error(f'URL inválida: --{arg.replace("_", "-")}')
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
        const es = await db.query(`SELECT e.id, e.contrato_id, e.etapa_id, e.nome, e.codigo, e.tipo,
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


def preencher_checklist(form, marca: str, tipo: str) -> None:
    for i in range(2):
        form.get_by_role('button', name=re.compile('Adicionar evidência esperada')).click()
        form.locator('fieldset input[id*="-ev-"][id$="-tipo"]').nth(i).fill(f'HU706 {tipo} {marca} {"Relatório" if i == 0 else "Foto"}')
        form.locator('fieldset textarea[id*="-ev-"][id$="-descricao"]').nth(i).fill(f'Item QA {i + 1} do tipo {tipo}')
        if i == 0:
            form.locator('fieldset input[type="checkbox"]').nth(0).check()


def criar_cinco_na_ui(page, api: str, web: str, contrato: str, saida: dict) -> tuple[str, list[dict]]:
    """TODOS os POSTs partem dos botões da interface Next — não do validador."""
    marca = secrets.token_hex(4).upper()
    etapa_nome = f'QA HU07-06 Etapa {marca}'
    etapa_codigo = f'QA706-{marca}'
    page.goto(f'{web}/contratos/{quote(contrato)}', wait_until='domcontentloaded')
    painel = page.locator('section[aria-labelledby="titulo-etapas"]')
    painel.wait_for(timeout=25000)
    painel.get_by_role('button', name='Nova etapa').click()
    form = painel.get_by_role('form', name='Criar etapa')
    form.locator('#etapa-nome').fill(etapa_nome)
    form.locator('#etapa-codigo').fill(etapa_codigo)
    caminho_etapas = f'/contratos/{quote(contrato)}/etapas'
    with page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path == caminho_etapas
                              and r.status == 201, timeout=25000):
        form.get_by_role('button', name='Salvar etapa').click()
    resp = requisitar(page, api, caminho_etapas)
    exigir(resp['status'] == 200 and isinstance(resp['body'], list), 'Falha ao consultar etapa recém-criada')
    etapas = [e for e in resp['body'] if e.get('nome') == etapa_nome and e.get('codigo') == etapa_codigo]
    exigir(len(etapas) == 1, 'Etapa real HU06 não persistiu corretamente')
    etapa_id = etapas[0]['id']
    saida['etapaCriada'] = etapa_id
    saida['provas'].append('Etapa HU06 criada pelo formulário Next e persistida na API real')
    registros = []
    for n, tipo in enumerate(TIPOS, 1):
        # A UI pode mudar o tamanho da listagem após cada inserção.
        pagina_etapa = page.locator('ol[aria-label="Etapas em ordem de execução"] > li').filter(
            has=page.get_by_role('heading', name=etapa_nome, exact=True))
        pagina_etapa.wait_for(timeout=25000)
        bloco = pagina_etapa.locator('section[aria-label="Entregáveis da etapa"]')
        bloco.get_by_role('button', name='Novo entregável').click()
        form = bloco.get_by_role('form', name='Cadastrar entregável')
        codigo = f'QA706-{marca}-{n}'
        nome = f'QA HU07-06 {tipo} {marca}'
        form.locator('input[id$="-codigo"]').fill(codigo)
        form.locator('input[id$="-nome"]').fill(nome)
        form.locator('select[id$="-tipo"]').select_option(tipo)
        form.locator('input[id$="-peso"]').fill('10.0000')
        if tipo == 'QUANTITATIVO':
            form.locator('input[id$="-quantidadePrevista"]').fill('2.500')
            form.locator('input[id$="-unidadeMedida"]').fill('unidades')
        if tipo == 'RECORRENTE':
            form.locator('select[id$="-periodicidade"]').select_option('MENSAL')
        if tipo in ('CONTINUO', 'MARCO'):
            form.locator('textarea[id$="-criterioConclusao"]').fill('Conclusão por comprovação de marco operacional')
        preencher_checklist(form, marca, tipo)
        with page.expect_response(lambda r: r.request.method == 'POST' and urlsplit(r.url).path == rota(contrato)
                                  and r.status == 201, timeout=25000):
            form.get_by_role('button', name='Cadastrar entregável').click()
        # Exigir estado real da UI atualizado por hook de leitura.
        bloco.get_by_role('link', name=nome, exact=True).wait_for(timeout=25000)
        encontrados = [x for x in itens_api(page, api, contrato) if x.get('codigo') == codigo]
        exigir(len(encontrados) == 1, f'{tipo} não persistiu uma única vez')
        x = encontrados[0]
        exigir(x['etapaId'] == etapa_id and x['tipo'] == tipo and len(x['evidenciasEsperadas']) == 2,
               f'Campos/checklist do tipo {tipo} não persistiram')
        exigir(sorted(i['obrigatoria'] for i in x['evidenciasEsperadas']) == [False, True],
               'Checklist obrigatório/opcional incorreto')
        exigir(all(x[k] is None for k in ('statusExecucao', 'percentualExecucao', 'situacaoComprovacao', 'quantidadeRealizada')),
               'Planejamento não pode criar status de execução/comprovação')
        if tipo == 'RECORRENTE':
            exigir(x['periodicidade'] == 'MENSAL' and x['configuracaoPeriodicidade'] == {'versao': 1},
                   'Contrato de periodicidade incompatível com HU09')
        registros.append(x)
        saida['entregaveisCriados'].append({'id': x['id'], 'tipo': tipo, 'codigo': codigo})
        print('[OK] Cadastro UI → API Nest:', tipo, x['id'])
    saida['provas'].append('Cinco POST reais pelo Next (todos os tipos, checklist 2 itens, persistência)')

    # Edição é exercida na tela de detalhe de cada tipo, e verificada após reload.
    for x in registros:
        id = x['id']
        page.goto(f'{web}/contratos/{quote(contrato)}/entregaveis/{quote(id)}', wait_until='domcontentloaded')
        page.get_by_role('heading', name=x['nome'], exact=True).wait_for(timeout=25000)
        page.get_by_role('heading', name='Evidências esperadas').wait_for()
        page.get_by_role('button', name='Editar entregável').click()
        form = page.get_by_role('form', name=f'Editar entregável {x["nome"]}')
        nome_novo = x['nome'] + ' validado'
        form.locator('input[id$="-nome"]').fill(nome_novo)
        form.locator('input[id$="-peso"]').fill('12.5000')
        if x['tipo'] == 'QUANTITATIVO':
            form.locator('input[id$="-quantidadePrevista"]').fill('3.125')
        # Toggle da obrigatoriedade de item EXISTENTE, sem perda do respectivo UUID.
        form.locator('fieldset input[type="checkbox"]:checked').first.uncheck()
        caminho_detalhe = rota(contrato, id)
        with page.expect_response(lambda r: r.request.method == 'PATCH' and urlsplit(r.url).path == caminho_detalhe
                                  and r.status == 200, timeout=25000):
            form.get_by_role('button', name='Salvar alterações').click()
        page.get_by_role('heading', name=nome_novo, exact=True).wait_for(timeout=25000)
        page.reload(wait_until='domcontentloaded')
        page.get_by_role('heading', name=nome_novo, exact=True).wait_for(timeout=25000)
        novo = detalhe_api(page, api, contrato, id)
        exigir(novo['nome'] == nome_novo and float(novo['peso']) == 12.5, 'PATCH de nome/peso não persistiu')
        exigir(novo['tipo'] == x['tipo'] and novo['etapaId'] == etapa_id, 'PATCH corrompeu tipo/vínculos')
        originais = {i['id']: i for i in x['evidenciasEsperadas']}
        posteriores = {i['id']: i for i in novo['evidenciasEsperadas']}
        exigir(set(originais) == set(posteriores), 'PATCH regenerou IDs de checklist esperado')
        exigir(sum(i['obrigatoria'] for i in posteriores.values()) == 0, 'PATCH não atualizou obrigatoriedade')
        if x['tipo'] == 'QUANTITATIVO':
            exigir(float(novo['quantidadePrevista']) == 3.125, 'Quantidade editada não persistiu')
        registros[registros.index(x)] = novo
        print('[OK] Edição UI → PATCH → reload → GET:', x['tipo'])
    saida['provas'].append('Cinco PATCH reais na UI, reload, IDs de checklist estáveis e peso operacional')
    return etapa_id, registros


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
    saida = {
        'hu': 'HU07-06', 'tipoTeste': 'NAVEGADOR_REAL_SEM_MOCK',
        'inicioUtc': datetime.now(timezone.utc).isoformat(),
        'perfilSolicitado': args.perfil, 'contratoId': contrato,
        'largura': args.largura, 'escrita': args.escrita,
        'etapaCriada': None, 'entregaveisCriados': [], 'provas': [],
        'rede': [], 'status': 'EM_ANDAMENTO',
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
            print('\n[HU07-06] Login REAL no Chromium, usuário de teste:', args.perfil)
            input('Entre na conta correspondente e confirme o dashboard; depois pressione ENTER: ')
            me = requisitar(page, api, '/usuarios/me')
            exigir(me['status'] == 200, f'Sessão SuperTokens inválida: HTTP {me["status"]}')
            perfil = me['body'].get('perfil')
            esperado, pode_ler, pode_escrever = PERFIS[args.perfil]
            if esperado is not None:
                exigir(perfil == esperado, f'Perfil de teste errado: esperado {esperado}, veio {perfil}')
            else:
                exigir(perfil in ('GESTOR', 'COLABORADOR'), 'Sem vínculo deve ser gestor/colaborador')
            exigir(me['body'].get('ativo') is True, 'Usuário de domínio não está ativo')
            saida['provas'].append('Sessão real SuperTokens, usuário de domínio ativo e perfil validado')
            acesso = requisitar(page, api, f'/contratos/{quote(contrato)}/acesso')
            if pode_ler:
                exigir(acesso['status'] == 200 and bool(acesso['body'].get('podeEditar')) == pode_escrever,
                       'Acesso ao contrato não corresponde ao cenário; confira vínculo/podeEditar')
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
                page.goto(f'{web}/contratos/{quote(contrato)}', wait_until='domcontentloaded')
                painel = page.locator('section[aria-labelledby="titulo-etapas"]')
                painel.wait_for(timeout=25000)
                page.get_by_text('Entregáveis planejados').first.wait_for(timeout=25000)
                exigir(painel.get_by_role('button', name='Novo entregável').count() == 0,
                       'UI mostrou cadastro para perfil somente leitura')
                page.goto(f'{web}/contratos/{quote(contrato)}/entregaveis/{quote(args.entregavel_id)}',
                          wait_until='domcontentloaded')
                detalhe = detalhe_api(page, api, contrato, args.entregavel_id)
                page.get_by_role('heading', name=detalhe['nome'], exact=True).wait_for(timeout=25000)
                exigir(page.get_by_role('button', name='Editar entregável').count() == 0,
                       'UI mostrou edição para perfil somente leitura')
                etapa = detalhe['etapaId']
                corpo_invalido = {'__qaTestePermissaoSemEscrita': True}
                post = requisitar(page, api, caminho_lista, 'POST', corpo_invalido)
                patch = requisitar(page, api, rota(contrato, args.entregavel_id), 'PATCH', corpo_invalido)
                exigir(post['status'] == 403 and patch['status'] == 403,
                       f'Backend deveria bloquear POST/PATCH antes de validar body: {post["status"]}/{patch["status"]}')
                if args.validar_banco:
                    # Para papel de leitura, apenas consulta livre de efeitos colaterais; auditoria não é exigida.
                    psql = consultar_pg_leitor(raiz, contrato, args.entregavel_id)
                    exigir(psql['id'] == args.entregavel_id and psql['etapa_id'] == etapa,
                           'SQL/rota não correspondem ao entregável solicitado')
                saida['provas'].append('Leitor: detalhe Next real, nenhuma ação de edição e POST/PATCH HTTP 403')
            else:
                if args.escrita:
                    etapa, registros = criar_cinco_na_ui(page, api, web, contrato, saida)
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
