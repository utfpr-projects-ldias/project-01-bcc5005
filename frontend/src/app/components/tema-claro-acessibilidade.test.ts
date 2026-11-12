/** TEC08-03: impede regressões de contraste e semântica no modo claro.
 * Não substitui a auditoria visual dos temas no Firefox/Chromium reais.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const app = path.resolve(process.cwd(), 'src/app');
const css = readFileSync(path.join(app, 'globals.css'), 'utf8');
const listaContratos = readFileSync(path.join(app, 'contratos/page.tsx'), 'utf8');
const novoContrato = readFileSync(path.join(app, 'contratos/novo/page.tsx'), 'utf8');
const detalhe = readFileSync(path.join(app, 'contratos/[id]/page.tsx'), 'utf8');

function luminancia(hex: string) {
  const canais = [1, 3, 5].map(i => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return canais[0] * 0.2126 + canais[1] * 0.7152 + canais[2] * 0.0722;
}
function contraste(cor: string, fundo: string) {
  const [a, b] = [luminancia(cor), luminancia(fundo)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

test('o claro define superfície própria e mantém os estados contrastantes', () => {
  const trecho = css.split('/* TEC08-03 · Revisão de acessibilidade do tema claro')[1];
  expect(trecho).toContain('@media (prefers-color-scheme: light)');
  expect(trecho).toContain('--bg-primary: #f7faf6;');
  for (const tinta of ['#854d0e', '#713f12', '#5b21b6', '#0f766e', '#b91c1c', '#42534a', '#166534']) {
    expect(contraste(tinta, '#f7faf6')).toBeGreaterThanOrEqual(4.5);
  }
  expect(contraste('#17251c', '#f7faf6')).toBeGreaterThanOrEqual(7);
});

test('suspensão e arquivamento não compartilham a mesma cor de texto', () => {
  expect(css).toContain('--ui-suspenso: #713f12;');
  expect(css).toContain('--ui-arquivado: #854d0e;');
  expect(css).toContain('.contrato-card-documental[data-situacao="suspensos"] .contrato-card-titulo');
  expect(css).toContain('.contrato-card-documental[data-situacao="arquivados"] .contrato-card-titulo');
  expect(listaContratos).toContain("'text-foreground/75'");
});

test('o cadastro abre a visão geral e o anexo principal fica disponível sob demanda', () => {
  expect(novoContrato).toContain('router.push(`/contratos/${encodeURIComponent(criado.id)}`)');
  expect(novoContrato).not.toContain('?anexarDocumento=principal');
  expect(detalhe).toContain('setAbaContrato');
});

test('ações de arquivar e editar têm ícone acompanhado de rótulo', () => {
  expect(detalhe).toMatch(/aria-label="Arquivar contrato"[\s\S]{0,550}<svg aria-hidden="true"/);
  expect(detalhe).toMatch(/<\/svg>\s*Arquivar\s*<\/button>/);
  expect(detalhe).toContain("{podeEditar ? 'Editar' : 'Alterar situação'}");
});
