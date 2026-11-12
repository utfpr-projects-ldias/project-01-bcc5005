import { jest } from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { AcaoAuditoria } from './acao-auditoria.js';
import { AuditoriaService } from './auditoria.service.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';

const CONTRATO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ETAPA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const DOCUMENTO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator: UsuarioAutenticado = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  supertokensUserId: 'usuario-auth-comprovado',
  email: 'integracao@example.invalid', perfil: PerfilUsuario.GESTOR,
};

function ambiente() {
  const criados: EventoAuditoria[] = [];
  const salvar = jest.fn(async (registro: EventoAuditoria) => {
    criados.push(registro);
    return registro;
  });
  const localizarEtapa = jest.fn(async () => ({ contratoId: CONTRATO }));
  const manager = {
    getRepository: (entidade: unknown) => {
      if (entidade === EventoAuditoria) return {
        create: (dados: Partial<EventoAuditoria>) => dados as EventoAuditoria,
        save: salvar,
      } as unknown as Repository<EventoAuditoria>;
      if (entidade === Etapa) return { findOne: localizarEtapa } as unknown as Repository<Etapa>;
      throw new Error('Repositório inesperado no contrato de integração');
    },
  } as unknown as EntityManager;
  const transaction = jest.fn(async <T>(f: (m: EntityManager) => Promise<T>): Promise<T> => f(manager));
  const auditoria = new AuditoriaService({ transaction } as unknown as DataSource);
  return { auditoria, manager, criados, salvar, localizarEtapa, transaction };
}

const eventoDocumento = {
  acao: AcaoAuditoria.DOCUMENTO_ANEXADO,
  entidadeTipo: 'DOCUMENTO' as const,
  entidadeId: DOCUMENTO,
  dadosPosteriores: { nome: 'Aditivo contratual', token: 'NAO_PERSISTIR' },
};

describe('TEC07-AJUSTES-02-04 — contrato v1 de contexto auditável extensível', () => {
  it('preserva compatibilidade: tipo sem módulo não inventa contrato raiz', async () => {
    const a = ambiente();
    await a.auditoria.registrarNaTransacao(a.manager, ator, eventoDocumento);
    expect(a.criados[0].contratoId).toBeNull();
    expect(a.criados[0].dadosPosteriores).toEqual({ nome: 'Aditivo contratual' });
  });

  it('usa o mesmo EntityManager da escrita e nunca aceita contratoId forjado do chamador', async () => {
    const a = ambiente();
    const resolver = jest.fn(async (manager: EntityManager, id: string) => {
      expect(manager).toBe(a.manager);
      expect(id).toBe(DOCUMENTO);
      // Nesta fixture, o módulo proprietário consultaria a entidade no manager.
      return CONTRATO;
    });
    a.auditoria.registrarResolvedorContexto('DOCUMENTO', resolver);
    const forjado = {
      ...eventoDocumento,
      contratoId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    };
    await a.auditoria.registrarNaTransacao(a.manager, ator, forjado);
    expect(a.criados[0].contratoId).toBe(CONTRATO);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(a.criados[0].dadosPosteriores).toEqual({ nome: 'Aditivo contratual' });
  });

  it('proíbe substituir resolvedores de outro módulo e tipos legados/Etapa', () => {
    const a = ambiente();
    const resolver = async () => CONTRATO;
    a.auditoria.registrarResolvedorContexto('ENTREGAVEL', resolver);
    expect(() => a.auditoria.registrarResolvedorContexto('ENTREGAVEL', resolver))
      .toThrow('já registrado');
    for (const tipo of ['CONTRATO', 'USUARIO', 'ETAPA', 'EVIDENCIA', 'DESCONHECIDO']) {
      expect(() => a.auditoria.registrarResolvedorContexto(
        tipo as 'DOCUMENTO', resolver,
      )).toThrow('inválido');
    }
  });

  it('não persiste auditoria com recurso inexistente ou resolvedor de retorno inválido', async () => {
    for (const retorno of [null, '', 'contrato-forjado', 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
      const a = ambiente();
      a.auditoria.registrarResolvedorContexto('DOCUMENTO', async () => retorno);
      await expect(a.auditoria.registrarNaTransacao(a.manager, ator, eventoDocumento))
        .rejects.toThrow('contrato raiz persistido válido');
      expect(a.salvar).not.toHaveBeenCalled();
    }
  });

  it('propaga falha do resolvedor e da escrita da auditoria, sem falso sucesso', async () => {
    const a = ambiente();
    a.auditoria.registrarResolvedorContexto('DOCUMENTO', async () => {
      throw new Error('Consulta ao documento falhou');
    });
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true, evento: eventoDocumento,
    }))).rejects.toThrow('Consulta ao documento falhou');
    expect(a.salvar).not.toHaveBeenCalled();
    expect(a.transaction).toHaveBeenCalledTimes(1);
  });

  it('não altera resolução existente de CONTRATO, USUARIO e ETAPA', async () => {
    const a = ambiente();
    await a.auditoria.registrarNaTransacao(a.manager, ator, {
      acao: AcaoAuditoria.CONTRATO_CRIADO,
      entidadeTipo: 'CONTRATO', entidadeId: CONTRATO,
    });
    await a.auditoria.registrarNaTransacao(a.manager, ator, {
      acao: AcaoAuditoria.USUARIO_CRIADO,
      entidadeTipo: 'USUARIO', entidadeId: ator.id,
    });
    await a.auditoria.registrarNaTransacao(a.manager, ator, {
      acao: AcaoAuditoria.ETAPA_EDITADA,
      entidadeTipo: 'ETAPA', entidadeId: ETAPA,
    });
    expect(a.criados.map((item) => item.contratoId)).toEqual([CONTRATO, null, CONTRATO]);
    expect(a.localizarEtapa).toHaveBeenCalledTimes(1);
  });
});
