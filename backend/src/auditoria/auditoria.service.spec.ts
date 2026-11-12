import { jest } from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AcaoAuditoria } from './acao-auditoria.js';
import { AuditoriaService } from './auditoria.service.js';
import type { EventoAuditoria } from './evento-auditoria.entity.js';

const ator: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-000000000001',
  supertokensUserId: 'supertokens-real-da-sessao',
  email: 'admin@exemplo.invalid',
  perfil: PerfilUsuario.ADMINISTRADOR,
};

const evento = () => ({
  acao: AcaoAuditoria.CONTRATO_PRAZO_ALTERADO,
  entidadeTipo: 'CONTRATO' as const,
  entidadeId: '00000000-0000-4000-8000-000000000002',
  dadosAnteriores: { terminoVigencia: '2026-11-30' },
  dadosPosteriores: { terminoVigencia: '2027-11-30' },
});

function ambiente() {
  const objetos: Partial<EventoAuditoria>[] = [];
  const salvar = jest.fn(async (registro: EventoAuditoria): Promise<EventoAuditoria> => {
    objetos.push(registro);
    return registro;
  });
  const criar = jest.fn((dados: Partial<EventoAuditoria>): EventoAuditoria => dados as EventoAuditoria);
  const repo = { create: criar, save: salvar } as unknown as Repository<EventoAuditoria>;
  const manager = { getRepository: () => repo } as unknown as EntityManager;
  let confirmou = false;
  let desfez = false;
  const transacionar = jest.fn(async <T>(fn: (em: EntityManager) => Promise<T>): Promise<T> => {
    try {
      const resultado = await fn(manager);
      confirmou = true;
      return resultado;
    } catch (error) {
      desfez = true;
      throw error;
    }
  });
  const dataSource = { transaction: transacionar } as unknown as DataSource;
  const auditoria = new AuditoriaService(dataSource);
  return {
    auditoria, salvar, criar, manager, objetos,
    get confirmou() { return confirmou; }, get desfez() { return desfez; },
    transacionar,
  };
}

describe('TEC07-03 - auditoria inicial', () => {
  it('grava o ator real e valores anterior/posterior dentro da transação', async () => {
    const a = ambiente();
    const resultado = await a.auditoria.executarComAuditoria(ator, async (manager) => {
      expect(manager).toBe(a.manager);
      return { resultado: 'contrato atualizado', evento: evento() };
    });
    expect(resultado).toBe('contrato atualizado');
    expect(a.confirmou).toBe(true);
    expect(a.criar).toHaveBeenCalledWith(expect.objectContaining({
      atorSupertokensUserId: 'supertokens-real-da-sessao',
      acao: AcaoAuditoria.CONTRATO_PRAZO_ALTERADO,
      dadosAnteriores: { terminoVigencia: '2026-11-30' },
      dadosPosteriores: { terminoVigencia: '2027-11-30' },
    }));
    expect(a.salvar).toHaveBeenCalledTimes(1);
  });

  it('propaga falha de escrita do evento e não confirma a transação simulada', async () => {
    const a = ambiente();
    a.salvar.mockRejectedValueOnce(new Error('disco indisponível'));
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true, evento: evento(),
    }))).rejects.toThrow('disco indisponível');
    expect(a.desfez).toBe(true);
    expect(a.confirmou).toBe(false);
  });

  it('propaga falha na operação sem tentar registrar evento', async () => {
    const a = ambiente();
    await expect(a.auditoria.executarComAuditoria(ator, async () => {
      throw new Error('falha ao gravar contrato');
    })).rejects.toThrow('falha ao gravar contrato');
    expect(a.salvar).not.toHaveBeenCalled();
    expect(a.desfez).toBe(true);
  });

  it('não persiste segredos em snapshots, mesmo aninhados', async () => {
    const a = ambiente();
    await a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true,
      evento: {
        ...evento(),
        dadosPosteriores: {
          status: 'EM_EXECUCAO', senha: 'nunca-gravar', accessToken: 'outro-segredo',
          detalhes: { cookie: 'segredo', observacao: 'sem problemas' },
        },
      },
    }));
    expect(a.criar).toHaveBeenCalledWith(expect.objectContaining({
      dadosPosteriores: { status: 'EM_EXECUCAO', detalhes: { observacao: 'sem problemas' } },
    }));
    expect(JSON.stringify(a.objetos)).not.toContain('nunca-gravar');
    expect(JSON.stringify(a.objetos)).not.toContain('outro-segredo');
  });

  it('recusa ator não autenticado e combinação inválida de recurso/ação', async () => {
    const a = ambiente();
    await expect(a.auditoria.executarComAuditoria({ ...ator, supertokensUserId: '' }, async () => ({
      resultado: true, evento: evento(),
    }))).rejects.toThrow('usuário autenticado');
    expect(a.transacionar).not.toHaveBeenCalled();
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true, evento: { ...evento(), entidadeTipo: 'USUARIO' as const },
    }))).rejects.toThrow('Recurso de auditoria inválido');
    expect(a.desfez).toBe(true);
  });

  it('não grava snapshots gigantes que excedam limite', async () => {
    const a = ambiente();
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true,
      evento: { ...evento(), dadosPosteriores: { objeto: 'x'.repeat(17_000) } },
    }))).rejects.toThrow('tamanho permitido');
    expect(a.salvar).not.toHaveBeenCalled();
  });
});
