import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { AtividadesService } from './atividades.service.js';
import { AtividadeEntity } from './atividade.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const E = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const D = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const ator = { id: 'admin-qa', perfil: PerfilUsuario.ADMINISTRADOR, nome: 'QA', email: 'qa@example.invalid' } as never;

type Medicao = { ocorrenciaId: string; quantidade: string };
function montar(opts: { prim?: string | null; secundarias?: string[]; quantidade?: string | null; medicoes?: Medicao[] } = {}) {
  const entregavel = { id: E, etapaId: E, contratoId: C, tipo: 'QUANTITATIVO', statusExecucao: 'EM_ANDAMENTO', arquivadoEm: null };
  const ocorrencias = new Map([A, B, D].map(id => [id, { id, contratoId: C, entregavelId: E,
    status: 'EM_ANDAMENTO', modoRegistro: 'QUANTITATIVO', metaQuantidade: '100',
    substituidaEm: null, minimoEvidenciasVerificadas: 0, minimoAtividadesVerificadas: 0,
    evidenciaExigida: 'NENHUMA' }] as const));
  const atividade = {
    id: ID, contratoId: C, ocorrenciaId: opts.prim ?? null, quantidadeExecucao: opts.quantidade ?? null,
    ocorrencias: (opts.secundarias ?? []).map(id => ocorrencias.get(id)!), entregaveis: [entregavel],
    titulo: 'Vistoria', descricao: 'Realização de vistoria contratual', tipo: 'Vistoria',
    dataHora: new Date('2026-11-22T15:00:00.000Z'), status: 'REGISTRADA',
  };
  let medicoes = [...(opts.medicoes ?? [])];
  const eventos: Array<{ dadosAnteriores?: Record<string, unknown>; dadosPosteriores?: Record<string, unknown> }> = [];
  const manager = {
    findOne: jest.fn(async (entidade: unknown, opcoes?: { where?: { id?: string } }) => {
      if (entidade === AtividadeEntity) return atividade;
      if (entidade === Contrato) return { id: C, status: 'EM_EXECUCAO', arquivadoEm: null };
      if (entidade === Ocorrencia) return ocorrencias.get(opcoes?.where?.id ?? '') ?? null;
      return null;
    }),
    findOneBy: jest.fn(async (entidade: unknown) => entidade === Entregavel ? entregavel : null),
    find: jest.fn(async (entidade: unknown) => entidade === Entregavel ? [entregavel]
      : entidade === Etapa ? [{ id: E, status: 'EM_ANDAMENTO', arquivadoEm: null }] : []),
    save: jest.fn(async (_entidade: unknown, registro: unknown) => registro),
    query: jest.fn(async (sql: string, parametros?: unknown[]) => {
      if (sql.includes('DELETE FROM atividade_ocorrencia_medicoes')) { medicoes = []; return []; }
      if (sql.includes('INSERT INTO atividade_ocorrencia_medicoes')) {
        medicoes.push({ ocorrenciaId: String(parametros?.[1]), quantidade: String(parametros?.[3]) }); return [];
      }
      if (sql.includes('FROM atividade_ocorrencia_medicoes')) return medicoes.map(m => ({ ...m }));
      if (sql.includes('FROM ocorrencia_lancamentos')) return [{ total: '0' }];
      if (sql.includes('FROM atividades a')) return [{ registrada: '0', verificada: '0', verificadas: '0', pendentes: '0' }];
      return [{ total: '0', fotos: '0', relatorios: '0' }];
    }),
  };
  const auditoria = {
    executarComAuditoria: async (_usuario: unknown, fn: (m: typeof manager) => Promise<{
      resultado: unknown; evento?: { dadosAnteriores?: Record<string, unknown>; dadosPosteriores?: Record<string, unknown> }
    }>) => { const retorno = await fn(manager); if (retorno.evento) eventos.push(retorno.evento); return retorno.resultado; },
    registrarNaTransacao: jest.fn(async () => undefined),
  };
  return { atividade, manager, eventos, medicoes: () => medicoes, service: new AtividadesService({} as never, auditoria as never, {} as never) };
}

describe('R28 — medição, desvinculação e primária não alteram progresso implicitamente', () => {
  it('bloqueia remover vínculo com medição persistida sem substituir explicitamente as medições', async () => {
    const c = montar({ secundarias: [A, B], medicoes: [{ ocorrenciaId: A, quantidade: '2.000' }, { ocorrenciaId: B, quantidade: '3.000' }] });
    await expect(c.service.update(C, ID, { ocorrenciaIds: [B] }, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.manager.save).not.toHaveBeenCalled();
    expect(c.medicoes()).toHaveLength(2);
  });
  it('permite substituir conscientemente medições, preserva B e audita antes/depois', async () => {
    const c = montar({ secundarias: [A, B], medicoes: [{ ocorrenciaId: A, quantidade: '2.000' }, { ocorrenciaId: B, quantidade: '3.000' }] });
    await c.service.update(C, ID, { ocorrenciaIds: [B], medicoes: [{ ocorrenciaId: B, quantidade: '3.000' }] }, ator);
    expect(c.medicoes()).toEqual([{ ocorrenciaId: B, quantidade: '3.000' }]);
    expect(c.atividade.ocorrencias.map(o => o.id)).toEqual([B]);
    expect(c.eventos[0].dadosAnteriores?.medicoes).toHaveLength(2);
    expect(c.eventos[0].dadosPosteriores?.medicoes).toEqual([{ ocorrenciaId: B, quantidade: '3.000' }]);
    expect(c.manager.findOne).toHaveBeenCalledWith(Ocorrencia, expect.objectContaining({ where: { id: A }, lock: { mode: 'pessimistic_write' } }));
  });
  it('não transfere quantidade legada ao trocar somente a ocorrência principal', async () => {
    const c = montar({ prim: A, secundarias: [A, B], quantidade: '10.000' });
    await expect(c.service.update(C, ID, { ocorrenciaId: B }, ator)).rejects.toThrow('transferiria quantidade');
    expect(c.manager.save).not.toHaveBeenCalled();
  });
  it('transferência de quantidade requer valor explícito e conserva vínculos secundários', async () => {
    const c = montar({ prim: A, secundarias: [A, D], quantidade: '10.000' });
    await c.service.update(C, ID, { ocorrenciaId: B, quantidadeExecucao: '4.000' }, ator);
    expect(c.atividade.ocorrenciaId).toBe(B);
    expect(c.atividade.quantidadeExecucao).toBe('4.000');
    expect(c.atividade.ocorrencias.map(o => o.id).sort()).toEqual([B, D]);
    expect(c.eventos[0].dadosAnteriores?.quantidadeExecucao).toBe('10.000');
    expect(c.eventos[0].dadosPosteriores?.quantidadeExecucao).toBe('4.000');
  });
  it('edição descritiva não apaga medições nem altera o conjunto de ocorrências', async () => {
    const c = montar({ secundarias: [A, B], medicoes: [{ ocorrenciaId: A, quantidade: '2.000' }] });
    await c.service.update(C, ID, { descricao: 'Relatório operacional ampliado' }, ator);
    expect(c.medicoes()).toEqual([{ ocorrenciaId: A, quantidade: '2.000' }]);
    expect(c.atividade.ocorrencias).toHaveLength(2);
  });
});
