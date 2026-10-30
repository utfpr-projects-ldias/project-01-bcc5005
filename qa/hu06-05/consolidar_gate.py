#!/usr/bin/env python3
"""HU06-05: consolida evidências reais; gate só verde com QA humano e perfis reais."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

EXIGIDOS = {"administrador", "gestor-edicao", "gestor-leitura", "colaborador", "sem-vinculo"}


def main() -> int:
    ap = argparse.ArgumentParser(description="Consolida evidências HU06-05 sem fabricar status de aprovação")
    ap.add_argument("--diretorio", type=Path, required=True, help="Diretório com JSONs emitidos pelo validar_fluxo_real.py")
    ap.add_argument("--visual", type=Path, required=True, help="JSON local de inspeção manual preenchido (ver exemplo)")
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
    try:
        visual = json.loads(args.visual.read_text(encoding="utf-8"))
        for chave in ("desktop", "mobile", "teclado", "validacaoGestor", "validacaoColaborador", "contratoExistente", "sessaoExpirada"):
            if visual.get(chave) is not True:
                erros.append(f"QA visual/manual pendente ou reprovado: {chave}")
        if not isinstance(visual.get("responsavel"), str) or not visual["responsavel"].strip():
            erros.append("QA manual deve conter responsável")
    except (OSError, ValueError) as exc:
        erros.append("Registro manual não encontrado/inválido: " + str(exc))
    print("HU06-05 — GATE de integração real")
    print("Execuções aprovadas:", len(relatorios), "| Perfis:", ", ".join(sorted(perfis)) if perfis else "nenhum")
    if erros:
        print("GATE: NÃO APROVADO — não fechar HU06")
        for e in erros:
            print(" -", e)
        return 1
    print("GATE: APROVADO — anexar evidências ao PR, revisar código e confirmar merge antes de encerrar HU06")
    return 0


if __name__ == "__main__":
    sys.exit(main())
