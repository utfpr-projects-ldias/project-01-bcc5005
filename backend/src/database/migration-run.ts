import banco from './data-source.js';
import { executarMigracoesSerializadas } from './executar-migrations.js';

async function main() {
  await banco.initialize();
  try {
    await executarMigracoesSerializadas(banco);
    console.log('Migrations aplicadas e histórico conferido.');
  } finally {
    if (banco.isInitialized) await banco.destroy();
  }
}
void main().catch((erro: unknown) => {
  console.error('Falha nas migrations:', erro instanceof Error ? erro.message : 'erro desconhecido');
  process.exitCode = 1;
});
