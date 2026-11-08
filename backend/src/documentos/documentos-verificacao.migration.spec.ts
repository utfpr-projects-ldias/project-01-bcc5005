import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('TEC08: migração aditiva de verificação documental', () => {
  it('preserva bytes e metadados antigos, adicionando somente campos de estado e índice', () => {
    const origem = readFileSync(join(process.cwd(), 'src/database/migrations/1794900000000-VerificacaoDocumentos.ts'), 'utf8');
    expect(origem).toContain('ADD COLUMN "verificado_em"');
    expect(origem).toContain('ADD COLUMN "reaberto_em"');
    expect(origem).not.toContain('DELETE FROM');
    expect(origem).not.toContain('DROP TABLE');
  });
});
