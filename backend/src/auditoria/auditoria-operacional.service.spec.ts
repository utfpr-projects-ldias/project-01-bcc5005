import { jest } from '@jest/globals';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { AcaoAuditoria, TIPO_ENTIDADE_POR_ACAO } from './acao-auditoria.js';
import { AuditoriaService } from './auditoria.service.js';
import { EventoAuditoria } from './evento-auditoria.entity.js';

const CONTRATO = '00000000-0000-4000-8000-000000000010';
const ETAPA = '00000000-0000-4000-8000-000000000020';
const ator: UsuarioAutenticado = {
  id: '00000000-0000-4000-8000-000000000030',
  supertokensUserId: 'usuario-confirmado-pela-sessao',
  email: 'gestor@exemplo.invalid',
  perfil: PerfilUsuario.GESTOR,
};

function criarAmbiente() {
  const gravados: EventoAuditoria[] = [];
  const salvar = jest.fn(async (evento: EventoAuditoria) => {
    gravados.push(evento);
    return evento;
  });
  const criar = jest.fn((dados: Partial<EventoAuditoria>) => dados as EventoAuditoria);
  const localizarEtapa = jest.fn(async () => ({ contratoId: CONTRATO }));
  const repoEvento = { create: criar, save: salvar } as unknown as Repository<EventoAuditoria>;
  const repoEtapa = { findOne: localizarEtapa } as unknown as Repository<Etapa>;
  const manager = {
    getRepository: (classe: unknown) => {
      if (classe === Etapa) return repoEtapa;
      if (classe === EventoAuditoria) return repoEvento;
      throw new Error('Repositório inesperado');
    },
  } as unknown as EntityManager;
  const transacao = jest.fn(async <T>(op: (manager: EntityManager) => Promise<T>): Promise<T> => op(manager));
  const dataSource = { transaction: transacao } as unknown as DataSource;
  return { manager, gravados, criar, salvar, localizarEtapa, transacao, auditoria: new AuditoriaService(dataSource) };
}

const evento = (acao: AcaoAuditoria, entidadeTipo: 'CONTRATO' | 'USUARIO' | 'ETAPA' | 'ENTREGAVEL' | 'OCORRENCIA' | 'ATIVIDADE' | 'DOCUMENTO' = TIPO_ENTIDADE_POR_ACAO[acao]) => ({
  acao, entidadeTipo, entidadeId: entidadeTipo === 'ETAPA' ? ETAPA : CONTRATO,
  dadosPosteriores: { status: 'PLANEJADA' },
});

