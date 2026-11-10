import { readFileSync } from 'node:fs';
import path from 'node:path';

const ler = (nome: string) => readFileSync(path.resolve(process.cwd(), nome), 'utf8');
test('detalhe não mostra Fechar novamente enquanto houver atividade Registrada', () => {
  const fonte = ler('src/app/contratos/components/modal-detalhe-entregavel.tsx');
  expect(fonte).toContain("status: 'REGISTRADA'");
  expect(fonte).toContain('pendenciasAtividades.total === 0');
  expect(fonte).toContain('pendenciasAtividades.loading');
});
test('criação invalida todas as consultas de atividades, inclusive a contagem de pendências', () => {
  const fonte = ler('src/hooks/use-atividades.ts');
  expect(fonte).toContain("cache?.invalidar(['atividades', contratoId])");
});
test('verificação invalida os dados do entregável e da etapa, por causa da conclusão automática', () => {
  const fonte = ler('src/app/atividades/components/cartao-atividade.tsx');
  expect(fonte).toContain("cache?.invalidar(['entregaveis', 'contrato', contratoId])");
  expect(fonte).toContain("cache?.invalidar(['etapas', 'contrato', contratoId])");
});

test('pendências bloqueiam conclusão sem uma caixa explicativa redundante', () => {
  const fonte = ler('src/app/contratos/components/modal-detalhe-entregavel.tsx');
  expect(fonte).not.toContain('O botão de conclusão reaparece somente se ainda for necessário');
  expect(fonte).toContain('pendenciasAtividades.total === 0');
});
