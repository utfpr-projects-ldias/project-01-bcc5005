import { documentacaoVerificada } from './conclusao-documental.js';
import type { EntityManager } from 'typeorm';
const manager = (dados: Record<string, number>) => ({ query: async () => [dados] }) as unknown as EntityManager;
const pronta = { etapas:1, entregaveis:1, evidencias:2, verificadas:2, etapas_sem_entregavel:0, entregaveis_sem_evidencia:0 };
describe('fechamento documental sem presumir estado operacional', () => {
  test('evidências verificadas completam toda a documentação', async () => {
    expect(await documentacaoVerificada(manager(pronta), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(true);
  });
  test('uma evidência pendente impede conclusão', async () => {
    expect(await documentacaoVerificada(manager({...pronta, verificadas:1}), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
  });
  test('sem itens ou com filhos vazios jamais fecha por 0/0', async () => {
    expect(await documentacaoVerificada(manager({...pronta, etapas:0, entregaveis:0,evidencias:0,verificadas:0}), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
    expect(await documentacaoVerificada(manager({...pronta, entregaveis_sem_evidencia:1}), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toBe(false);
  });
});
