#!/usr/bin/env python3
"""HU06-05: prova real no navegador (SuperTokens + Next + Nest + PostgreSQL).

Sem mocks e sem credenciais em argumentos, logs ou arquivos.
Escrita exige opt-in e deixa etapas de QA persistidas para rastreabilidade.
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

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
PERFIS = {
    "administrador": ("ADMINISTRADOR", True),
    "gestor-edicao": ("GESTOR", True),
    "gestor-leitura": ("GESTOR", False),
    "colaborador": ("COLABORADOR", False),
    "sem-vinculo": (None, False),
}


def garantir(condicao: bool, mensagem: str) -> None:
    if not condicao:
        raise AssertionError(mensagem)


def argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="HU06-05 — valida integração REAL (sem mocks) pela UI Next/SuperTokens, API Nest e PostgreSQL")
    parser.add_argument("--contrato-id", required=True, help="UUID de contrato real já existente, preferencialmente contrato de QA")
    parser.add_argument("--perfil", required=True, choices=PERFIS)
    parser.add_argument("--frontend-url", default="http://localhost:3000")
    parser.add_argument("--api-url", default="http://localhost:3001")
    parser.add_argument("--escrita", action="store_true", help="Cria duas etapas reais, edita e reordena (persistem no banco)")
    parser.add_argument("--confirmar-persistencia", action="store_true", help="Confirmo que as etapas QA permanecerão no contrato selecionado")
    parser.add_argument("--reiniciar-backend", action="store_true", help="Executa docker compose restart backend e reconfere dados reais")
    parser.add_argument("--validar-banco", action="store_true", help="Confere linhas de etapas diretamente no PostgreSQL via container backend")
    parser.add_argument("--outro-contrato-id", help="UUID de segundo contrato legível; testa rota aninhada com ID de etapa alheia")
    parser.add_argument("--saida", type=Path, help="Salva evidência JSON local sem credenciais/tokens/cookies")
    parser.add_argument("--largura", type=int, default=1280, help="Largura da viewport em pixels; repita com 390 para QA mobile")
    args = parser.parse_args()
    for campo in ("contrato_id", "outro_contrato_id"):
        valor = getattr(args, campo)
        if valor is not None:
            if not UUID.fullmatch(valor):
                parser.error(f"--{campo.replace('_', '-')} precisa ser UUID válido")
    args.contrato_id = args.contrato_id.lower()
    if args.outro_contrato_id:
        args.outro_contrato_id = args.outro_contrato_id.lower()
    if args.escrita and (not args.confirmar_persistencia or args.perfil not in {"administrador", "gestor-edicao"}):
        parser.error("--escrita exige --confirmar-persistencia e perfil administrador/gestor-edicao")
    if args.reiniciar_backend and not args.escrita:
        parser.error("--reiniciar-backend requer --escrita, para validar registros criados na sessão")
    if args.largura < 320 or args.largura > 2560:
        parser.error("--largura deve estar entre 320 e 2560")
    for campo in ("frontend_url", "api_url"):
        valor = getattr(args, campo)
        if urlsplit(valor).scheme not in {"http", "https"} or not urlsplit(valor).netloc:
            parser.error(f"URL inválida em --{campo.replace('_', '-')}")
    return args


def chamar_api(page, api: str, caminho: str, metodo: str = "GET", corpo: object | None = None) -> dict:
    """Executa fetch no CONTEXTO DO NAVEGADOR AUTENTICADO (cookies/SuperTokens reais)."""
    return page.evaluate("""async ({url, method, payload}) => {
      try {
        const opt = {method, credentials: 'include', cache: 'no-store', headers: {Accept: 'application/json'}};
        if (payload !== null) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(payload); }
        const response = await fetch(url, opt);
        const text = await response.text();
        let body = null;
        try { body = text ? JSON.parse(text) : null; } catch { body = null; }
        return {status: response.status, body};
      } catch (err) { return {status: 0, error: String(err)}; }
    }""", {"url": api.rstrip("/") + caminho, "method": metodo, "payload": corpo})


def etapas_http(page, api: str, contrato: str) -> list[dict]:
    resposta = chamar_api(page, api, f"/contratos/{quote(contrato)}/etapas")
    garantir(resposta["status"] == 200, f"GET de Etapas deveria ser 200: recebido {resposta['status']}")
    itens = resposta["body"]
    garantir(isinstance(itens, list), "GET Etapas não devolveu array JSON")
    ids = [e["id"] for e in itens]
    garantir(len(ids) == len(set(ids)), "IDs duplicados na lista HTTP")
    garantir([e["sequencia"] for e in itens] == sorted(e["sequencia"] for e in itens), "API fora de ordem por sequência")
    garantir(all(e["contratoId"] == contrato for e in itens), "Vazamento de Etapas de outro contrato")
    return itens


def consultar_pg(contrato: str, raiz: Path) -> list[dict]:
    """Executa consulta somente de leitura com pg no backend; NÃO imprime DATABASE_URL."""
    js = """
      import pg from 'pg';
      const db = new pg.Client({connectionString: process.env.DATABASE_URL});
      try {
        await db.connect();
        const res = await db.query('SELECT id, codigo, nome, sequencia, status FROM etapas WHERE contrato_id=$1 ORDER BY sequencia,id', [process.argv[1]]);
        process.stdout.write(JSON.stringify(res.rows));
      } finally { await db.end(); }
    """
    comando = ["docker", "compose", "exec", "-T", "backend", "node", "--input-type=module", "-e", js, contrato]
    res = subprocess.run(comando, cwd=raiz, capture_output=True, text=True, check=False)
    garantir(res.returncode == 0, "Consulta PostgreSQL falhou (verifique docker compose e migrations): " + res.stderr[:600])
    return json.loads(res.stdout)


def comprovar_ui(page, painel, itens: list[dict]) -> None:
    # Sem mock: confere que a listagem DOM tem a mesma ordem e os nomes retornados pela API.
    if not itens:
        painel.get_by_text("Ainda não há etapas cadastradas", exact=False).wait_for(timeout=10000)
        return
    lista = painel.get_by_role("list", name="Etapas em ordem de execução")
    page.wait_for_function("n => document.querySelectorAll('ol[aria-label=\"Etapas em ordem de execução\"] > li').length === n", arg=len(itens), timeout=15000)
    linhas = lista.locator(":scope > li")
    garantir(linhas.count() == len(itens), "Quantidade de Etapas exibidas na UI difere da API")
    for indice, etapa in enumerate(itens):
        garantir(etapa["nome"] in linhas.nth(indice).inner_text(), f"Ordem da UI difere da API na posição {indice + 1}")


def salvar_json(caminho: Path, conteudo: dict) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    fd = caminho.open("x", encoding="utf-8")
    try:
        json.dump(conteudo, fd, ensure_ascii=False, indent=2)
        fd.write("\n")
    finally:
        fd.close()
    try:
        caminho.chmod(0o600)
    except OSError:
        pass


def main() -> int:
    args = argumentos()
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERRO: Playwright Python não instalado. Leia qa/hu06-05/README.md para instalação em venv.", file=sys.stderr)
        return 2
    api, web = args.api_url.rstrip("/"), args.frontend_url.rstrip("/")
    raiz = Path(__file__).resolve().parents[2]
    saida = {"hu": "HU06-05", "inicioUtc": datetime.now(timezone.utc).isoformat(),
             "contratoId": args.contrato_id, "perfilSolicitado": args.perfil,
             "escrita": args.escrita, "largura": args.largura,
             "provas": [], "requisicoesEtapas": [], "idsEtapasCriadas": [], "status": "EM_ANDAMENTO"}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=False)
            context = browser.new_context(viewport={"width": args.largura, "height": 850}, locale="pt-BR")
            page = context.new_page()
            prefixo_api = urlsplit(api).path.rstrip("/")
            def escutar(res):
                u = urlsplit(res.url)
                caminho = u.path
                if "/contratos/" in caminho and "/etapas" in caminho and caminho.startswith(prefixo_api + "/"):
                    saida["requisicoesEtapas"].append({"metodo": res.request.method, "caminho": caminho, "status": res.status})
            page.on("response", escutar)

            print("\n[HU06-05] Navegador real iniciado com perfil ISOLADO, sem sessão salva.")
            page.goto(web + "/login", wait_until="domcontentloaded")
            print("Faça login manualmente na janela do Chromium com o perfil indicado:", args.perfil)
            input("Após ver o dashboard e confirmar o login, pressione ENTER aqui no terminal: ")
            perfil = chamar_api(page, api, "/usuarios/me")
            garantir(perfil["status"] == 200, f"Sessão real/usuário ativo inválido: HTTP {perfil['status']}")
            papel = perfil["body"].get("perfil")
            papel_esperado, editar = PERFIS[args.perfil]
            if papel_esperado:
                garantir(papel == papel_esperado, f"Perfil incorreto: esperado {papel_esperado}, recebido {papel}")
            garantir(perfil["body"].get("ativo") is True, "Usuário de domínio deve estar ativo")
            saida["provas"].append("Login real SuperTokens + /usuarios/me 200 + usuário ativo")
            print("[OK] Autenticação SuperTokens real, usuário ativo, perfil de domínio:", papel)

            url_detalhe = web + f"/contratos/{quote(args.contrato_id)}"
            page.goto(url_detalhe, wait_until="domcontentloaded")
            caminho_lista = f"/contratos/{quote(args.contrato_id)}/etapas"
            if args.perfil == "sem-vinculo":
                acesso = chamar_api(page, api, caminho_lista)
                garantir(acesso["status"] in (403, 404), f"Sem vínculo: GET deveria ser negado; recebeu {acesso['status']}")
                garantir(page.get_by_role("heading", name="Etapas do contrato").count() == 0,
                         "Contrato não vinculado exibiu painel protegido")
                saida["provas"].append("Gestor/Colaborador sem vínculo: acesso HTTP negado e painel não exposto")
            else:
                painel = page.locator('section[aria-labelledby="titulo-etapas"]')
                painel.wait_for(timeout=20000)
                # Confirma a consulta originada pelo componente Next, ANTES dos
                # fetches diretos do próprio validador (sem mocks/fixtures).
                page.wait_for_function("""() => {
                    const painel = document.querySelector('section[aria-labelledby="titulo-etapas"]');
                    return !!painel && (
                      !!painel.querySelector('ol[aria-label="Etapas em ordem de execução"]') ||
                      painel.textContent.includes('Ainda não há etapas cadastradas') ||
                      !!painel.querySelector('[role="alert"]')
                    );
                }""", timeout=20000)
                garantir(any(r["metodo"] == "GET" and r["caminho"] == caminho_lista for r in saida["requisicoesEtapas"]),
                         "Nenhum GET real da UI Next observado antes da consulta do validador")
                acesso = chamar_api(page, api, f"/contratos/{quote(args.contrato_id)}/acesso")
                garantir(acesso["status"] == 200, f"Não foi possível consultar a permissão de domínio: {acesso['status']}")
                garantir(bool(acesso["body"].get("podeEditar")) == editar,
                         f"Permissão não corresponde ao perfil de teste {args.perfil}")
                itens = etapas_http(page, api, args.contrato_id)
                comprovar_ui(page, painel, itens)
                saida["provas"].append("Detalhe Next /contratos/[id] exibe lista persistida recebida da API HTTP")
                print("[OK] UI exibiu", len(itens), "etapas reais na ordem da API")

                if not editar:
                    garantir(painel.get_by_role("button", name="Nova etapa").count() == 0, "UI expôs Nova etapa sem escrita")
                    garantir(painel.get_by_role("button", name=re.compile("Editar etapa")).count() == 0, "UI expôs Editar sem escrita")
                    # Corpo inválido previne escrita, mesmo se a autorização estiver quebrada.
                    probe = chamar_api(page, api, caminho_lista, "POST", {"__hu06_05_probe": True})
                    garantir(probe["status"] in (403, 404), f"POST sem permissão deveria ser negado ANTES do DTO: {probe['status']}")
                    saida["provas"].append("Usuário leitura: sem botões de gestão + POST bloqueado no backend")
                    print("[OK] Perfil leitor: UI sem escrita e API negou POST")
                else:
                    garantir(painel.get_by_role("button", name="Nova etapa").count() == 1,
                             "Gestor/Admin autorizado não vê botão Nova etapa")

                if args.outro_contrato_id:
                    outras = chamar_api(page, api, f"/contratos/{quote(args.outro_contrato_id)}/etapas")
                    if outras["status"] == 200 and isinstance(outras["body"], list) and outras["body"]:
                        id_alheio = outras["body"][0]["id"]
                        aninhado = chamar_api(page, api, caminho_lista + "/" + quote(id_alheio))
                        garantir(aninhado["status"] == 404, f"ID cruzado retornou HTTP {aninhado['status']}, esperado 404")
                        saida["provas"].append("ID de etapa de outro contrato negado (404, HTTP real)")
                    else:
                        saida["provas"].append("ID cruzado NÃO EXECUTADO: outro contrato sem etapas ou sem leitura")

                if args.escrita:
                    print("[AVISO] Serão adicionadas DUAS etapas permanentes ao contrato:", args.contrato_id)
                    marca = secrets.token_hex(4).upper()
                    nomes = [f"QA HU06-05 Planejamento {marca}", f"QA HU06-05 Execução {marca}"]
                    codigos = [f"H605-{marca}-A", f"H605-{marca}-B"]
                    for nome, codigo in zip(nomes, codigos):
                        painel.get_by_role("button", name="Nova etapa").click()
                        form = painel.get_by_role("form", name="Criar etapa")
                        form.locator("#etapa-nome").fill(nome)
                        form.locator("#etapa-codigo").fill(codigo)
                        with page.expect_response(lambda r: r.request.method == "POST" and urlsplit(r.url).path == caminho_lista and r.status == 201, timeout=15000):
                            form.get_by_role("button", name="Salvar etapa").click()
                        painel.get_by_role("heading", name=nome, exact=True).wait_for(timeout=15000)
                        atual = etapas_http(page, api, args.contrato_id)
                        novos = [e for e in atual if e["codigo"] == codigo and e["nome"] == nome]
                        garantir(len(novos) == 1, f"POST de {codigo} não persistiu exatamente um registro")
                        saida["idsEtapasCriadas"].append(novos[0]["id"])
                        print("[OK] Etapa gravada pelo formulário Next, HTTP Nest e TypeORM:", codigo)
                    saida["provas"].append("Dois POST via formulários reais, IDs de PostgreSQL confirmados por GET")

                    id_a, id_b = saida["idsEtapasCriadas"]
                    nome_editado = nomes[0] + " Editada"
                    painel.get_by_role("button", name=f"Editar etapa {nomes[0]}").click()
                    form = painel.get_by_role("form", name=f"Editar etapa {nomes[0]}")
                    form.locator("#etapa-nome").fill(nome_editado)
                    form.locator("#etapa-codigo").fill(codigos[0] + "-E")
                    form.locator("#etapa-status").select_option("EM_ANDAMENTO")
                    with page.expect_response(lambda r: r.request.method == "PATCH" and urlsplit(r.url).path.endswith("/" + id_a) and r.status == 200, timeout=15000):
                        form.get_by_role("button", name="Salvar etapa").click()
                    painel.get_by_role("heading", name=nome_editado, exact=True).wait_for(timeout=15000)
                    atual = etapas_http(page, api, args.contrato_id)
                    a = next(e for e in atual if e["id"] == saida["idsEtapasCriadas"][0])
                    garantir(a["nome"] == nome_editado and a["codigo"] == codigos[0] + "-E" and a["status"] == "EM_ANDAMENTO",
                             "PATCH de nome/código/status não persistiu")
                    saida["provas"].append("PATCH real de nome, código e status confirmado pela API")
                    print("[OK] Edição real persistiu nome, código e status")

                    # Criadas em sequência: B está imediatamente após A; subir B troca as posições.
                    antes = etapas_http(page, api, args.contrato_id)
                    id_a, id_b = saida["idsEtapasCriadas"]
                    pos_a = next(i for i, e in enumerate(antes) if e["id"] == id_a)
                    pos_b = next(i for i, e in enumerate(antes) if e["id"] == id_b)
                    garantir(pos_b == pos_a + 1, "Etapas QA não estão adjacentes (outro usuário pode ter alterado a ordem)")
                    with page.expect_response(lambda r: r.request.method == "PATCH" and urlsplit(r.url).path == caminho_lista + "/reordenar" and r.status == 200, timeout=15000):
                        painel.get_by_role("button", name=f"Subir etapa {nomes[1]}").click()
                    depois = etapas_http(page, api, args.contrato_id)
                    garantir([e["id"] for e in depois].index(id_b) == pos_a and [e["id"] for e in depois].index(id_a) == pos_b,
                             "Reordenação não persistiu a troca A/B")
                    saida["provas"].append("PATCH reordenar HTTP real, sequência persistida")
                    print("[OK] Reordenação real gravada no PostgreSQL")

                    page.reload(wait_until="domcontentloaded")
                    painel = page.locator('section[aria-labelledby="titulo-etapas"]')
                    painel.wait_for(timeout=20000)
                    comprovar_ui(page, painel, depois)
                    reabertas = etapas_http(page, api, args.contrato_id)
                    garantir([e["id"] for e in depois] == [e["id"] for e in reabertas], "Ordem mudou após reload")
                    saida["provas"].append("F5/reload: UI, IDs, status e ordem mantidos")

                    if args.reiniciar_backend:
                        print("[HU06-05] Reiniciando APENAS o container backend (sem apagar volumes)...")
                        subprocess.run(["docker", "compose", "restart", "backend"], cwd=raiz, check=True)
                        for _ in range(40):
                            teste = chamar_api(page, api, caminho_lista)
                            if teste["status"] == 200:
                                break
                            time.sleep(1)
                        garantir(teste["status"] == 200, "Backend não respondeu após restart")
                        page.reload(wait_until="domcontentloaded")
                        painel = page.locator('section[aria-labelledby="titulo-etapas"]')
                        painel.wait_for(timeout=20000)
                        reiniciadas = etapas_http(page, api, args.contrato_id)
                        garantir([(e["id"], e["sequencia"], e["nome"], e["codigo"], e["status"]) for e in depois] ==
                                 [(e["id"], e["sequencia"], e["nome"], e["codigo"], e["status"]) for e in reiniciadas],
                                 "Dados foram alterados/perdidos após reiniciar backend")
                        comprovar_ui(page, painel, reiniciadas)
                        saida["provas"].append("docker compose restart backend: Etapas persistem no PostgreSQL, GET e UI permanecem coerentes")
                        print("[OK] Reinício real do container não perdeu Etapas")

                if args.validar_banco:
                    pg = consultar_pg(args.contrato_id, raiz)
                    http = etapas_http(page, api, args.contrato_id)
                    campos = lambda e: (e["id"], e["codigo"], e["nome"], e["sequencia"], e["status"])
                    garantir([campos(e) for e in pg] == [campos(e) for e in http], "PG direto difere da API Nest")
                    saida["provas"].append("Consulta PostgreSQL direta corresponde 1:1 à API HTTP")
                    print("[OK] PostgreSQL, Nest e navegador conferidos diretamente")

            # Não basta chamar fetch diretamente: as operações de escrita devem ter
            # aparecido no tráfego causado pelos botões do Next, sem interceptação/mocks.
            metodos = [r["metodo"] for r in saida["requisicoesEtapas"]]
            if args.perfil != "sem-vinculo":
                garantir("GET" in metodos, "Nenhum GET de etapas observado na rede do navegador Next")
            if args.escrita:
                garantir(metodos.count("POST") >= 2 and metodos.count("PATCH") >= 2,
                         "Faltam operações reais originadas do frontend (2 POST, 2 PATCH)")
                saida["provas"].append("Network: dois POST e dois PATCH do Next confirmados, sem mocks")
            # Sessão encerrada via logout real comprova 401 imediato; não representa
            # expiração natural do token nem revogação administrativa remota.
            page.get_by_role("button", name="Sair", exact=True).click()
            page.get_by_role("heading", name="Acesse sua conta").wait_for(timeout=15000)
            retorno = chamar_api(page, api, f"/contratos/{quote(args.contrato_id)}/etapas")
            garantir(retorno["status"] == 401, f"Após logout SuperTokens, API deveria responder 401; veio {retorno['status']}")
            saida["provas"].append("Logout real SuperTokens remove acesso: GET Etapas retorna 401")
            print("[OK] Logout real: API negou sessão encerrada (401)")
            context.close()
            browser.close()
        saida["status"] = "APROVADO"
        return 0
    except (AssertionError, Exception) as exc:
        saida["status"] = "REPROVADO"
        saida["erro"] = str(exc)[:1200]
        print("[FALHA]", exc, file=sys.stderr)
        return 1
    finally:
        saida["fimUtc"] = datetime.now(timezone.utc).isoformat()
        saida["totalProvas"] = len(saida["provas"])
        print("\nResultado HU06-05:", saida["status"], "| evidências:", saida["totalProvas"])
        if args.saida:
            try:
                salvar_json(args.saida, saida)
                print("Relatório JSON salvo em:", args.saida)
            except Exception as exc:
                print("Falha ao salvar relatório:", exc, file=sys.stderr)
                if saida["status"] == "APROVADO":
                    sys.exit(1)


if __name__ == "__main__":
    sys.exit(main())
