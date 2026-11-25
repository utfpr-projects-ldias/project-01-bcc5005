import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { EntregaveisService } from './entregaveis.service.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const etapaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator: UsuarioAutenticado = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', perfil: PerfilUsuario.ADMINISTRADOR,
  email: 'admin@exemplo.test', supertokensUserId: 'qa-r40-admin',
};

function contexto({ exigencias = 1, verificadas = 0, descendentesPendentes = false } = {}) {
  const entregavel = Object.assign(new Entregavel(), {
    id: entregavelId, contratoId, etapaId, tipo: TipoEntregavel.UNICO,
    percentualExecucao: '100.000', statusExecucao: 'EM_ANDAMENTO',
    arquivadoEm: null, reabertoEm: null, evidenciasEsperadas: [],
  });
  const repoEntregavel = {
    findOneBy: jest.fn(async () => entregavel),
    save: jest.fn(async (item: Entregavel) => item),
  };
  const contrato = { id: contratoId, arquivadoEm: null, status: 'EM_EXECUCAO' };
  const queryContrato = {
    setLock: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => contrato),
  };
  const repositorios = {
    contrato: { createQueryBuilder: jest.fn(() => queryContrato) },
    entregavel: repoEntregavel,
    etapa: { findOneBy: jest.fn(async () => ({ id: etapaId, contratoId, status: 'EM_ANDAMENTO', arquivadoEm: null })) },
    evidencia: { find: jest.fn(async () => []) },
  };
  const m = {
    getRepository: jest.fn((e: unknown) => {
      if ((e as {name?:string})?.name==='Usuario') return {findOne:jest.fn(async()=>({...ator,ativo:true}))};
      if (e === Contrato) return repositorios.contrato;
      if (e === Entregavel) return repositorios.entregavel;
      if (e === Etapa) return repositorios.etapa;
      if (e === EvidenciaEsperada) return repositorios.evidencia;
      throw new Error('Entidade inesperada no teste');
    }),
    findOne: jest.fn(async () => entregavel),
    findOneBy: jest.fn(async (entidade: unknown) => entidade === Entregavel ? entregavel : repositorios.etapa.findOneBy()),
    findBy: jest.fn(async () => []),
    save: jest.fn(async (_entidade: unknown, item: Entregavel) => item),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('obrigatorias+ocorrencias_exigidas')) return [{ total: exigencias }];
      if (/AS pendentes/.test(sql)) return [{ pendentes: descendentesPendentes && sql.includes('ocorrencia_lancamentos') }];
      if (/AS etapas/.test(sql)) return [{ etapas: 1, entregaveis: 1, evidencias: exigencias,
        verificadas, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: exigencias ? 0 : 1 }];
      throw new Error('Consulta inesperada no teste: ' + sql.slice(0, 110));
    }),
  };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const db = { transaction: jest.fn(async (f: (manager: typeof m) => Promise<unknown>) => f(m)) };
  const service = new EntregaveisService(repoEntregavel as never, repositorios.evidencia as never,
    db as never, auditoria as never, { registrarAdaptador: jest.fn() } as never);
  return { service, entregavel, auditoria, m };
}

describe('conclusão integral, parcial e ausência de exigência documental R40', () => {
  test('100% físico + documentação pendente permite solicitação e aprovação PARCIAL', async () => {
    const c = contexto();
    await c.service.solicitarConclusaoParcial(contratoId, entregavelId, ator);
    expect(c.entregavel.statusExecucao).toBe('PENDENTE_CONCLUSAO_PARCIAL');
    const resposta = await c.service.concluir(contratoId, entregavelId, ator);
    expect(resposta.statusExecucao).toBe('CONCLUIDO_PARCIALMENTE');
    expect(c.entregavel.percentualExecucao).toBe('100.000');
    expect(c.auditoria.registrarNaTransacao).toHaveBeenCalledTimes(2);
  });
  test('conclusão INTEGRAL com documentação pendente é bloqueada, sem atualizar estado', async () => {
    const c = contexto();
    await expect(c.service.solicitarConclusao(contratoId, entregavelId, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.entregavel.statusExecucao).toBe('EM_ANDAMENTO');
    expect(c.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
  });
  test('comprovação completa permite solicitação e aprovação integrais', async () => {
    const c = contexto({ exigencias: 1, verificadas: 1 });
    await c.service.solicitarConclusao(contratoId, entregavelId, ator);
    expect(c.entregavel.statusExecucao).toBe('PENDENTE_CONCLUSAO');
    await c.service.concluir(contratoId, entregavelId, ator);
    expect(c.entregavel.statusExecucao).toBe('CONCLUIDO');
  });
  test('sem requisitos obrigatórios: conclusão parcial indevida, integral possível', async () => {
    const c = contexto({ exigencias: 0 });
    await expect(c.service.solicitarConclusaoParcial(contratoId, entregavelId, ator))
      .rejects.toBeInstanceOf(ConflictException);
    await c.service.solicitarConclusao(contratoId, entregavelId, ator);
    await c.service.concluir(contratoId, entregavelId, ator);
    expect(c.entregavel.statusExecucao).toBe('CONCLUIDO');
  });
});

test('B05: decisões de ocorrência pendentes impedem conclusão mesmo com físico e documentação completos', async () => {
  const c=contexto({exigencias:0,descendentesPendentes:true});
  await expect(c.service.solicitarConclusao(contratoId,entregavelId,ator)).rejects.toThrow(/descendentes/);
  expect(c.entregavel.statusExecucao).toBe('EM_ANDAMENTO');
});
