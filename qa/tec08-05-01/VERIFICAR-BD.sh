#!/usr/bin/env bash
# Read-only database gate after the additive HU08 activity lifecycle migration.
# Uses the running DEV PostgreSQL container; never writes or destroys data.
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "VERIFICAÇÃO DEV: estrutura e integridade existentes; nenhuma escrita será executada."
docker compose exec -T database sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
BEGIN TRANSACTION READ ONLY;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
  WHERE table_schema = current_schema() AND table_name = 'atividades'
    AND column_name IN ('status', 'verificadaEm', 'arquivadaEm', 'excluidaEm');
  IF n <> 4 THEN RAISE EXCEPTION 'HU08: migration do ciclo de vida ainda não foi aplicada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_hu08_atividade_status' AND conrelid = 'atividades'::regclass)
  THEN RAISE EXCEPTION 'HU08: CHECK de status ausente'; END IF;
  IF EXISTS (SELECT 1 FROM atividades
    WHERE status NOT IN ('REGISTRADA', 'VERIFICADA', 'ARQUIVADA'))
  THEN RAISE EXCEPTION 'HU08: status inválido persistido'; END IF;
  IF EXISTS (SELECT 1 FROM atividade_entregaveis vinculo
    JOIN atividades a ON a.id = vinculo."atividadeId"
    JOIN entregaveis e ON e.id = vinculo."entregavelId"
    WHERE a."contratoId" <> e.contrato_id)
  THEN RAISE EXCEPTION 'HU08: vínculo N:N de contratos distintos'; END IF;
END $$;
ROLLBACK;
SQL
echo "APROVADO: colunas, restrição, estados e N:N coerentes; nenhuma mutação."
