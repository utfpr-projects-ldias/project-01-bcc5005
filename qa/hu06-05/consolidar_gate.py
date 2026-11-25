#!/usr/bin/env python3
"""HU06-05: gate funcional automático com evidências reais verificáveis."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

EXIGIDOS = {"administrador", "gestor-edicao", "gestor-leitura", "colaborador", "sem-vinculo"}


def main() -> int:
    ap = argparse.ArgumentParser(description="Consolida evidências HU06-05 sem fabricar status de aprovação")
    ap.add_argument("--diretorio", type=Path, required=True, help="Diretório com JSONs emitidos pelo validar_fluxo_real.py")
    ap.add_argument("--automatico", action="store_true", help="Compatibilidade com os roteiros existentes; validação já é sempre automática")
    args = ap.parse_args()
    erros = []
    relatorios = []
    for caminho in sorted(args.diretorio.glob("hu06-05-*.json")):
        try:
            doc = json.loads(caminho.read_text(encoding="utf-8"))
            if doc.get("hu") == "HU06-05" and doc.get("status") == "APROVADO":
                relatorios.append(doc)
            else:
                erros.append(f"{caminho.name}: status não aprovado")
        except (OSError, ValueError) as exc:
            erros.append(f"{caminho.name}: inválido: {exc}")
    perfis = {r.get("perfilSolicitado") for r in relatorios}
    for ausente in sorted(EXIGIDOS - perfis):
        erros.append("Falta execução real aprovada para: " + ausente)
    for perfil in ("administrador", "gestor-edicao"):
        if not any(r.get("perfilSolicitado") == perfil and r.get("escrita") and
                   len(r.get("idsEtapasCriadas", [])) == 2 and
                   any(("reinici" in p.lower() or "restart backend" in p.lower()) and "postgres" in p.lower() for p in r.get("provas", [])) and
                   any("PostgreSQL direta" in p for p in r.get("provas", []))
                   for r in relatorios):
            erros.append(f"Falta escrita + reinício + PostgreSQL real com {perfil}")
    if not any("ID de etapa de outro contrato negado" in p for r in relatorios for p in r.get("provas", [])):
        erros.append("Falta teste real de ID aninhado pertencente a outro contrato")
    if not any(r.get("largura", 9999) <= 430 for r in relatorios):
        erros.append("Falta execução no navegador em viewport móvel (largura <=430)")
    if not any(r.get("largura", 0) >= 1024 for r in relatorios):
        erros.append("Falta execução no navegador em viewport desktop (>=1024)")
    if not all(any("Logout real" in p for p in r.get("provas", [])) for r in relatorios):
        erros.append("Nem todas as execuções conferiram logout real e HTTP 401")
    # A execução real do Chromium fornece provas objetivas de navegação, teclado,
    # resoluções desktop/mobile, acesso a dados e isolamento. Nenhum booleano
    # preenchido manualmente pode substituir essas provas.
    if not any("Teclado real: foco navegável" in p for r in relatorios for p in r.get("provas", [])):
        erros.append("Não houve prova de navegação por teclado em Chromium real")
    if not any("Viewport real: mobile" in p for r in relatorios for p in r.get("provas", [])):
        erros.append("Falta validação real da viewport móvel")
    if not any("Viewport real: desktop" in p for r in relatorios for p in r.get("provas", [])):
        erros.append("Falta validação real da viewport desktop")
    for perfil in EXIGIDOS:
        registros = [r for r in relatorios if r.get("perfilSolicitado") == perfil]
        if not any("Login real SuperTokens" in p for r in registros for p in r.get("provas", [])):
            erros.append(f"Falta login real do perfil {perfil}")
    if not any("Usuário leitura: modal de etapa acessível" in p for r in relatorios for p in r.get("provas", [])):
        erros.append("Falta bloqueio UI/API do leitor")
    print("HU06-05 — GATE de integração real")
    print("Execuções aprovadas:", len(relatorios), "| Perfis:", ", ".join(sorted(perfis)) if perfis else "nenhum")
    if erros:
        print("GATE: NÃO APROVADO — não fechar HU06")
        for e in erros:
            print(" -", e)
        return 1
    print("GATE FUNCIONAL AUTOMATIZADO: APROVADO — 5 perfis, interface, teclado, API, SQL e logout")
    print("LIMITE: expiração temporal natural, aparência subjetiva e aprovação do PR não são declaradas como provadas.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
