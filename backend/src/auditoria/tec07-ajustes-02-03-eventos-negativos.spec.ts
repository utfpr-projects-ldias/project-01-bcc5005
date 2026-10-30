import { jest } from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { AcaoAuditoria } from './acao-auditoria.js';
import { AuditoriaService, type AlteracaoAuditavel } from './auditoria.service.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';

const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ator: UsuarioAutenticado = {
  id: ID, supertokensUserId: 'qa-ator', email: 'ator@invalid', perfil: PerfilUsuario.GESTOR,
};
const eventoBase: AlteracaoAuditavel = {
  acao: AcaoAuditoria.CONTRATO_EDITADO, entidadeTipo: 'CONTRATO', entidadeId: ID,
};
function ambiente() {
  const gravar = jest.fn(async (entidade: EventoAuditoria) => entidade);
  const criar = jest.fn((dados: Partial<EventoAuditoria>) => dados as EventoAuditoria);
  const manager = { getRepository: (classe: unknown) => {
    if (classe === EventoAuditoria) return { create: criar, save: gravar } as unknown as Repository<EventoAuditoria>;
    if (classe === Etapa) return { findOne: async () => ({ contratoId: ID }) } as unknown as Repository<Etapa>;
    throw new Error('Repositório inesperado');
  } } as unknown as EntityManager;
  const transaction = jest.fn(async <T>(op: (manager: EntityManager) => Promise<T>) => op(manager));
  const auditoria = new AuditoriaService({ transaction } as unknown as DataSource);
  return { gravar, criar, manager, transaction, auditoria };
}

describe('TEC07-AJUSTES-02-03 — rejeições de auditoria e confidencialidade', () => {
  it('não persiste entidades, ações, autores e IDs inválidos', async () => {
    const a = ambiente();
    const invalidos: AlteracaoAuditavel[] = [
      { ...eventoBase, acao: 'AÇÃO_FORJADA' as AcaoAuditoria },
      { ...eventoBase, entidadeTipo: 'USUARIO' },
      { ...eventoBase, entidadeId: '    ' },
      { ...eventoBase, entidadeId: ` ${ID}` },
    ];
    for (const evento of invalidos) {
      await expect(a.auditoria.registrarNaTransacao(a.manager, ator, evento)).rejects.toThrow();
    }
    await expect(a.auditoria.registrarNaTransacao(a.manager, { ...ator, supertokensUserId: '' }, eventoBase))
      .rejects.toThrow();
    expect(a.gravar).not.toHaveBeenCalled();
  });

  it('filtra segredos de objetos, arrays e metadados, mantendo antes/depois', async () => {
    const a = ambiente();
    await a.auditoria.registrarNaTransacao(a.manager, ator, {
      ...eventoBase,
      dadosAnteriores: { nome: 'Anterior', lista: [{ cookie: 'SEGREDO', nome: 'registro' }] },
      dadosPosteriores: { nome: 'Atual', password: 'SEGREDO', documento: {
        apiKey: 'SEGREDO', propriedade: 'permitida', chaves: [{ sessionId: 'SEGREDO', ordem: 2 }],
      } },
    });
    expect(a.gravar).toHaveBeenCalledTimes(1);
    const registro = a.criar.mock.results[0]?.value;
    expect(registro).toMatchObject({
      dadosAnteriores: { nome: 'Anterior', lista: [{ nome: 'registro' }] },
      dadosPosteriores: { nome: 'Atual', documento: { propriedade: 'permitida', chaves: [{ ordem: 2 }] } },
    });
    expect(JSON.stringify(registro)).not.toContain('SEGREDO');
  });

  it('rejeita snapshots perigosos, NaN, referências circulares e profundidade excessiva', async () => {
    const a = ambiente();
    const circular: Record<string, unknown> = {};
    circular.proximo = circular;
    const profundidade = { nivel: { nivel: { nivel: { nivel: { nivel: { nivel: { nivel: { nivel: { nivel: 1 } } } } } } } } };
    for (const valor of [{ valor: Number.NaN }, circular, profundidade,
      { data: new Date('invalid') }, { arquivo: () => 'segredo' }]) {
      await expect(a.auditoria.registrarNaTransacao(a.manager, ator,
        { ...eventoBase, dadosPosteriores: valor })).rejects.toThrow();
    }
    expect(a.gravar).not.toHaveBeenCalled();
  });

  it('propaga erro do armazenamento; jamais simula sucesso de auditoria', async () => {
    const a = ambiente();
    a.gravar.mockRejectedValueOnce(new Error('Falha no INSERT do evento'));
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: { ok: true }, evento: eventoBase,
    }))).rejects.toThrow('Falha no INSERT do evento');
    expect(a.transaction).toHaveBeenCalledTimes(1);
  });
});
