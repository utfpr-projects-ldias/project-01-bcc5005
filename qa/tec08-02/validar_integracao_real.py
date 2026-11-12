#!/usr/bin/env python3
"""TEC08-02: QA real automatizado via Chromium/Next/SuperTokens/Nest/PostgreSQL.

Cria dois contratos e dois documentos sintéticos, verifica política por perfil, IDOR,
metadados, hashes e auditoria. Os registros ficam no BD DEV (sem DELETE de contrato),
enquanto os vínculos temporários são revogados ao terminar. Não captura segredos.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import time
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen

RAIZ = Path(__file__).resolve().parents[2]
HU07 = RAIZ / 'qa' / 'hu07-06'
sys.path.insert(0, str(HU07))
from credenciais_locais import carregar_credenciais, entrar_no_next  # noqa: E402
from validar_fluxo_real import requisitar  # noqa: E402

BASE_WEB = 'http://localhost:3000'
BASE_API = 'http://localhost:3001'
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.I)
ARQ = b'QA-TEC08-02: arquivo sint\xc3\xa9tico verific\xc3\xa1vel\n'
ARQ_GESTOR = b'QA-TEC08-02: teste gestor\n'


def exigir(condicao, mensagem):
    if not condicao:
        raise AssertionError(mensagem)


def uuid_ok(valor):
    return isinstance(valor, str) and bool(UUID.fullmatch(valor))


def aceitar(status, esperados, descricao):
    exigir(status in esperados, f'{descricao}: HTTP {status}, esperado {sorted(esperados)}')


def argumento():
    p = argparse.ArgumentParser(description='QA REAL TEC08-02: sem IDs e sem tokens colados')
    p.add_argument('--verificar', action='store_true', help='Somente leitura: serviços, credenciais e migration')
    p.add_argument('--executar', action='store_true', help='Executar ciclo real completo de QA')
    p.add_argument('--confirmar-persistencia', action='store_true',
                   help='Consinto em criar dois contratos e dois documentos sintéticos permanentes no banco DEV')
    a = p.parse_args()
    if a.verificar == a.executar:
        p.error('Escolha exatamente um: --verificar ou --executar')
    if a.executar and not a.confirmar_persistencia:
        p.error('--executar requer --confirmar-persistencia: os registros de QA são permanentes')
    return a


def aguardar_http(nome, url, esperados, limite_segundos=120, intervalo_segundos=2):
    """Espera serviços após restart: nunca transforma HTTP401/403 inesperado em sucesso.

    Refaz somente consultas GET idempotentes de prontidão. Conexão recusada/resetada,
    respostas 502/503/504 e timeout indicam que o serviço pode estar reiniciando.
    Falhas HTTP estáveis, como 200 numa rota protegida, reprovam imediatamente.
    """
    inicio = time.monotonic()
    ultima = 'sem tentativa'
    avisou = False
    while True:
        try:
            with urlopen(url, timeout=5) as resposta:
                status = resposta.status
        except HTTPError as erro:
            status = erro.code
            ultima = f'HTTP {status}'
        except (URLError, TimeoutError, ConnectionError, OSError,
                http.client.HTTPException) as erro:
            status = 0
            ultima = type(erro).__name__  # não incluir URL com credenciais ou corpo de resposta
        else:
            ultima = f'HTTP {status}'
        if status in esperados:
            if avisou:
                print(f'[TEC08-02] {nome}: pronto após reinicialização')
            return status
        if status not in (0, 502, 503, 504):
            raise AssertionError(f'{nome}: HTTP {status}; esperado {sorted(esperados)}')
        if time.monotonic() - inicio >= limite_segundos:
            raise AssertionError(f'{nome}: indisponível após {limite_segundos}s; última resposta: {ultima}')
        if not avisou:
            print(f'[TEC08-02] Aguardando {nome} ficar pronto após o restart...')
            avisou = True
        time.sleep(intervalo_segundos)


def preflight():
    # Ordem intencional: primeiro Nest público, depois Next, depois a política sem sessão.
    # Se backend reiniciar entre duas chamadas, cada uma fará suas próprias tentativas.
    aguardar_http('Nest público', BASE_API + '/', {200})
    aguardar_http('Next login', BASE_WEB + '/login', {200})
    aguardar_http('GET documentos sem sessão',
                 BASE_API + '/contratos/00000000-0000-4000-8000-000000000000/documentos', {401})
    mig = subprocess.run(['docker', 'compose', 'exec', '-T', 'backend', 'npm', 'run', 'migration:show'],
                         cwd=RAIZ, text=True, capture_output=True, timeout=90, check=False)
    exigir(mig.returncode == 0, 'Falha ao consultar migrations no backend')
    exigir(re.search(r'^\[X\]\s+11 CriarDocumentosContratuais1793900000000', mig.stdout, flags=re.M) is not None,
           'Migration TEC08-02 não aparece como [X]')
    exigir(not re.search(r'^\[\s\]\s', mig.stdout, flags=re.M), 'Existem migrations pendentes')
    contas = {}
    for perfil in ('administrador', 'gestor-edicao', 'colaborador'):
        email, senha = carregar_credenciais(perfil)
        contas[perfil] = (email, senha)
    exigir(len({v[0].casefold() for v in contas.values()}) == 3,
           'QA exige três contas distintas: ADMIN, GESTOR, COLABORADOR')
    try:
        import playwright.sync_api  # noqa: F401
    except ImportError as e:
        raise AssertionError('Playwright não encontrado: utilize o venv existente de qa/hu07-06') from e
    return contas


def nova_sessao(browser, perfil, contas):
    ctx = browser.new_context(locale='pt-BR', viewport={'width': 1280, 'height': 850})
    page = ctx.new_page()
    page.goto(BASE_WEB + '/login', wait_until='domcontentloaded', timeout=30000)
    email, senha = contas[perfil]
    entrar_no_next(page, email, senha)
    usuario = requisitar(page, BASE_API, '/usuarios/me')
    exigir(usuario['status'] == 200 and isinstance(usuario['body'], dict), 'Login real não gerou usuário de domínio')
    exigir(usuario['body'].get('ativo') is True, 'Conta do QA está inativa')
    exigir(str(usuario['body'].get('email', '')).casefold() == email.casefold(), 'Sessão diverge do arquivo privado')
    esperado = {'administrador': 'ADMINISTRADOR', 'gestor-edicao': 'GESTOR', 'colaborador': 'COLABORADOR'}[perfil]
    exigir(usuario['body'].get('perfil') == esperado, f'Perfil de domínio diferente do esperado: {perfil}')
    exigir(uuid_ok(usuario['body'].get('id')), 'Usuário autenticado sem UUID de domínio')
    return ctx, page, usuario['body']


def api(page, caminho, metodo='GET', corpo=None):
    return requisitar(page, BASE_API, caminho, metodo, corpo)


def documento_base(contrato):
    exigir(uuid_ok(contrato), 'Contrato UUID inválido')
    return f'/contratos/{contrato}/documentos'


def criar_contrato(page, rotulo):
    obj = {
        'numeroContrato': f'QA-TEC08-02-{rotulo}', 'orgaoContratante': 'LABORATORIO QA TEC08-02',
        'objeto': 'TESTE AUTOMATIZADO DEV - NAO USAR COMO CONTRATO REAL',
        'inicioVigencia': '2026-01-01', 'terminoVigencia': '2027-12-31',
        'status': 'PLANEJAMENTO', 'modoCalculo': 'SIMPLES',
        'observacoes': 'QA permanente da TEC08-02; rastreabilidade de testes automatizados',
    }
    r = api(page, '/contratos', 'POST', obj)
    aceitar(r['status'], {201}, 'Cadastro de contrato sintético')
    exigir(isinstance(r['body'], dict) and uuid_ok(r['body'].get('id')), 'Contrato não retornou UUID')
    return r['body']['id']


def upload(page, contrato, dados, nome, categoria='ANEXO'):
    """Multipart + download via fetch real no Chromium com sessão ST; não exporta token."""
    return page.evaluate('''async ({url, texto, nome, categoria}) => {
      try {
        const dados = new TextEncoder().encode(texto);
        const arquivo = new File([dados], nome, {type:'text/plain'});
        const form = new FormData();
        form.append('arquivo', arquivo); form.append('categoria', categoria);
        form.append('descricao', 'QA automatizado TEC08-02');
        const resposta = await fetch(url, {method:'POST', credentials:'include', body:form, cache:'no-store'});
        let doc = null; try {doc = await resposta.json()} catch {}
        if (!resposta.ok) return {upload:resposta.status};
        const down = await fetch(`${url}/${encodeURIComponent(doc.id)}/download`, {credentials:'include', cache:'no-store'});
        const bytes = down.ok ? await down.arrayBuffer() : new ArrayBuffer(0);
        const sha = async data => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
          .map(v=>v.toString(16).padStart(2,'0')).join('');
        return {upload:resposta.status, download:down.status, documento:doc,
          shaIgual:down.ok && (await sha(bytes)) === (await sha(dados)), tamanho:bytes.byteLength,
          cabecalhos: {nosniff:down.headers.get('X-Content-Type-Options'),
                      cache:down.headers.get('Cache-Control'),
                      disposicao:down.headers.get('Content-Disposition')}};
      } catch(e) {return {erro: String(e).slice(0,200)}};
    }''', {'url': BASE_API + documento_base(contrato), 'texto': dados.decode('utf-8'),
           'nome': nome, 'categoria': categoria})


def upload_negado(page, contrato):
    return page.evaluate('''async url => {
      try {
        const form = new FormData();
        form.append('arquivo', new File(['QA'], 'negado.txt', {type:'text/plain'}));
        form.append('categoria', 'ANEXO');
        const r = await fetch(url, {method:'POST', body:form, credentials:'include', cache:'no-store'});
        return r.status;
      } catch(e) { return 0; }
    }''', BASE_API + documento_base(contrato))


def upload_disfarcado(page, contrato):
    """Extensão/MIME PDF declarados, mas assinatura de PDF ausente: deve falhar."""
    return page.evaluate('''async url => {
      try {
        const form = new FormData();
        form.append('arquivo', new File(['isto nao eh um PDF'], 'qa-falso.pdf', {type:'application/pdf'}));
        form.append('categoria', 'ANEXO');
        const r = await fetch(url, {method:'POST', body:form, credentials:'include', cache:'no-store'});
        return r.status;
      } catch(e) { return 0; }
    }''', BASE_API + documento_base(contrato))


def sql_verificar(documentos):
    """Query real READ ONLY no container; resultados sem storage_key, cookies, senhas ou email."""
    codigo = r'''
    import pg from 'pg';
    const db = new pg.Client({connectionString:process.env.DATABASE_URL});
    try {
      await db.connect(); await db.query('BEGIN READ ONLY');
      const ids = JSON.parse(process.argv[1]);
      const r = await db.query(`
        SELECT d.id, d.contrato_id, d.autor_id, d.categoria, d.tipo_mime,
               d.tamanho, d.sha256,
               (SELECT COUNT(*)::int FROM eventos_auditoria e
                 WHERE e.entidade_tipo='DOCUMENTO' AND e.entidade_id=d.id::text
                   AND e.acao='DOCUMENTO_ANEXADO' AND e.contrato_id=d.contrato_id
                   AND NOT COALESCE(e.dados_posteriores ? 'storageKey', false)) AS eventos_corretos,
               (SELECT COUNT(*)::int FROM eventos_auditoria e
                 WHERE e.entidade_tipo='DOCUMENTO' AND e.entidade_id=d.id::text
                   AND e.acao='DOCUMENTO_ANEXADO') AS eventos_total
        FROM documentos_contratuais d WHERE d.id=ANY($1::uuid[])
      `,[ids]);
      process.stdout.write(JSON.stringify(r.rows)); await db.query('COMMIT');
    } finally {await db.end()}
    '''
    ret = subprocess.run(['docker', 'compose', 'exec', '-T', 'backend',
                          'node', '--input-type=module', '-e', codigo, json.dumps(documentos)],
                         cwd=RAIZ, capture_output=True, text=True, check=False, timeout=45)
    exigir(ret.returncode == 0, 'Verificação SQL read-only falhou (consultar serviços Docker)')
    try:
        return json.loads(ret.stdout)
    except ValueError as e:
        raise AssertionError('Consulta SQL não retornou JSON válido') from e


def conferir_sql(linhas, docs):
    encontrados = {str(l['id']): l for l in linhas}
    exigir(set(encontrados) == set(docs), 'SQL não encontrou os dois documentos de QA')
    for id_doc, esperado in docs.items():
        linha = encontrados[id_doc]
        for chave, valor in [('contrato_id', esperado['contrato']), ('autor_id', esperado['autor']),
                              ('categoria', 'ANEXO'), ('tipo_mime', 'text/plain'),
                              ('tamanho', len(esperado['bytes'])),
                              ('sha256', hashlib.sha256(esperado['bytes']).hexdigest())]:
            exigir(str(linha.get(chave)) == str(valor), f'Divergência SQL {chave} no documento {id_doc}')
        exigir(linha['eventos_total'] == 1 and linha['eventos_corretos'] == 1,
               'Auditoria documental não é transacional/coerente ou contém storageKey')


def grant(page_admin, pessoa, contrato, editar):
    caminho = f'/admin/usuarios/{pessoa}/permissoes'
    consulta = api(page_admin, caminho)
    aceitar(consulta['status'], {200}, 'Consulta de vínculo antes de alteração')
    exigir(isinstance(consulta['body'], list), 'API de permissões não retornou array')
    exigir(not any(x.get('contratoId') == contrato for x in consulta['body']),
           'Contrato QA recém-criado já tem vínculo inesperado; abortando alteração')
    r = api(page_admin, caminho, 'PUT', {'contratoId': contrato, 'podeEditar': editar})
    aceitar(r['status'], {200, 201}, 'Conceder vínculo temporário')
    posterior = api(page_admin, caminho)
    aceitar(posterior['status'], {200}, 'Consulta vínculo após concessão')
    exigir(any(x.get('contratoId') == contrato and bool(x.get('podeEditar')) == editar
               for x in posterior['body']), 'Vínculo não persistiu como esperado')


def revogar(page_admin, pessoa, contrato):
    r = api(page_admin, f'/admin/usuarios/{pessoa}/permissoes/{contrato}', 'DELETE')
    aceitar(r['status'], {204}, 'Revogação de vínculo temporário')


def ciclo(args, contas):
    from playwright.sync_api import sync_playwright
    id_exec = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(3)
    pasta = RAIZ / 'qa' / 'tec08-02' / '.local' / 'execucoes' / id_exec
    pasta.mkdir(parents=True, mode=0o700)
    os.chmod(pasta, 0o700)
    relatorio = {'suite': 'TEC08-02', 'execucao': id_exec, 'tipo': 'CHROMIUM_NEXT_SUPERTOKENS_NEST_POSTGRES_REAL',
                 'status': 'REPROVADO', 'inicioUtc': datetime.now(timezone.utc).isoformat(),
                 'contratosQA': {}, 'documentosQA': [], 'provas': [], 'restauracaoVinculos': [],
                 'segredosNoRelatorio': False}
    pendentes = []
    erro = None
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        adminctx = None
        try:
            adminctx, admin, usu_admin = nova_sessao(browser, 'administrador', contas)
            relatorio['provas'].append('Login ADMIN real Next + SuperTokens + domínio ativo')
            r = api(admin, '/contratos')
            aceitar(r['status'], {200}, 'Listagem de contratos ADMIN')
            exigir(isinstance(r['body'], list), 'API contratos não retornou array')
            # Sempre criar fixtures próprias, sem pressupor IDs ou permissões existentes.
            a = criar_contrato(admin, id_exec + '-A')
            relatorio['contratosQA']['A'] = a
            b = criar_contrato(admin, id_exec + '-B')
            relatorio['contratosQA']['B'] = b
            relatorio['provas'].append('Dois contratos DEV sintéticos reais criados, sem IDs manuais')

            # Documento inicial, por ADMIN, com hash verificado pelos bytes do navegador.
            up_admin = upload(admin, a, ARQ, 'qa-tec08-admin.txt')
            aceitar(up_admin.get('upload'), {201}, 'Upload ADMIN')
            doc_a = up_admin.get('documento')
            exigir(isinstance(doc_a, dict) and uuid_ok(doc_a.get('id')), 'Upload ADMIN sem UUID')
            relatorio['documentosQA'].append(doc_a['id'])  # registrar antes das demais asserções
            aceitar(up_admin.get('download'), {200}, 'Download ADMIN')
            exigir(up_admin.get('shaIgual') is True and up_admin['tamanho'] == len(ARQ),
                   'SHA-256/bytes de download divergentes')
            exigir(up_admin.get('cabecalhos', {}).get('nosniff') == 'nosniff', 'Download não usa nosniff')
            exigir('attachment' in (up_admin.get('cabecalhos', {}).get('disposicao') or ''),
                   'Download não usa Content-Disposition attachment')
            exigir(doc_a.get('contratoId') == a and 'storageKey' not in doc_a,
                   'Upload devolveu metadados inadequados')
            relatorio['provas'].append('Upload+download ADMIN HTTP201/200; hash e headers seguros; chave privada ausente')

            aceitar(upload_disfarcado(admin, a), {400},
                   'PDF disfarçado deve ser rejeitado pelo adaptador')
            relatorio['provas'].append('Arquivo com MIME/extension PDF mas bytes falsos: HTTP400')
            detalhe = api(admin, documento_base(a) + '/' + doc_a['id'])
            aceitar(detalhe['status'], {200}, 'Detalhe ADMIN')
            exigir(detalhe['body']['id'] == doc_a['id'] and 'storageKey' not in detalhe['body'],
                   'Detalhe exibiu chave interna')
            lista = api(admin, documento_base(a) + '?categoria=ANEXO&pagina=1')
            aceitar(lista['status'], {200}, 'Listagem paginada')
            exigir(lista['body']['total'] == 1 and lista['body']['pagina'] == 1 and
                   any(x['id'] == doc_a['id'] and 'storageKey' not in x for x in lista['body']['itens']),
                   'Listagem de metadados/categoria incorreta')
            # ADMIN tem acesso aos dois contratos existentes. A incompatibilidade pai/filho
            # deve ser negada pela FK persistida, não por inexistência de B.
            outros = [documento_base(b) + '/' + doc_a['id'],
                      documento_base(b) + '/' + doc_a['id'] + '/download']
            for caminho in outros:
                aceitar(api(admin, caminho)['status'], {404}, 'IDOR B existente x documento de A')
            relatorio['provas'].append('IDOR: ADMIN B existente não obtém documento A via detalhe/download (404)')

            # Contas da configuração privada existente: nenhuma senha/token aparece no output.
            gestor_email = contas['gestor-edicao'][0]
            colab_email = contas['colaborador'][0]
            pessoas = {}
            for perfil, email in [('gestor', gestor_email), ('colaborador', colab_email)]:
                from urllib.parse import quote
                r = api(admin, '/admin/usuarios/consulta?ativo=true&pagina=1&limite=20&busca=' + quote(email))
                aceitar(r['status'], {200}, 'Consulta de funcionário ativo')
                encontrados = [x for x in r['body'].get('itens', []) if
                              str(x.get('email','')).casefold() == email.casefold()]
                exigir(len(encontrados) == 1 and uuid_ok(encontrados[0].get('id')) and
                       encontrados[0].get('perfil') == ('GESTOR' if perfil == 'gestor' else 'COLABORADOR'),
                       'Conta QA não encontrada ou com perfil errado')
                pessoas[perfil] = encontrados[0]['id']

            # Antes das permissões: GESTOR/COLABORADOR não devem herdar acesso a A/B.
            ctx_g, gestor, user_g = nova_sessao(browser, 'gestor-edicao', contas)
            try:
                for contrato in (a, b):
                    aceitar(api(gestor, documento_base(contrato))['status'], {403,404},
                           'Gestor sem vínculo recebeu acesso')
            finally:
                ctx_g.close()
            ctx_c, colab, user_c = nova_sessao(browser, 'colaborador', contas)
            try:
                for contrato in (a, b):
                    aceitar(api(colab, documento_base(contrato))['status'], {403,404},
                           'Colaborador sem vínculo recebeu acesso')
            finally:
                ctx_c.close()
            relatorio['provas'].append('Sem vínculo: GESTOR/COLABORADOR com sessão válida negados em dois contratos QA')

            # Somente grants em contratos recém-criados; TODOS revogados no finally.
            for pessoa, contrato, editar in ((pessoas['gestor'], a, True),
                                              (pessoas['gestor'], b, False),
                                              (pessoas['colaborador'], a, False)):
                # Conferir ausência ANTES de registrar compensação: nunca revogar
                # vínculo que já existia por qualquer razão.
                anterior = api(admin, f'/admin/usuarios/{pessoa}/permissoes')
                aceitar(anterior['status'], {200}, 'Preflight do vínculo de QA')
                exigir(isinstance(anterior['body'], list) and
                       not any(v.get('contratoId') == contrato for v in anterior['body']),
                       'Vínculo pré-existente inesperado; abortando sem revogá-lo')
                # Marcar antes da operação para compensar PUT cujo resultado seja incerto.
                pendentes.append((pessoa, contrato))
                grant(admin, pessoa, contrato, editar)
            relatorio['provas'].append('Concessões auditadas: GESTOR A edição/B leitura; COLABORADOR A leitura')

            ctx_g, gestor, user_g = nova_sessao(browser, 'gestor-edicao', contas)
            try:
                aceitar(api(gestor, documento_base(a))['status'], {200}, 'GESTOR editor A')
                aceitar(api(gestor, documento_base(b))['status'], {200}, 'GESTOR leitor B')
                up_g = upload(gestor, a, ARQ_GESTOR, 'qa-tec08-gestor.txt')
                aceitar(up_g.get('upload'), {201}, 'GESTOR editor upload A')
                doc_g = up_g.get('documento')
                exigir(isinstance(doc_g, dict) and uuid_ok(doc_g.get('id')), 'Upload GESTOR sem UUID')
                relatorio['documentosQA'].append(doc_g['id'])
                aceitar(up_g.get('download'), {200}, 'GESTOR editor download A')
                exigir(up_g.get('shaIgual') is True and up_g.get('tamanho') == len(ARQ_GESTOR),
                       'Arquivo gestor recuperado com hash diferente')
                exigir('storageKey' not in doc_g, 'GESTOR retorno inseguro')
                aceitar(upload_negado(gestor, b), {403,404}, 'GESTOR leitura não pode anexar em B')
                aceitar(api(gestor, documento_base(b) + '/' + doc_a['id'] + '/download')['status'],
                       {404}, 'GESTOR B não pode trocar pai de documento A')
                relatorio['provas'].append('GESTOR: grava em A, lê B, não grava em B; download íntegro')
                # Logout real e revogação de sessão, sem armazenar token.
                gestor.get_by_role('button', name='Sair', exact=True).click()
                gestor.get_by_role('heading', name='Acesse sua conta').wait_for(timeout=25000)
                aceitar(api(gestor, documento_base(a))['status'], {401}, 'Após logout GESTOR')
                relatorio['provas'].append('Logout SuperTokens real: acesso anterior retorna 401')
            finally:
                ctx_g.close()

            ctx_c, colab, user_c = nova_sessao(browser, 'colaborador', contas)
            try:
                l = api(colab, documento_base(a))
                aceitar(l['status'], {200}, 'COLABORADOR leitura A')
                exigir(any(x['id'] == doc_a['id'] for x in l['body']['itens']),
                       'COLABORADOR não recebeu documento permitido')
                aceitar(api(colab, documento_base(a) + '/' + doc_a['id'])['status'], {200},
                       'COLABORADOR detalhe A')
                aceitar(api(colab, documento_base(a) + '/' + doc_a['id'] + '/download')['status'], {200},
                       'COLABORADOR download A')
                aceitar(upload_negado(colab, a), {403,404}, 'COLABORADOR não pode anexar')
                aceitar(api(colab, documento_base(b))['status'], {403,404},
                       'COLABORADOR sem vínculo B')
                aceitar(api(colab, documento_base(b) + '/' + doc_a['id'] + '/download')['status'],
                       {403,404}, 'COLABORADOR não acessa documento de outro contrato')
                relatorio['provas'].append('COLABORADOR: leitura/baixar A; POST negado; B não autorizado')
            finally:
                ctx_c.close()

            # SQL independente do navegador para provar dados persistidos/auditoria real.
            linhas = sql_verificar([doc_a['id'], doc_g['id']])
            conferir_sql(linhas, {
                doc_a['id']: {'contrato': a, 'autor': usu_admin['id'], 'bytes': ARQ},
                doc_g['id']: {'contrato': a, 'autor': user_g['id'], 'bytes': ARQ_GESTOR},
            })
            relatorio['provas'].append('PostgreSQL READ ONLY: 2 FKs, autores, SHA-256, categoria, auditoria e sem storageKey')
            # Contrato B sem documentos, apesar dos vínculos de leitor.
            lb = api(admin, documento_base(b))
            aceitar(lb['status'], {200}, 'Lista B')
            exigir(lb['body']['total'] == 0, 'Contrato B incluiu documento de A')
            la = api(admin, documento_base(a))
            aceitar(la['status'], {200}, 'Lista A após QA')
            exigir(la['body']['total'] == 2, 'Uploads ou tentativas negadas alteraram a contagem esperada')
            relatorio['provas'].append('Listas A/B isoladas: dois documentos em A, nenhum documento em B')
        except Exception as exc:
            erro = exc
        finally:
            if adminctx is not None:
                falhas_restauracao = []
                for pessoa, contrato in reversed(pendentes):
                    try:
                        # Se o PUT não foi aplicado, não há nada a revogar.
                        atual = api(admin, f'/admin/usuarios/{pessoa}/permissoes')
                        if atual['status'] != 200 or not isinstance(atual.get('body'), list):
                            raise AssertionError('Não foi possível conferir vínculo temporário')
                        if any(v.get('contratoId') == contrato for v in atual['body']):
                            revogar(admin, pessoa, contrato)
                        relatorio['restauracaoVinculos'].append('OK: vínculo temporário removido')
                    except Exception:
                        falhas_restauracao.append(contrato)
                        relatorio['restauracaoVinculos'].append('FALHA: conferir vínculo no contrato QA ' + contrato)
                if not falhas_restauracao and pendentes:
                    try:
                        # Novo login real após revogação: a ACL deve negar A e B.
                        for perfil in ('gestor-edicao', 'colaborador'):
                            ctx_rev, page_rev, _ = nova_sessao(browser, perfil, contas)
                            try:
                                for contrato in relatorio['contratosQA'].values():
                                    resposta = api(page_rev, documento_base(contrato))
                                    aceitar(resposta['status'], {403, 404},
                                           f'ACL pós-revogação: {perfil} não deveria consultar contrato QA')
                            finally:
                                ctx_rev.close()
                        relatorio['provas'].append('Pós-revogação: sessões reais GESTOR/COLABORADOR negadas em A/B')
                    except Exception as exc:
                        falhas_restauracao.append('verificacao-posterior')
                        relatorio['restauracaoVinculos'].append('FALHA: validar ACL após revogação')
                        if erro is None:
                            erro = AssertionError(f'ACL após revogação: {type(exc).__name__}')
                if falhas_restauracao and erro is None:
                    erro = AssertionError('Falha ao restaurar ou validar vínculos temporários de QA')
                adminctx.close()
            browser.close()
    if erro is None:
        relatorio['status'] = 'APROVADO'
    else:
        relatorio['erro'] = f'{type(erro).__name__}: {str(erro)[:300]}'
    relatorio['fimUtc'] = datetime.now(timezone.utc).isoformat()
    relatorio['totalProvas'] = len(relatorio['provas'])
    relatorio_path = pasta / 'resultado.json'
    with relatorio_path.open('x', encoding='utf-8') as f:
        json.dump(relatorio, f, ensure_ascii=False, indent=2)
        f.write('\n')
    relatorio_path.chmod(0o600)
    print(f'[TEC08-02] {relatorio["status"]}: {relatorio["totalProvas"]} provas; relatório privado: {relatorio_path}')
    if erro:
        print(f'[TEC08-02] ERRO: {type(erro).__name__}: {str(erro)[:220]}', file=sys.stderr)
        return 1
    return 0


def main():
    args = argumento()
    try:
        contas = preflight()
        print('[TEC08-02] Pré-voo OK: Next, Nest, 401 anônimo, migration [X], 3 contas QA e Playwright')
        if args.verificar:
            print('[TEC08-02] Somente leitura; nenhum registro ou vínculo alterado')
            return 0
        return ciclo(args, contas)
    except Exception as e:
        print(f'[TEC08-02] REPROVADO: {type(e).__name__}: {str(e)[:240]}', file=sys.stderr)
        print('[TEC08-02] Se o problema for de inicialização, confira: docker compose ps e docker compose logs --tail=80 backend', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
