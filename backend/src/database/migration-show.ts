import banco from './data-source.js';
import { historicoCompativel, lerHistoricoMigrations } from './historico-migrations.js';

async function main(): Promise<void> {
  await banco.initialize();
  try {
    const registros = await lerHistoricoMigrations(banco) ?? [];
    if (!historicoCompativel(banco.migrations, registros, false))
      throw new Error('Histórico de migrations incompatível com o código.');
    const executadas = new Set(registros.map(r => r.name));
    for (const migration of banco.migrations) {
      const nome = migration.name ?? migration.constructor.name;
      console.log(`[${executadas.has(nome) ? 'X' : ' '}] ${nome}`);
    }
  } finally {
    await banco.destroy();
  }
}
void main().catch((erro: unknown) => {
  console.error('Falha ao consultar migrations:', erro instanceof Error ? erro.message : 'erro desconhecido');
  process.exitCode = 1;
});
