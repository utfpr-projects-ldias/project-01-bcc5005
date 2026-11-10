import { readFileSync } from 'node:fs';
import path from 'node:path';

const src = (file: string) => readFileSync(path.resolve(process.cwd(), file), 'utf8');

test('a carteira distingue o estado encerrado da categoria de filtro concluídos', () => {
  const pagina = src('src/app/contratos/page.tsx');
  expect(pagina).toContain('data-tec08-estado={c.arquivadoEm');
  expect(pagina).toContain("encerrado ? 'encerrado'");
  expect(pagina).toContain('data-situacao={situacao}');
});

test('a aba de atividades do contrato não cria navegação circular', () => {
  const pagina = src('src/app/contratos/[id]/page.tsx');
  expect(pagina).toMatch(/<AtividadesVinculadas\b[^>]*\bcontratoId=\{contrato\.id\}[^>]*\bocultarAcessoDiario\b/);
});

test('o botão de anexar está marcado como ação contextual sem mudar sua permissão', () => {
  const docs = src('src/app/contratos/components/painel-documentos.tsx');
  expect(docs).toContain('podeEscrever && <button data-tec08-acao="anexar-documento" data-tec08-contextual');
});
