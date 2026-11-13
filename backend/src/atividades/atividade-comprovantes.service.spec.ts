import { ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AtividadeComprovantesService } from './atividade-comprovantes.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const atividadeId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const comprovanteId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } as UsuarioAutenticado;

function cenario(options: { existente?: boolean; auditFalha?: boolean; arquivo?: boolean } = {}) {
  const sql: string[] = [];
  const query = jest.fn(async (consulta: string) => {
    sql.push(consulta);
    if (consulta.includes('INSERT INTO atividade_comprovantes')) return options.existente ? [] : [{ comprovante_id: comprovanteId }];
    if (consulta.includes('SELECT c.id FROM comprovantes_evidencia')) return options.arquivo === false ? [] : [{ id: comprovanteId }];
    return [];
  });
  const findOne = jest.fn(async (_entidade: unknown, opcoes: { where?: Record<string, unknown> }) => {
    if (opcoes.where?.id === contratoId) return { id: contratoId, arquivadoEm: null, status: 'EM_EXECUCAO' };
    if (opcoes.where?.id === atividadeId) return { id: atividadeId, contratoId, excluidaEm: null, status: 'REGISTRADA' };
    return null;
  });
  const manager = { findOne, query } as unknown as EntityManager;
  const db = { manager, transaction: (executar: (m: EntityManager) => Promise<unknown>) => executar(manager) } as unknown as DataSource;
  const registrarNaTransacao = jest.fn(async () => { if (options.auditFalha) throw new Error('auditoria indisponível'); });
  const auditoria = { registrarNaTransacao } as unknown as AuditoriaService;
  return { servico: new AtividadeComprovantesService(db, auditoria), registrarNaTransacao, sql };
}

describe('associação de comprovante existente com atividade', () => {
  it('verifica contrato raiz, atividade e comprovante, e audita na mesma transação', async () => {
    const c = cenario();
    await expect(c.servico.vincular(contratoId, atividadeId, comprovanteId, ator)).resolves.toMatchObject({ vinculado: true });
    expect(c.sql.join('\n')).toContain('atividade_entregaveis');
    expect(c.sql.join('\n')).toContain('c.contrato_id=$1');
    expect(c.registrarNaTransacao).toHaveBeenCalledTimes(1);
  });
  it('recusa comprovante de outro contrato, desatualizado ou não verificado', async () => {
    const c = cenario({ arquivo: false });
    await expect(c.servico.vincular(contratoId, atividadeId, comprovanteId, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.registrarNaTransacao).not.toHaveBeenCalled();
  });
  it('recusa vínculo duplicado e preserva trilha sem evento fictício', async () => {
    const c = cenario({ existente: true });
    await expect(c.servico.vincular(contratoId, atividadeId, comprovanteId, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.registrarNaTransacao).not.toHaveBeenCalled();
  });
  it('propaga falha de auditoria e impede confirmação parcial da operação', async () => {
    const c = cenario({ auditFalha: true });
    await expect(c.servico.vincular(contratoId, atividadeId, comprovanteId, ator)).rejects.toThrow('auditoria indisponível');
  });
});
