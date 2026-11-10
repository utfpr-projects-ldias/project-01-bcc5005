import 'reflect-metadata';
import { jest } from '@jest/globals';
import { AuditoriaService } from './auditoria.service.js';
import { AcaoAuditoria } from './acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const ator = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'qa@example.invalid', supertokensUserId: 'qa', perfil: PerfilUsuario.ADMINISTRADOR };
const evento = { acao: AcaoAuditoria.ATIVIDADE_VERIFICADA, entidadeTipo: 'ATIVIDADE' as const,
  entidadeId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };

describe('Auditoria — ação derivada após evento na mesma transação', () => {
  it('primeiro grava evento da atividade, depois registra conclusão derivada', async () => {
    const ordem: string[] = [];
    const manager = {};
    const dataSource = { transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn(manager)) };
    const servico = new AuditoriaService(dataSource as never);
    jest.spyOn(servico, 'registrarNaTransacao').mockImplementation(async () => { ordem.push('auditoria'); });
    const resultado = await servico.executarComAuditoria(ator, async () => ({
      resultado: 'verificado', evento,
      aposEvento: async () => { ordem.push('conclusao'); },
    }));
    expect(resultado).toBe('verificado');
    expect(ordem).toEqual(['auditoria', 'conclusao']);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
  });
  it('propaga falha do encerramento derivado: transação inteira deve ser revertida', async () => {
    const dataSource = { transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn({})) };
    const servico = new AuditoriaService(dataSource as never);
    jest.spyOn(servico, 'registrarNaTransacao').mockResolvedValue(undefined);
    await expect(servico.executarComAuditoria(ator, async () => ({
      resultado: 'verificado', evento,
      aposEvento: async () => { throw new Error('Falha ao concluir entregável'); },
    }))).rejects.toThrow('Falha ao concluir entregável');
  });
});
