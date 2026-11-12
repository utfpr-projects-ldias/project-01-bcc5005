import { readFileSync } from 'node:fs';
import path from 'node:path';

const fonte = (arquivo: string) => readFileSync(path.resolve(process.cwd(), arquivo), 'utf8');

test('menu lateral não participa de spinner global, nem card perde opacidade', () => {
  const componente = fonte('src/app/components/estrutura-interna.tsx');
  const estilos = fonte('src/app/globals.css');
  expect(componente).not.toContain('<FeedbackInteracao />');
  expect(componente).not.toContain("setAttribute('data-tec08-ativado'");
  expect(estilos).toContain('[data-tec08-item-clicavel]:active { transform: scale(.999); opacity: 1 !important;');
  expect(estilos).not.toContain('opacity: .65;\n  filter: saturate(.75)');
  expect(estilos).toContain('transition: background-color 250ms ease');
});

test('spinner aparece só com aria-busy real; não cria borda luminosa', () => {
  const estilos = fonte('src/app/globals.css');
  expect(estilos).toContain('button[aria-busy="true"]::after');
  expect(estilos).toContain('button[aria-busy="true"]::before { content: none !important; }');
  expect(estilos).not.toContain('box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 26%, transparent)');
});


test('card oferece indicador central discreto sem spinner no menu e botões só ficam ocupados com aria-busy', () => {
  const css = fonte('src/app/globals.css');
  const cartao = fonte('src/app/atividades/components/cartao-atividade.tsx');
  const diario = fonte('src/app/contratos/components/atividades-vinculadas.tsx');
  expect(css).toContain('[data-tec08-card-carregando="true"]::after');
  expect(css).toContain('opacity: .88 !important;');
  expect(cartao).toContain('data-tec08-card-carregando');
  expect(diario).toContain('ModalCadastroAtividade');
  expect(diario).not.toContain('href={origem}');
});
