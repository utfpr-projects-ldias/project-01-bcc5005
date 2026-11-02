import type { DataSource } from 'typeorm';

/**
 * Retorna um código livre para um contrato FICTÍCIO de teste, sempre consultando
 * o PostgreSQL isolado. Os cadastros reais continuam usando o gerador seguro
 * do ContratosService; esta função não deve ser importada em produção.
 *
 * As suítes chamadoras trabalham em bancos dedicados e sequencialmente.
 */
export async function codigoPublicoLivreParaTeste(db: DataSource): Promise<string> {
  const linhas = await db.query(`
    SELECT lpad(numero::text, 5, '0') AS codigo
    FROM generate_series(0, 99999) AS sequencia(numero)
    WHERE NOT EXISTS (
      SELECT 1 FROM contratos AS c
      WHERE c.codigo_publico = lpad(numero::text, 5, '0')
    )
    ORDER BY numero
    LIMIT 1
  `) as Array<{ codigo: string }>;
  if (!linhas[0]?.codigo) {
    throw new Error('Não há código público livre no banco E2E isolado');
  }
  return linhas[0].codigo;
}
