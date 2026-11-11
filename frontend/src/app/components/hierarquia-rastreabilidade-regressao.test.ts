import { readFileSync } from 'node:fs';
import path from 'node:path';

const fonte = (arquivo: string) => readFileSync(path.resolve(process.cwd(), arquivo), 'utf8');

function ordemEmFonte(arquivo: string, marcadores: string[]) {
  const texto = fonte(arquivo);
  const indices = marcadores.map(marcador => texto.indexOf(marcador));
  expect(indices.every(valor => valor >= 0)).toBe(true);
  expect(indices).toEqual([...indices].sort((a, b) => a - b));
}

test('entregável mantém identificação, rastreabilidade, evidências e atividades nesta ordem', () => {
  ordemEmFonte('src/app/contratos/components/conteudo-entregavel.tsx', [
    'Quadro titulo="Identificação e planejamento"',
    'Rastreabilidade do entregável',
    'aria-label="Consultar evidências"',
    '<AtividadesVinculadas contratoId={item.contratoId}',
  ]);
});

test('etapa mantém identificação e rastreabilidade antes dos entregáveis', () => {
  ordemEmFonte('src/app/contratos/components/painel-etapas.tsx', [
    '<dl data-tec08-secao-contextual', '<HistoricoEtapa', '<EntregaveisDaEtapa',
  ]);
});

test('evidência exibe rastreabilidade antes da comprovação documental', () => {
  ordemEmFonte('src/app/contratos/components/painel-comprovacao-evidencia.tsx', [
    'data-testid="status-verificacao"', 'data-tec08-historico-evidencia', 'aria-label="Comprovação da evidência"',
  ]);
});

test('contrato posiciona rastreabilidade após identificação e antes de observações', () => {
  ordemEmFonte('src/app/contratos/[id]/page.tsx', [
    'aria-label="Informações do contrato"', '<HistoricoContrato', 'aria-label="Descrição e observações"',
  ]);
});