describe('TEC07-AJUSTES-02-01 - catálogo e contexto de auditoria', () => {
  it('mapeia explicitamente todos os eventos do enum, inclusive os legados', () => {
    expect(Object.keys(TIPO_ENTIDADE_POR_ACAO).sort()).toEqual(Object.values(AcaoAuditoria).sort());
    expect(TIPO_ENTIDADE_POR_ACAO[AcaoAuditoria.CONTRATO_EDITADO]).toBe('CONTRATO');
    expect(TIPO_ENTIDADE_POR_ACAO[AcaoAuditoria.USUARIO_PERMISSAO_CONCEDIDA]).toBe('USUARIO');
  });

  it.each([
    [AcaoAuditoria.ETAPA_CRIADA, 'ETAPA'],
    [AcaoAuditoria.ENTREGAVEL_CRIADO, 'ENTREGAVEL'],
    [AcaoAuditoria.OCORRENCIA_GERADA, 'OCORRENCIA'],
    [AcaoAuditoria.ATIVIDADE_CRIADA, 'ATIVIDADE'],
    [AcaoAuditoria.DOCUMENTO_ANEXADO, 'DOCUMENTO'],
  ] as const)('aceita %s em %s sem classificar como USUARIO', async (acao, tipo) => {
    const a = criarAmbiente();
    await a.auditoria.registrarNaTransacao(a.manager, ator, evento(acao, tipo));
    expect(a.salvar).toHaveBeenCalledTimes(1);
    expect(a.gravados[0]).toEqual(expect.objectContaining({ acao, entidadeTipo: tipo }));
    expect(a.gravados[0].contratoId).toBe(tipo === 'ETAPA' ? CONTRATO : null);
  });

  it('obtém contrato da Etapa por consulta persistida no mesmo EntityManager', async () => {
    const a = criarAmbiente();
    const eventoComContratoForjado = {
      ...evento(AcaoAuditoria.ETAPA_EDITADA, 'ETAPA'),
      // Campo extra proposital: simula tentativa de forjar o contrato.
      contratoId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    };

    await a.auditoria.registrarNaTransacao(
      a.manager, ator, eventoComContratoForjado,
    );
    expect(a.localizarEtapa).toHaveBeenCalledWith({
      where: { id: ETAPA }, select: { contratoId: true },
    });
    expect(a.gravados[0].contratoId).toBe(CONTRATO);
  });

  it('não registra Etapa inexistente nem inventa contexto', async () => {
    const a = criarAmbiente();
    a.localizarEtapa.mockResolvedValueOnce(null as never);
    await expect(a.auditoria.registrarNaTransacao(
      a.manager, ator, evento(AcaoAuditoria.ETAPA_CRIADA, 'ETAPA'),
    )).rejects.toThrow('não encontrada');
    expect(a.salvar).not.toHaveBeenCalled();
  });

  it('rejeita tipo incorreto, evento desconhecido, id vazio/longo e ator ausente', async () => {
    const a = criarAmbiente();
    for (const invalido of [
      evento(AcaoAuditoria.ETAPA_CRIADA, 'USUARIO'),
      { ...evento(AcaoAuditoria.CONTRATO_CRIADO), acao: 'EVT_INEXISTENTE' as AcaoAuditoria },
      { ...evento(AcaoAuditoria.CONTRATO_CRIADO), entidadeId: '   ' },
      { ...evento(AcaoAuditoria.CONTRATO_CRIADO), entidadeId: 'x'.repeat(256) },
    ]) {
      await expect(a.auditoria.registrarNaTransacao(a.manager, ator, invalido))
        .rejects.toThrow();
    }
    await expect(a.auditoria.executarComAuditoria({ ...ator, id: '' }, async () => ({
      resultado: true, evento: evento(AcaoAuditoria.CONTRATO_CRIADO),
    }))).rejects.toThrow('autenticado');
    expect(a.salvar).not.toHaveBeenCalled();
    expect(a.transacao).not.toHaveBeenCalled();
  });

  it('filtra campos sensíveis profundamente e mantém metadados úteis', async () => {
    const a = criarAmbiente();
    await a.auditoria.registrarNaTransacao(a.manager, ator, {
      ...evento(AcaoAuditoria.DOCUMENTO_ANEXADO, 'DOCUMENTO'),
      dadosPosteriores: {
        nome: 'Termo contratual', accessToken: 'SECRET-01', senhaUsuario: 'SECRET-02',
        anexos: [{ cookie: 'SECRET-03', nome: 'Termo' }],
        detalhes: { privateKey: 'SECRET-04', status: 'VALIDO' },
        ['__proto__']: 'nao-deve-existir',
      },
    });
    expect(a.gravados[0].dadosPosteriores).toEqual({
      nome: 'Termo contratual', anexos: [{ nome: 'Termo' }], detalhes: { status: 'VALIDO' },
    });
    expect(JSON.stringify(a.gravados)).not.toMatch(/SECRET-0[1234]/);
  });

  it('rejeita snapshots acima do limite e propaga falha para rollback', async () => {
    const a = criarAmbiente();
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true,
      evento: { ...evento(AcaoAuditoria.ENTREGAVEL_EDITADO, 'ENTREGAVEL'), dadosPosteriores: { texto: 'x'.repeat(17000) } },
    }))).rejects.toThrow('tamanho permitido');
    expect(a.salvar).not.toHaveBeenCalled();
    a.salvar.mockRejectedValueOnce(new Error('auditoria indisponível'));
    await expect(a.auditoria.executarComAuditoria(ator, async () => ({
      resultado: true, evento: evento(AcaoAuditoria.CONTRATO_EDITADO),
    }))).rejects.toThrow('auditoria indisponível');
  });
});
