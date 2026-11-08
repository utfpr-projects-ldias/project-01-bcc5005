#!/usr/bin/env bash
# Exclusivo do ambiente local de desenvolvimento TEC08. NÃO executar em produção.
# Remove somente a carteira contratual de teste e seus dependentes; preserva usuários,
# sessões SuperTokens, migrations e estrutura PostgreSQL.
set -euo pipefail
umask 077
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ "$(git branch --show-current)" != "tec-08" ]]; then
  echo 'BLOQUEADO: este reset exige a branch tec-08.' >&2; exit 2
fi
if [[ ! -f docker-compose.yml ]]; then echo 'BLOQUEADO: docker-compose.yml não encontrado.' >&2; exit 2; fi
if ! docker compose ps --services --status running | grep -qx 'database'; then
  echo 'BLOQUEADO: o contêiner database deve estar em execução.' >&2; exit 2
fi

read_db() {
  docker compose exec -T database sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" "$@"' sh "$@"
}

cat <<'SQL' | read_db -At
SELECT 'contratos=' || count(*) FROM public.contratos;
SELECT 'etapas=' || count(*) FROM public.etapas;
SELECT 'entregaveis=' || count(*) FROM public.entregaveis;
SELECT 'evidencias_esperadas=' || count(*) FROM public.evidencias_esperadas;
SELECT 'comprovantes_evidencia=' || count(*) FROM public.comprovantes_evidencia;
SELECT 'documentos_contratuais=' || count(*) FROM public.documentos_contratuais;
SELECT 'usuarios_preservados=' || count(*) FROM public.usuarios;
SQL

if [[ "${1:-}" != '--apagar-confirmado' ]]; then
  echo 'MODO CONSULTA: nada foi apagado. Para executar, use --apagar-confirmado.'
  exit 0
fi

cat <<'TEXT'
ATENÇÃO: Esta operação remove PERMANENTEMENTE TODOS OS CONTRATOS DE TESTE e
os registros de etapas, entregáveis, evidências, documentos, comprovantes,
permissões contratuais e auditorias vinculadas. Também LIMPA O VOLUME DE ARQUIVOS.
Não remove usuários, autenticação, configurações ou migrations.
Um backup do banco e do volume será salvo no seu computador antes da limpeza.
TEXT

printf 'Digite exatamente APAGAR_CONTRATOS_TEC08: '
read -r resposta
if [[ "$resposta" != 'APAGAR_CONTRATOS_TEC08' ]]; then
  echo 'Cancelado sem alterações.'; exit 2
fi

DIRETORIO="$HOME/backup-tec08/reset-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$DIRETORIO"
echo "Guardando backups em: $DIRETORIO"
if ! docker compose exec -T database sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$DIRETORIO/postgres-antes-reset.dump"; then
  echo 'FALHOU: backup PostgreSQL não concluído. Nada foi apagado.' >&2; exit 2
fi
# Backup do volume nomeado antes de parar os processos que o montam.
if ! docker compose exec -T backend tar -C /var/lib/contratos-arquivos -cf - . > "$DIRETORIO/arquivos-antes-reset.tar"; then
  echo 'FALHOU: backup de arquivos não concluído. Nada foi apagado.' >&2; exit 2
fi
if [[ ! -s "$DIRETORIO/postgres-antes-reset.dump" || ! -s "$DIRETORIO/arquivos-antes-reset.tar" ]]; then
  echo 'FALHOU: backup vazio. Nada foi apagado.' >&2; exit 2
fi

# Evitar escritas concorrentes enquanto o banco e o volume são limpos.
echo 'Parando apenas frontend e backend; PostgreSQL e SuperTokens permanecem ativos...'
docker compose stop frontend backend
# Em caso de falha SQL, religar aplicações sem remover arquivos.
trap 'docker compose up -d backend frontend >/dev/null 2>&1 || true' EXIT
cat <<'SQL' | read_db
BEGIN;
-- Se uma tabela nova tiver FK não mapeada, a transação falha, sem CASCADE implícito.
TRUNCATE TABLE
  public.comprovantes_evidencia,
  public.evidencias_esperadas,
  public.entregaveis,
  public.etapas,
  public.documentos_contratuais,
  public.permissoes_contrato,
  public.contratos;
-- Auditorias de contratos são dados de teste; preservar eventos de usuários.
DELETE FROM public.eventos_auditoria
 WHERE contrato_id IS NOT NULL
    OR entidade_tipo IN ('CONTRATO', 'ETAPA', 'ENTREGAVEL', 'DOCUMENTO', 'EVIDENCIA', 'OCORRENCIA', 'ATIVIDADE');
ALTER SEQUENCE public.seq_contratos_codigo_publico RESTART WITH 1;
ALTER SEQUENCE public.seq_etapas_codigo_publico RESTART WITH 1;
ALTER SEQUENCE public.seq_entregaveis_codigo_publico RESTART WITH 1;
ALTER SEQUENCE public.seq_evidencias_codigo_publico RESTART WITH 1;
COMMIT;
SQL

# Limpa o volume exclusivo, sem rm -v e sem apagar o diretório raiz.
# Serviço efêmero com o MESMO volume do backend parado.
if ! docker compose run --rm --no-deps -T --entrypoint sh backend -c \
  'find /var/lib/contratos-arquivos -mindepth 1 -maxdepth 1 -exec rm -rf -- {} \;'; then
  echo 'ALERTA: banco reiniciado, mas remoção do volume falhou. Preserve os backups e confira o storage.' >&2
  exit 3
fi

echo 'Reiniciando backend e frontend...'
docker compose up -d backend frontend
trap - EXIT
cat <<'SQL' | read_db -At
SELECT 'contratos_restantes=' || count(*) FROM public.contratos;
SELECT 'usuarios_preservados=' || count(*) FROM public.usuarios;
SELECT 'seq_contratos=' || last_value || ':' || is_called FROM public.seq_contratos_codigo_publico;
SELECT 'seq_etapas=' || last_value || ':' || is_called FROM public.seq_etapas_codigo_publico;
SELECT 'seq_entregaveis=' || last_value || ':' || is_called FROM public.seq_entregaveis_codigo_publico;
SELECT 'seq_evidencias=' || last_value || ':' || is_called FROM public.seq_evidencias_codigo_publico;
SQL
printf 'RESET CONCLUÍDO. Backups: %s\n' "$DIRETORIO"
echo 'O próximo contrato/etapa/entregável/evidência de cada sequência recebe #00001.'
