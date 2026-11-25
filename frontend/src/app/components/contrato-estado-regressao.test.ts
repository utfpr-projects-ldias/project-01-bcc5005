import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

test('a carteira distingue o estado encerrado da categoria de filtro concluídos', () => {
  const estado = src('src/lib/estado-visivel-contrato.ts');
  const linha = src('src/app/contratos/components/linha-contrato.tsx');
  const tabela = src('src/app/contratos/components/tabela-operacional.tsx');
  expect(estado).toContain("contrato.status === 'ENCERRADO' && !contrato.reabertoEm) return 'encerrado'");
  expect(estado).toContain("contrato.status === 'ENCERRADO') && !contrato.reabertoEm) return 'concluidos'");
  expect(linha).toContain('<StatusTabela estado={estado} rotulo={rotulo}');
  expect(tabela).toContain('data-situacao={estado}');
});

test('a aba de atividades do contrato não cria navegação circular', () => {
  const pagina = src('src/app/contratos/[id]/page.tsx');
  expect(pagina).toMatch(/<AtividadesVinculadas\b[^>]*\bcontratoId=\{contrato\.id\}[^>]*\bocultarAcessoDiario\b/);
});

test('o botão de anexar está marcado como ação contextual sem mudar sua permissão', () => {
  const docs = src('src/app/contratos/components/painel-documentos.tsx');
  // Confere a condição de permissão e os atributos do mesmo botão, sem depender da ordem JSX.
  const botao = docs.match(/podeEscrever\s*&&\s*<button\b[^>]*data-tec08-acao="anexar-documento"[^>]*>/)?.[0];
  expect(botao).toBeDefined();
  expect(botao).toMatch(/\sdata-tec08-contextual(?:\s|>)/);
  expect(botao).toContain('data-pi-acao="primaria"');
});
