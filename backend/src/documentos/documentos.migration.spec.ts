import { CriarDocumentosContratuais1793900000000 } from '../database/migrations/1793900000000-CriarDocumentosContratuais.js';

describe('TEC08-02: migration aditiva', () => {
  it('cria tabela, chaves, índices e restrições sem modificar tabelas anteriores', async () => {
    const comandos: string[] = [];
    const runner = { query: async (sql: string) => { comandos.push(sql); return []; } };
    await new CriarDocumentosContratuais1793900000000().up(runner as never);
    const ddl = comandos.join('\n');
    expect(ddl).toContain('CREATE TABLE "documentos_contratuais"');
    expect(ddl).toContain('"fk_documentos_contrato"');
    expect(ddl).toContain('"fk_documentos_autor"');
    expect(ddl).toContain('"idx_documentos_contrato_categoria_criacao"');
    expect(ddl).toContain('"uq_documentos_storage_key"');
    expect(ddl).not.toMatch(/DROP TABLE|TRUNCATE|DELETE FROM|ALTER TABLE "contratos"/i);
  });
});
