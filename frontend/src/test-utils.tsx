import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { ProvedorConsultas } from '@/app/components/provedor-consultas';
/** Cache novo por render (nenhum vazamento entre testes). */
export function renderComConsultas(elemento: ReactElement, opcoes?: Omit<RenderOptions, 'wrapper'>) {
  return render(elemento, { ...opcoes, wrapper: ({ children }: { children: ReactNode }) => <ProvedorConsultas>{children}</ProvedorConsultas> });
}
