#!/usr/bin/env bash
# APENAS DEV LOCAL: exclui contratos, etapas, entregáveis, vínculos e evidências esperadas.
# Nunca apaga os usuários, SuperTokens, migrations, volumes ou tabelas desconhecidas.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ "${1:-}" != "--executar" || "${2:-}" != "--confirmar-apagar-contratos-dev" ]]; then
  echo "MODO CONSULTA: nenhuma exclusão realizada."
  echo "Para executar: bash qa/revisao-contratos/LIMPAR-CONTRATOS-DEV.sh --executar --confirmar-apagar-contratos-dev"
  MODO="consulta"
else
  MODO="executar"
fi

command -v docker >/dev/null || { echo 'Docker não encontrado'; exit 1; }
command -v git >/dev/null || { echo 'Git não encontrado'; exit 1; }
# Exigir compose local e rótulo da pasta, não um container de outro projeto.
CID="$(docker compose ps -q database)"
[[ -n "$CID" ]] || { echo 'Serviço database do Docker Compose não está rodando'; exit 1; }
DIRETORIO="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' "$CID")"
[[ "$(realpath "$DIRETORIO")" == "$(pwd -P)" ]] || { echo 'Banco fora deste projeto; ABORTADO'; exit 1; }
IMAGE="$(docker inspect -f '{{.Config.Image}}' "$CID")"
[[ "$IMAGE" == postgres:17-alpine ]] || { echo 'Imagem inesperada do banco; ABORTADO'; exit 1; }

# Não imprimir senhas do .env no terminal; usa as variáveis SOMENTE dentro do container local.
PSQL=(docker compose exec -T database sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"')
BD="$(docker compose exec -T database sh -lc 'printf %s "$POSTGRES_DB"' )"
[[ "$BD" != postgres && "$BD" != template0 && "$BD" != template1 && -n "$BD" ]] || { echo 'Banco reservado; ABORTADO'; exit 1; }
case "$BD" in
  integrador|integrador_dev|integrador_test|*_dev|*_test) ;;
  *) echo "Nome de banco não reconhecido como DEV/TESTE: $BD — ABORTADO"; exit 1 ;;
esac
printf 'Projeto: %s\nBanco local: %s\nContainer: %s\n' "$(pwd -P)" "$BD" "$CID"
"${PSQL[@]}" <<'SQL'
SELECT current_database() AS banco, inet_server_addr() AS ip_servidor, current_user AS usuario;
SELECT 'contratos' tabela,count(*) total FROM contratos
UNION ALL SELECT 'etapas',count(*) FROM etapas
UNION ALL SELECT 'entregaveis',count(*) FROM entregaveis
UNION ALL SELECT 'evidencias_esperadas',count(*) FROM evidencias_esperadas
UNION ALL SELECT 'permissoes_contrato',count(*) FROM permissoes_contrato;
SQL

if [[ "$MODO" == consulta ]]; then
  echo 'Nenhum dado foi removido.'; exit 0
fi

echo 'ATENÇÃO: essa operação exclui os contratos e seus dependentes do banco DEV acima.'
read -r -p "Digite exatamente APAGAR $BD para continuar: " CONFIRMAR
[[ "$CONFIRMAR" == "APAGAR $BD" ]] || { echo 'Confirmação recusada; dados preservados'; exit 1; }

# Backup privado ANTES da exclusão: contém dados do banco e NÃO pode ser versionado/anexado.
umask 077
BACKUP="$(pwd -P)/qa/.local/backups/contratos-dev-$(date -u +%Y%m%dT%H%M%SZ).dump"
mkdir -p "$(dirname "$BACKUP")"
docker compose exec -T database sh -lc 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -Fc -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >"$BACKUP"
[[ -s "$BACKUP" ]] || { echo 'Backup vazio, abortando'; exit 1; }
chmod 600 "$BACKUP"
echo "Backup privado criado em $BACKUP"

# Transação única; interrompe se extensões futuras introduzirem dependências desconhecidas.
"${PSQL[@]}" <<'SQL'
BEGIN;
DO $seguranca$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype='f' AND confrelid IN (
      'contratos'::regclass,'etapas'::regclass,'entregaveis'::regclass
    ) AND conrelid NOT IN (
      'permissoes_contrato'::regclass,'etapas'::regclass,'entregaveis'::regclass,
      'evidencias_esperadas'::regclass
    )
  ) THEN
    RAISE EXCEPTION 'Há tabela nova com FK para contratos/etapas/entregáveis. Limpeza abortada';
  END IF;
END $seguranca$;
-- Apenas eventos ligados a contratos que serão apagados. Eventos de usuário permanecem.
DELETE FROM eventos_auditoria a
 WHERE a.contrato_id IN (SELECT id FROM contratos)
    OR (a.entidade_tipo = 'CONTRATO' AND a.entidade_id IN (SELECT id::text FROM contratos))
    OR (a.entidade_tipo = 'ETAPA' AND a.entidade_id IN (SELECT id::text FROM etapas))
    OR (a.entidade_tipo = 'ENTREGAVEL' AND a.entidade_id IN (SELECT id::text FROM entregaveis));
DELETE FROM evidencias_esperadas;
DELETE FROM entregaveis;
DELETE FROM etapas;
DELETE FROM permissoes_contrato;
DELETE FROM contratos;
COMMIT;
SELECT count(*) AS contratos_restantes FROM contratos;
SQL
echo "Limpeza DEV concluída. Backup privado: $BACKUP"
