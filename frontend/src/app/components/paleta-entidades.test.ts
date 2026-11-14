import { readFileSync } from 'node:fs';
import path from 'node:path';

const css = readFileSync(path.resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

test('ativa verde primário e outras situações são distintas nos dois temas', () => {
  expect(css).toMatch(/--tec08-status-bg:\s*#5fd34a/);
  for (const [estado, cor] of [['revisao', '#0f766e'], ['concluido', '#6d28d9'],
    ['suspenso', '#854d0e'], ['arquivado', '#92400e'], ['cancelado', '#991b1b'],
    ['encerrado', '#334155']] as const) {
    expect(css).toContain(`[data-tec08-estado="${estado}"]`);
    expect(css).toContain(`--tec08-status-bg: ${cor}`);
  }
  expect(css).toContain('@media (prefers-color-scheme: light)');
  expect(css).toContain('[data-evidencia-estado]');
  expect(css).toContain('[data-entregavel-estado]');
});


test('as quatro abas do contrato seguem o próprio status e não o verde fixo', () => {
  expect(css).toContain('[data-tec08-abas-contrato] > button[role="tab"][aria-selected="true"]');
  expect(css).toContain('background-color: var(--tec08-status-bg) !important');
  expect(css).not.toContain('[data-tec08-abas-contrato] > button.bg-brand-green[role="tab"]');
  expect(css).toContain('[aria-selected="false"]:hover');
});

test('encerrado mantém borda, selo e título cinza mesmo quando há comprovação documental', () => {
  expect(css).toContain('.contrato-card-documental[data-tec08-estado="encerrado"]:has([data-documental-completo="true"])');
  expect(css).toContain('color: #cbd5e1 !important');
  expect(css).toContain('color: #334155 !important');
});

test('botão anexar documento não recebe verde fixo e controla hover/foco por estado', () => {
  expect(css).toContain('button.bg-brand-green[data-tec08-acao="anexar-documento"][data-tec08-contextual]');
  expect(css).toContain('background-color: var(--tec08-status-hover) !important');
  expect(css).toContain('outline: 2px solid var(--tec08-status-border) !important');
});

test('ícone de evidência herda sua situação e não a do contrato', () => {
  expect(css).toContain('[data-evidencia-estado] [data-tec08-icone-evidencia]');
  expect(css).toContain('[data-tec08-fechar-modal]');
});


test('Anexar documento segue estado do contrato e possui hover e foco sem modificar ações perigosas', () => {
  expect(css).toContain('[data-tec08-acao="anexar-documento"]:not(:disabled)');
  expect(css).toContain('background-color: var(--tec08-status-bg) !important');
  expect(css).toContain('background-color: var(--tec08-status-hover) !important');
  expect(css).toContain('outline-color: var(--tec08-status-border) !important');
  expect(css).toContain('--tec08-status-fg: #fff');
});


test('Patch 8: ações de criação, seções e formulários recebem status do contexto', () => {
  expect(css).toContain('[data-tec08-acao-criar]:not(:disabled)');
  expect(css).toContain('[data-tec08-secao-contextual] > h2');
  expect(css).toContain('[data-tec08-formulario-contextual] button.bg-brand-green:not(:disabled)');
  expect(css).toContain('background-color: var(--tec08-status-bg) !important');
  expect(css).toContain('color: var(--tec08-status-heading) !important');
});

test('Patch 8: evidência pendente é amarela no card e no painel de comprovantes', () => {
  expect(css).toContain('[data-evidencia-estado="pendente"] { --tec08-card-borda:');
  expect(css).toContain('--tec08-evidencia-borda: #eab308');
  expect(css).toContain('[data-tec08-painel-evidencia][data-evidencia-estado]');
  expect(css).toContain('[data-tec08-modal][data-tec08-camada="edicao"]');
});


test('Patch 26: superfícies e ações usam tokens do próprio contexto, incluindo não iniciada e verde-musgo', () => {
  expect(css).toContain('[data-tec08-estado="nao-iniciado"]');
  expect(css).toContain('[data-pi-painel-contextual]');
  expect(css).toContain('[data-pi-acao="secundaria"]');
  expect(css).toContain('[data-pi-acao="primaria"]');
  expect(css).toContain('--pi-acao-bg: #486129');
  expect(css).toContain('background-color: var(--pi-acao-bg) !important');
});


test('Patch 27: barra de filtros das etapas usa tokens de contexto', () => {
  expect(css).toContain('[data-pi-painel-contextual][data-tec08-estado] [data-pi-etapas-filtros][role="tablist"]');
  expect(css).toContain('border-color: color-mix(in srgb, var(--pi-cor-propria) 48%, transparent) !important');
  expect(css).toContain('[data-pi-etapas-filtros][role="tablist"] > button[role="tab"][aria-selected="true"]');
});

test('botões de aprovação, conclusão e fechamento têm precedência explícita', () => {
  expect(css).toContain('button[data-tec08-confirmar][data-tec08-acao-aprovar]:not(:disabled)');
  expect(css).toContain('button[data-tec08-confirmar][data-tec08-acao-roxa]:not(:disabled)');
  expect(css).toContain('header button[data-tec08-fechar-modal]:not(:disabled)');
  expect(css).toContain('button[data-tec08-confirmar][data-tec08-acao-perigosa]:not(:disabled)');
  expect(css).toContain('[data-tec08-corpo-modal] :where(p, li, dt, dd');
});
