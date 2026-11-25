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
    'Informações do entregável',
    'Histórico do entregável',
    'aria-label="Consultar evidências"',
    '<AtividadesVinculadas contratoId={item.contratoId}',
  ]);
});

test('etapa mantém identificação e rastreabilidade antes dos entregáveis', () => {
  ordemEmFonte('src/app/contratos/components/painel-etapas.tsx', [
    'aria-label="Informações da etapa"', '<HistoricoEtapa', '<EntregaveisDaEtapa',
  ]);
});

test('evidência exibe comprovação documental antes da rastreabilidade', () => {
  ordemEmFonte('src/app/contratos/components/painel-comprovacao-evidencia.tsx', [
    'data-testid="status-verificacao"', 'aria-label="Comprovação da evidência"', 'data-tec08-historico-evidencia',
  ]);
});

test('contrato mantém identificação, vigência, agenda e histórico na visão geral sem abas redundantes', () => {
  ordemEmFonte('src/app/contratos/[id]/page.tsx', [
    'aria-label="Visão geral do contrato"', 'pi-faixa-vigencia',
    'Informações do contrato', '<AgendaContrato', '<HistoricoContrato',
  ]);
});
