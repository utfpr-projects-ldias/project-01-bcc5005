import { Usuario } from '../usuarios/usuario.entity.js';
import { jest } from '@jest/globals';
import { OcorrenciasService } from './ocorrencias.service.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const admin = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', perfil: 'ADMINISTRADOR' };
const gestor = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', perfil: 'GESTOR' };

function ambiente(podeEditar = true) {
  const linhas = [
    { id: '1', contratoId, entregavelId, periodoInicio: '2026-11-22', dataPrevista:'2026-11-22', status: 'NAO_INICIADO', substituidaEm: null },
    { id: '2', contratoId, entregavelId, periodoInicio: '2026-11-23', dataPrevista:'2026-11-23', status: 'NAO_INICIADO', substituidaEm: null },
    { id: '3', contratoId, entregavelId, periodoInicio: '2026-11-21', dataPrevista:'2026-11-21', status: 'CONCLUIDO', substituidaEm: null },
  ];
  const ocorrenciasRepo = { find: jest.fn(async () => linhas.filter(o => o.status === 'NAO_INICIADO' && !o.substituidaEm)) };
  const permissaoRepo = { findOne: jest.fn(async () => ({podeEditar, permissoesDetalhadas: null})) };
  const m = {
    getRepository: jest.fn((entidade: unknown) => entidade === Usuario ? {findOne:async({where}:{where:{id:string}})=>({... (where.id===admin.id?admin:gestor),ativo:true})} : entidade === Ocorrencia ? ocorrenciasRepo :
      entidade === PermissaoContrato ? permissaoRepo : null),
    findOne: jest.fn(async (entidade: unknown) => entidade === Contrato ? { id: contratoId, status: 'EM_EXECUCAO', arquivadoEm: null } : null),
    findOneBy: jest.fn(async (entidade: unknown) => entidade === Entregavel ? { id: entregavelId, etapaId:'etapa', arquivadoEm: null, statusExecucao:'EM_ANDAMENTO' } : entidade === Etapa ? { id:'etapa', arquivadoEm:null, status:'EM_ANDAMENTO', conclusaoSolicitadaEm:null, encerramentoSolicitadoEm:null } : null),
    save: jest.fn(async (_entidade: unknown, item: unknown) => item),
  };
  const ds = { transaction: (fn: (manager: unknown) => Promise<unknown>) => fn(m) };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const service = new OcorrenciasService({} as never, {} as never, ds as never, auditoria as never, {} as never);
  return { service, linhas, m, auditoria };
}

describe('início automático de ocorrências — integração serviço, calendário, permissões e auditoria', () => {
  afterEach(() => jest.useRealTimers());

  it('inicia somente o período alcançado no calendário local e é idempotente', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-23T02:30:00Z')); // 22/11, 23h30 Brasília
    const {service,linhas,auditoria} = ambiente();
    expect(await service.iniciarPrevistas(contratoId, admin as never)).toEqual({
      iniciadas: 1, dataReferencia: '2026-11-22',
    });
    expect(linhas.map(o => o.status)).toEqual(['EM_ANDAMENTO','NAO_INICIADO','CONCLUIDO']);
    expect(await service.iniciarPrevistas(contratoId, admin as never)).toEqual({
      iniciadas: 0, dataReferencia: '2026-11-22',
    });
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
    jest.setSystemTime(new Date('2026-11-23T03:01:00Z'));
    expect(await service.iniciarPrevistas(contratoId, admin as never)).toEqual({
      iniciadas: 1, dataReferencia: '2026-11-23',
    });
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(2);
  });

  it('gestor sem delegação não inicia nem audita ocorrência', async () => {
    const {service,linhas,auditoria} = ambiente(false);
    await expect(service.iniciarPrevistas(contratoId, gestor as never)).rejects.toThrow(/Sem permissão/);
    expect(linhas[0].status).toBe('NAO_INICIADO');
    expect(auditoria.registrarNaTransacao).not.toHaveBeenCalled();
  });
});
