/** REG-01/02: evita regressões de contraste nos tokens e nos componentes já entregues. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const app = path.resolve(process.cwd(), 'src/app');
const css = readFileSync(path.join(app, 'globals.css'), 'utf8');

function variaveis(bloco: string): Record<string, string> {
  return Object.fromEntries(Array.from(bloco.matchAll(/(--[\w-]+):\s*(#[\da-fA-F]{6})\s*;/g), ([, nome, cor]) => [nome, cor]));
}

const claro = variaveis(css.match(/:root\s*\{([^}]+)\}/)?.[1] ?? '');
const escuro = { ...claro, ...variaveis(css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\s*\{([^}]+)\}/)?.[1] ?? '') };

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((posicao) => {
    const canal = parseInt(hex.slice(posicao, posicao + 2), 16) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(fg: string, bg: string): number {
  const luminosidades = [luminancia(fg), luminancia(bg)].sort((a, b) => b - a);
  return (luminosidades[0] + 0.05) / (luminosidades[1] + 0.05);
}

function componentes(diretorio: string): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((item) => {
    const local = path.join(diretorio, item.name);
    return item.isDirectory() ? componentes(local) : item.isFile() && item.name.endsWith('.tsx') && !item.name.endsWith('.test.tsx') ? [local] : [];
  });
}

test('cores semânticas estão ligadas aos tokens Tailwind v4', () => {
  expect(css).toMatch(/--color-on-brand-green:\s*var\(--text-on-accent-green\)/);
  expect(css).toMatch(/--color-error-text:\s*var\(--text-error\)/);
  expect(claro['--accent-green']).toBe('#5FD34A'); // Identidade visual conservada.
  expect(escuro['--accent-green']).toBe('#5FD34A');
});

test.each([['claro', claro], ['escuro', escuro]] as const)(
  'texto em verde e erro são legíveis em todas as superfícies opacas do tema %s', (_nome, tema) => {
    expect(contraste(tema['--text-on-accent-green'], tema['--accent-green'])).toBeGreaterThanOrEqual(4.5);
    for (const superficie of ['--bg-primary', '--bg-secondary']) {
      expect(contraste(tema['--text-error'], tema[superficie])).toBeGreaterThanOrEqual(4.5);
    }
  },
);

test('nenhum componente mantém texto claro em fundo verde ou erro pouco legível', () => {
  const arquivos = componentes(app);
  expect(arquivos.length).toBeGreaterThan(10);
  for (const arquivo of arquivos) {
    const fonte = readFileSync(arquivo, 'utf8');
    expect(fonte).not.toMatch(/\btext-background\b/);
    expect(fonte).not.toMatch(/\btext-red-400\b/);
    expect(fonte).not.toMatch(/\btext-brand-green\b/); // Destaques verdes diretos também tinham contraste baixo.
  }
});
