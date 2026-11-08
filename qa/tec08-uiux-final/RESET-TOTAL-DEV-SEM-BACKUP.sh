#!/usr/bin/env bash
# Apaga TODOS os volumes deste Compose DEV SEM criar backup. Autorização explícita.
# NÃO executar em produção. NUNCA é chamado pelo instalador de correções.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
falhar() { printf 'BLOQUEADO: %s\n' "$*" >&2; exit 2; }

[[ "$(basename "$ROOT")" == 'project-01-bcc5005' ]] || falhar 'Nome inesperado da raiz do projeto.'
[[ -d backend/src && -d frontend/src && -f docker-compose.yml ]] || falhar 'Fontes/Compose não encontrados.'
[[ "$(git branch --show-current 2>/dev/null)" == 'tec-08' ]] || falhar 'Exige a branch tec-08.'
command -v docker >/dev/null || falhar 'Docker indisponível.'
command -v python3 >/dev/null || falhar 'Python 3 indisponível.'
docker compose config -q || falhar 'Compose inválido.'
# Uma validação sem imprimir o JSON (que contém segredos de ambiente).
# O reset só é liberado no Compose DEV específico, sem volumes externos.
docker compose config --format json | python3 -c '
import json,sys
c=json.load(sys.stdin)
exigir=lambda cond,m: cond or sys.exit("BLOQUEADO: "+m)
exigir(c.get("name")=="project-01-bcc5005","Projeto Compose não é project-01-bcc5005")
exigir(set(c.get("services",{}))=={"frontend","backend","database","supertokens"},"Serviços diferentes dos quatro esperados")
vols=c.get("volumes",{})
exigir(set(vols)=={"postgres_data","arquivos_contratuais_data"},"Volumes inesperados")
exigir(all(not v.get("external") for v in vols.values()),"Volume externo: reset não autorizado")
for svc,port in (("frontend","3000"),("backend","3001")):
    portas=c["services"][svc].get("ports",[])
    exigir(any(str(p.get("published"))==port for p in portas),"Porta de DEV inesperada em "+svc)
exigir("@database:5432/" in c["services"]["backend"].get("environment",{}).get("DATABASE_URL",""),
       "Backend não utiliza o PostgreSQL do projeto")
exigir("@database:5432/" in c["services"]["supertokens"].get("environment",{}).get("POSTGRESQL_CONNECTION_URI",""),
       "SuperTokens não utiliza o PostgreSQL do projeto")
' || falhar 'Configuração do Compose não autorizada para reset.'

echo 'DEV tec-08: será apagado, SEM BACKUP, todo o conteúdo dos volumes:'
echo '  project-01-bcc5005_postgres_data: contas, SuperTokens, sessões, contratos, auditórias, sequências'
echo '  project-01-bcc5005_arquivos_contratuais_data: comprovantes e documentos físicos'
echo '  volumes anônimos do frontend e backend: dependências/cache de containers'
echo 'PRESERVADOS: fontes, .env, .git, scripts, credenciais privadas locais do QA.'
echo
docker compose ps
if [[ "${1:---consultar}" != '--executar' ]]; then
  echo
  echo 'MODO CONSULTA: nenhum dado alterado.'
  echo 'Para executar sem backup: bash qa/tec08-uiux-final/RESET-TOTAL-DEV-SEM-BACKUP.sh --executar'
  exit 0
fi
[[ $# == 1 ]] || falhar 'Argumentos inesperados.'
[[ -t 0 ]] || falhar 'Exige terminal interativo (não rode via pipe ou automação).'
printf '\nEsta remoção é IRREVERSÍVEL sem backup. Digite APAGAR_TUDO_TEC08_SEM_BACKUP: '
IFS= read -r CONFIRMACAO </dev/tty || falhar 'Terminal de confirmação indisponível.'
[[ "$CONFIRMACAO" == 'APAGAR_TUDO_TEC08_SEM_BACKUP' ]] || falhar 'Confirmação diferente; nenhum volume foi removido.'
echo 'Destruindo somente os volumes do projeto Compose DEV...'
docker compose down -v
echo 'Iniciando banco e SuperTokens do zero...'
docker compose up -d database supertokens
echo
cat <<'FIM'
RESET SEM BACKUP CONCLUÍDO. Não foram criadas cópias de segurança.
A seguir, reaplique as migrations e crie o Administrador ANTES de subir o backend.
Use o roteiro RECOMECAR-DEV-E-VALIDAR.sh para seguir todas as etapas automaticamente,
OU veja os comandos no LEIA-ME do ZIP de QA.
FIM
