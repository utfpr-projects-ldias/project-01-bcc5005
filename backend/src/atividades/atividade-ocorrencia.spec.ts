import { jest } from '@jest/globals';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AtividadesService } from './atividades.service.js';
import { AtividadeEntity } from './atividade.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
const ator = { id: 'u', perfil: PerfilUsuario.ADMINISTRADOR, email: 'qa@example.invalid', supertokensUserId: 'qa' };
const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const outro = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
function montar(ocorrencia: { entregavelId: string; substituidaEm?: Date } | null, statusContrato = 'EM_EXECUCAO') {
  // A entidade lida do TypeORM SEMPRE possui id. O mock antigo omitira o id,
  // gerando uma falha artificial ao validar o relacionamento N:N do R28.
  const ocorrenciaPersistida = ocorrencia ? { id: outro, contratoId, status: 'NAO_INICIADO',
    modoRegistro: 'DESCRITIVO', metaQuantidade: null, substituidaEm: null, ...ocorrencia } : null;
  const entregavel = { id, etapaId: id, contratoId, arquivadoEm: null, statusExecucao: 'EM_ANDAMENTO' };
  const atividade = { id, contratoId, ocorrenciaId: null as string | null, titulo: 'Anterior', dataHora: new Date('2026-11-01T15:00:00Z'), tipo: 'Reunião', descricao: 'Preservada', responsavel: 'QA', status: 'REGISTRADA', entregaveis: [entregavel] };
  const manager = {
    findOne: jest.fn(async (entidade: unknown) => entidade === Contrato ? { status: statusContrato } : entidade === Ocorrencia ? ocorrenciaPersistida : entidade === AtividadeEntity ? atividade : null),
    findOneBy: jest.fn(async (entidade: unknown) => entidade === Entregavel ? { ...entregavel, tipo: 'RECORRENTE' } : null),
    find: jest.fn(async (entidade: unknown) => entidade === Entregavel ? [entregavel] : entidade === Etapa ? [{ id, status: 'PLANEJADA' }] : []),
    save: jest.fn(async (_e: unknown, a: unknown) => a),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM atividade_ocorrencia_medicoes')) return [];
      if (sql.includes('ocorrencia_lancamentos')) return [{ total: '0' }];
      if (sql.includes('FROM atividades a')) return [{ registrada: '0', verificada: '0', verificadas: '0', pendentes: '0' }];
      return [{ fotos: '0', relatorios: '0' }];
    }),
  };
  const auditoria = {
    executarComAuditoria: async (_a: unknown, fn: (m: typeof manager) => Promise<{ resultado: unknown }>) => (await fn(manager)).resultado,
    registrarNaTransacao: jest.fn(async () => undefined),
  };
  return { atividade, manager, service: new AtividadesService({} as never, auditoria as never, {} as never) };
}
describe('HU09 — vínculo opcional em atividade preexistente', () => {
  it('não permite editar somente metadados sob contrato suspenso', async () => {
    const c = montar(null, 'SUSPENSO');
    await expect(c.service.update(contratoId,id,{titulo:'Corrigido'},ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.manager.save).not.toHaveBeenCalled();
  });
  it('associa e retira sem perder N:N ou descrição', async () => {
    const c = montar({ entregavelId: id });
    await c.service.update(contratoId, id, { ocorrenciaId: outro }, ator);
    expect(c.atividade.ocorrenciaId).toBe(outro);
    expect(c.atividade.entregaveis).toHaveLength(1);
    expect(c.atividade.descricao).toBe('Preservada');
    await c.service.update(contratoId, id, { ocorrenciaId: null }, ator);
    expect(c.atividade.ocorrenciaId).toBeNull();
  });
  it('ID de associação inválido vira 400, sem erro interno ou gravação', async () => {
    const c = montar({ entregavelId: id });
    await expect(c.service.update(contratoId, id, { ocorrenciaIds: [undefined] as unknown as string[] }, ator))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(c.manager.save).not.toHaveBeenCalled();
  });
  it.each([null, { entregavelId: outro }, { entregavelId: id, substituidaEm: new Date() }])('nega ocorrência incompatível', async o => {
    const c = montar(o);
    await expect(c.service.update(contratoId, id, { ocorrenciaId: outro }, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.manager.save).not.toHaveBeenCalled();
  });
});
