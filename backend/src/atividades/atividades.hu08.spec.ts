import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CHAVE_POLITICA } from '../autorizacao/politica.decorator.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { AtividadesController } from './atividades.controller.js';
import { AtividadesService } from './atividades.service.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';
import { AprovarCompartilhadaDto } from './dto/atividade-compartilhada.dto.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outroContrato = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const itemId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator = { id: itemId, perfil: PerfilUsuario.COLABORADOR, supertokensUserId: 'qa-supertokens', email: 'qa@example.invalid' };
const exemplo = () => ({ contratoId, titulo: 'Reunião', dataHora: '2026-11-09T13:00:00-03:00',
  descricao: 'Reunião de obra', tipo: 'Reunião', entregavelIds: [itemId] });

describe('HU08-01/02 — API autorizada e DTO', () => {
  it('criação, consulta e edição usam escopo protegido por contrato real', () => {
    for (const [metodo, acao, escopo] of [
      ['criar', 'atividades:registrar', 'contrato'], ['listar', 'atividades:listar', 'contrato'],
      ['detalhar', 'atividades:visualizar', 'recurso'], ['editar', 'atividades:editar', 'recurso'],
      ['solicitarConclusao', 'atividades:editar', 'recurso'],
      ['cancelarSolicitacao', 'atividades:editar', 'recurso'],
      ['aprovarConclusao', 'atividades:verificar', 'recurso'],
      ['verificar', 'atividades:verificar', 'recurso'], ['reabrir', 'atividades:reabrir', 'recurso'],
      ['arquivar', 'atividades:arquivar', 'recurso'], ['reativar', 'atividades:reativar', 'recurso'],
      ['excluir', 'atividades:excluir', 'recurso'],
    ] as const) {
      const politica = Reflect.getMetadata(CHAVE_POLITICA, AtividadesController.prototype[metodo]);
      expect(politica.acao).toBe(acao);
      expect(politica.escopoOperacional.tipo).toBe(escopo);
      if (escopo === 'recurso') expect(politica.escopoOperacional.parametroContratoPai).toBe('contratoId');
    }
  });
  it('opcionais são opcionais, lista N:N não pode ser vazia ou duplicada', async () => {
    expect(await validate(plainToInstance(CreateAtividadeDto, exemplo()))).toHaveLength(0);
    const vazio = { ...exemplo(), entregavelIds: [] };
    expect(await validate(plainToInstance(CreateAtividadeDto, vazio))).not.toHaveLength(0);
    const duplicado = { ...exemplo(), entregavelIds: [itemId, itemId] };
    expect(await validate(plainToInstance(CreateAtividadeDto, duplicado))).not.toHaveLength(0);
    const ocorrenciaOpcional = { ...exemplo(), ocorrenciaId: itemId };
    expect(await validate(plainToInstance(CreateAtividadeDto, ocorrenciaOpcional), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    expect(await validate(plainToInstance(CreateAtividadeDto, { ...exemplo(), ocorrenciaId: 'invalido' }))).not.toHaveLength(0);
  });
  it('não aceita contrato do corpo divergente mesmo quando a rota está autorizada', async () => {
    const repo = {};
    const auditoria = { executarComAuditoria: jest.fn() };
    const escopo = {};
    const service = new AtividadesService(repo as never, auditoria as never, escopo as never);
    await expect(service.create(outroContrato, exemplo(), ator)).rejects.toBeInstanceOf(BadRequestException);
    expect(auditoria.executarComAuditoria).not.toHaveBeenCalled();
  });
  it('não muda conclusão física ao criar atividade', () => {
    const codigo = AtividadesService.prototype.create.toString();
    expect(codigo).not.toContain('percentualExecucao');
    expect(codigo).not.toContain('statusExecucao');
  });
});


describe('HU08 — consulta por etapa e vínculo N:N sem recortar os entregáveis', () => {
  const etapaId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const executar = jest.fn(async () => [[], 0]);
  const query = {
    leftJoinAndSelect: jest.fn(), where: jest.fn(), andWhere: jest.fn(),
    addSelect: jest.fn(), orderBy: jest.fn(), addOrderBy: jest.fn(), skip: jest.fn(), take: jest.fn(),
    getManyAndCount: executar,
  };
  for (const key of ['leftJoinAndSelect','where','andWhere','addSelect','orderBy','addOrderBy','skip','take'] as const) {
    query[key].mockReturnValue(query);
  }
  const repository = { createQueryBuilder: jest.fn(() => query) };
  const service = new AtividadesService(repository as never, {} as never, {} as never);
  it('usa EXISTS por etapa sem reduzir os demais vínculos carregados', async () => {
    await service.findAllPaginated(contratoId, { etapaId });
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('entregavel_etapa."etapa_id" = :etapaId'), { etapaId });
    expect(query.leftJoinAndSelect).toHaveBeenCalledWith('atividade.entregaveis', 'entregaveis');
    expect(query.orderBy).toHaveBeenCalledWith('atividade.dataHora', 'DESC');
  });
  it('ATIVAS inclui somente Registrada; pendentes de conclusão possuem filtro separado', async () => {
    query.andWhere.mockClear();
    await service.findAllPaginated(contratoId, { status: 'ATIVAS', page: '2', limit: '5' });
    expect(query.andWhere).toHaveBeenCalledWith('atividade.status = :statusAtivo', { statusAtivo: 'REGISTRADA' });
    expect(query.skip).toHaveBeenCalledWith(5);
    expect(query.take).toHaveBeenCalledWith(5);
  });
  it('REGISTRADA continua estrito para não contar verificadas como pendentes', async () => {
    query.andWhere.mockClear();
    await service.findAllPaginated(contratoId, { status: 'REGISTRADA' });
    expect(query.andWhere).toHaveBeenCalledWith('atividade.status = :status', { status: 'REGISTRADA' });
  });
  it('diário consulta todas as situações não arquivadas e pesquisa antes de paginar', async () => {
    await service.findAllPaginated(contratoId,{status:'TODAS_ATUAIS',busca:'25%_test',tipo:'Reunião',page:'2',limit:'5',ordem:'antigas'});
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('strpos(lower(atividade.titulo)'),{busca:'25%_test'});
    expect(query.andWhere).toHaveBeenCalledWith('atividade.status != :arquivada',{arquivada:'ARQUIVADA'});
    expect(query.orderBy).toHaveBeenCalledWith('atividade.dataHora','ASC');expect(query.skip).toHaveBeenCalledWith(5);
  });
  it('ordena duração numérica no banco antes da paginação',async()=>{
    await service.findAllPaginated(contratoId,{ordem:'duracao-desc'});
    expect(query.addSelect).toHaveBeenCalledWith(expect.stringContaining('::numeric'),'duracao_minutos');
    expect(query.orderBy).toHaveBeenCalledWith('duracao_minutos','DESC','NULLS LAST');
    await expect(service.findAllPaginated(contratoId,{ordem:'invalida'})).rejects.toBeInstanceOf(BadRequestException);
  });
  it('filtra presença de comprovantes e contribuição independente antes de paginar', async () => {
    query.andWhere.mockClear();
    await service.findAllPaginated(contratoId,{responsavel:'Ana%_',comEvidencias:'sim',comExecucao:'nao',page:'2',limit:'5'});
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('strpos(lower(COALESCE(atividade.responsavel'), {responsavel:'Ana%_'});
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('EXISTS (SELECT 1 FROM atividade_comprovantes'));
    expect(query.andWhere).toHaveBeenCalledWith(expect.stringContaining('NOT ((EXISTS (SELECT 1 FROM execucoes_entregavel'));
    expect(query.skip).toHaveBeenCalledWith(5);
    await expect(service.findAllPaginated(contratoId,{comExecucao:'invalido'})).rejects.toBeInstanceOf(BadRequestException);
  });
  it('continua rejeitando filtros de situação desconhecidos', async () => {
    await expect(service.findAllPaginated(contratoId, { status: 'INVALIDA' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('rejeita etapa inválida antes de executar SQL', async () => {
    await expect(service.findAllPaginated(contratoId, { etapaId: 'invalido' })).rejects.toBeInstanceOf(BadRequestException);
  });
});


describe('HU08 — registro somente em contrato, etapa e entregável abertos', () => {
  const baseContrato = { id: contratoId, status: 'EM_EXECUCAO', arquivadoEm: null };
  const baseEtapa = { id: itemId, contratoId, status: 'EM_ANDAMENTO', arquivadoEm: null };
  const baseEntregavel = { id: itemId, contratoId, etapaId: itemId, statusExecucao: 'EM_ANDAMENTO', arquivadoEm: null };
  function montar(config: { contrato?: Record<string, unknown>; etapa?: Record<string, unknown>; entregavel?: Record<string, unknown> } = {}) {
    const c = { ...baseContrato, ...config.contrato };
    const e = { ...baseEtapa, ...config.etapa };
    const en = { ...baseEntregavel, ...config.entregavel };
    const manager = {
      findOne: jest.fn(async (entidade: unknown) => entidade === Contrato ? c : null),
      find: jest.fn(async (entidade: unknown) => entidade === Entregavel ? [en] : entidade === Etapa ? [e] : []),
      create: jest.fn((_entidade: unknown, dados: unknown) => ({ id: itemId, ...(dados as object) })),
      save: jest.fn(async (_entidade: unknown, dados: unknown) => dados),
    };
    const auditoria = { executarComAuditoria: async (_ator: unknown, acao: (m: typeof manager) => Promise<{ resultado: unknown }>) => (await acao(manager)).resultado };
    return { service: new AtividadesService({} as never, auditoria as never, {} as never), manager };
  }
  it('cria com vínculos de etapa e entregável abertos (sem alterar execução física)', async () => {
    const { service, manager } = montar();
    const resultado = await service.create(contratoId, exemplo(), ator);
    expect(resultado).toEqual(expect.objectContaining({ titulo: 'Reunião' }));
    expect(manager.findOne).toHaveBeenCalledWith(Contrato, expect.objectContaining({ lock: { mode: 'pessimistic_write' } }));
  });
  it.each([
    ['CONCLUIDO', null], ['SUSPENSO', null], ['CANCELADO', null],
    ['EM_EXECUCAO', new Date('2026-11-10T00:00:00Z')],
  ])('bloqueia contrato %s ou arquivado', async (status, arquivadoEm) => {
    const { service } = montar({ contrato: { status, arquivadoEm } });
    await expect(service.create(contratoId, exemplo(), ator)).rejects.toBeInstanceOf(ConflictException);
  });
  it.each(['CONCLUIDA', 'CONCLUIDO_PARCIALMENTE', 'ENCERRADA'])('bloqueia etapa %s', async status => {
    const { service } = montar({ etapa: { status } });
    await expect(service.create(contratoId, exemplo(), ator)).rejects.toBeInstanceOf(ConflictException);
  });
  it('bloqueia entregável concluído', async () => {
    const { service } = montar({ entregavel: { statusExecucao: 'CONCLUIDO' } });
    await expect(service.create(contratoId, exemplo(), ator)).rejects.toBeInstanceOf(ConflictException);
  });
});


describe('Regularização — validação de entrada das atividades', () => {
  it.each([{titulo:null},{descricao:'   '},{dataHora:null},{local:null},{medicoes:null},{entregavelIds:null}])('rejeita PATCH inválido %j', async payload => {
    expect(await validate(plainToInstance(UpdateAtividadeDto,payload))).not.toHaveLength(0);
  });
  it('preserva a operação explícita de limpar a ocorrência e quantidade legada', async () => {
    expect(await validate(plainToInstance(UpdateAtividadeDto,{ocorrenciaId:null,quantidadeExecucao:null}))).toHaveLength(0);
  });
  it('recusa título composto apenas por espaços e medições nulas no cadastro', async () => {
    expect(await validate(plainToInstance(CreateAtividadeDto,{...exemplo(),titulo:'   '}))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreateAtividadeDto,{...exemplo(),medicoes:null}))).not.toHaveLength(0);
  });
  it('não confunde lista vazia de contratos com decisão em lote sem seleção', async () => {
    expect(await validate(plainToInstance(AprovarCompartilhadaDto,{contratoIds:[]}))).not.toHaveLength(0);
    expect(await validate(plainToInstance(AprovarCompartilhadaDto,{}))).toHaveLength(0);
  });
});
