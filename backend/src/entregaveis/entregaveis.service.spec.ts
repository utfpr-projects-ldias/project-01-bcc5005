import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { CHAVE_POLITICA } from '../autorizacao/politica.decorator.js';
import { EntregaveisController } from './entregaveis.controller.js';
import { jest } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DataSource, Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { CriarEntregavelDto, EditarEntregavelDto, SubstituirChecklistDto } from './dto/planejamento-entregavel.dto.js';
import { EntregaveisService, validarMetadadosEntregavel, validarPlanejamento, validarVigenciaPlanejamento, versaoPlanejamentoEntregavel } from './entregaveis.service.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { PeriodicidadeEntregavel } from './periodicidade-entregavel.enum.js';

const contrato = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const etapa = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator: UsuarioAutenticado = {
  id, supertokensUserId: 'supertokens-123', email: 'qa@example.invalid', perfil: PerfilUsuario.ADMINISTRADOR,
};
function exemplo(tipo = TipoEntregavel.UNICO): Entregavel {
  return Object.assign(new Entregavel(), {
    contratoId: contrato, etapaId: etapa, nome: 'Planejamento de teste', codigo: null,
    descricao: null, tipo, responsavelId: null,
    inicioPrevisto: '2026-10-30', terminoPrevisto: '2026-11-30',
    quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null,
    periodicidade: null, configuracaoPeriodicidade: null, peso: '12.5000',
    criterioConclusao: null, statusExecucao: null, percentualExecucao: null,
    situacaoComprovacao: null, observacoes: null,
  });
}

describe('HU07-02 — validações de planejamento independentes da execução', () => {
  it('aceita tipo ÚNICO sem percentual/status artificiais', () => {
    const e = exemplo();
    expect(() => validarPlanejamento(e)).not.toThrow();
    expect(e.percentualExecucao).toBeNull();
  });
  it('quantitativo exige quantidade > 0 e unidade, sem arredondar decimal', () => {
    const e = exemplo(TipoEntregavel.QUANTITATIVO);
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException); // meta obrigatória no planejamento
    e.quantidadePrevista = '0'; e.unidadeMedida = 'un';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.quantidadePrevista = '2.125';
    expect(() => validarPlanejamento(e)).not.toThrow();
    e.quantidadePrevista = '2.1234';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
  });
  it('recorrente exige frequência fixa e versão 1 exata', () => {
    const e = exemplo(TipoEntregavel.RECORRENTE);
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.periodicidade = PeriodicidadeEntregavel.MENSAL;
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.configuracaoPeriodicidade = { versao: 1 };
    expect(() => validarPlanejamento(e)).not.toThrow();
    e.configuracaoPeriodicidade = { versao: 1, dias: 2 } as never;
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
  });
  it('contínuo exige critério de aferição manual sem progresso pelo tempo', () => {
    const e = exemplo(TipoEntregavel.CONTINUO);
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.criterioConclusao = 'Verificação por relatório operacional e checkpoints';
    expect(() => validarPlanejamento(e)).not.toThrow();
  });
  it('marco exige condição; não exige data efetiva no planejamento', () => {
    const e = exemplo(TipoEntregavel.MARCO);
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.criterioConclusao = 'Ata de homologação assinada';
    expect(() => validarPlanejamento(e)).not.toThrow();
  });
  it('datas civis, pesos individuais e strings vazias são verificados', () => {
    const e = exemplo();
    e.terminoPrevisto = '2026-02-30';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.terminoPrevisto = '2026-11-30'; e.peso = '101.0000';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.peso = '30.5000'; e.nome = '   ';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
  });
});

describe('HU07-02 — contratos de autorização', () => {
  it('rotas detalhar/editar/checklist exigem recurso persistido e contrato pai', () => {
    for (const metodo of ['detalhar', 'historico', 'editar', 'atualizarChecklist'] as const) {
      const politica = Reflect.getMetadata(CHAVE_POLITICA, EntregaveisController.prototype[metodo]) as {
        acao: string; escopoOperacional: { tipo: string; recurso: string; parametroContratoPai: string };
      };
      expect(politica.escopoOperacional).toEqual(expect.objectContaining({
        tipo: 'recurso', recurso: 'entregavel', parametroContratoPai: 'contratoId',
      }));
    }
  });
  it('criar/listar usam contrato da rota, nunca do body', () => {
    for (const metodo of ['criar', 'listar'] as const) {
      const politica = Reflect.getMetadata(CHAVE_POLITICA, EntregaveisController.prototype[metodo]) as {
        escopoOperacional: { tipo: string; parametro: string };
      };
      expect(politica.escopoOperacional).toEqual({ tipo: 'contrato', parametro: 'contratoId' });
    }
  });
});

describe('HU07-02 — DTOs fechados e nested checklist', () => {
  it('DTO de criação aceita requisitos mínimos do ÚNICO', async () => {
    const dto = plainToInstance(CriarEntregavelDto, { etapaId: etapa, nome: 'Entrega', tipo: 'UNICO' });
    expect(await validate(dto)).toHaveLength(0);
  });
  it('não aceita tipo desconhecido, UUID inválido ou item incompleto', async () => {
    const dto = plainToInstance(CriarEntregavelDto, {
      etapaId: 'invalido', nome: 'Entrega', tipo: 'PERSONALIZADO',
      evidenciasEsperadas: [{ tipoEvidencia: 'FOTO' }],
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
  it('PATCH aceita campos omitidos, mas nunca tipo nulo', async () => {
    expect(await validate(plainToInstance(EditarEntregavelDto, { nome: 'Novo' }))).toHaveLength(0);
    expect(await validate(plainToInstance(EditarEntregavelDto, { tipo: null }))).not.toHaveLength(0);
  });
  it('PUT exige checklist em array com booleano explicito', async () => {
    expect(await validate(plainToInstance(SubstituirChecklistDto, { itens: [] }))).toHaveLength(0);
    expect((await validate(plainToInstance(SubstituirChecklistDto, {
      itens: [{ tipoEvidencia: 'Ata', obrigatoria: 'sim' }],
    }))).length).toBeGreaterThan(0);
  });
});

describe('HU07-02 — serviço integra escopo, auditoria e transações', () => {
  const repositorio = {
    findOne: jest.fn(async () => ({ contratoId: contrato })),
    findOneBy: jest.fn(async () => ({ contratoId: contrato })),
    create: jest.fn((value: unknown) => Object.assign(new Entregavel(), value)),
    save: jest.fn(async (value: unknown) => Object.assign(value as object, { id })),
    count: jest.fn(async () => 0),
  };
  const auditoria = { registrarResolvedorContexto: jest.fn(), registrarNaTransacao: jest.fn(async () => undefined) };
  const escopos = { registrarAdaptador: jest.fn() };
  let modoCalculo: 'SIMPLES' | 'PONDERADO' = 'PONDERADO';
  const usuario = { findOneBy: jest.fn(async () => ({...ator, nome:null, ativo:true})), findOne: jest.fn(async () => ({...ator, ativo:true})) };
  const acl = { findOne: jest.fn(async () => ({podeEditar:false,permissoesDetalhadas:{criarEntregaveis:true,configurarPesos:false}})) };
  const checklist = {find: jest.fn(async (): Promise<EvidenciaEsperada[]> => []), save: jest.fn()};
  const comprovante = {findOne: jest.fn(async (): Promise<{status:string}|null> => null)};
  const ctx = {
    query: jest.fn(async () => [{ soma: '0' }]),
    getRepository: jest.fn((entity: { name: string }) => entity.name === 'Usuario' ? usuario : entity.name === 'PermissaoContrato' ? acl : entity.name === 'Entregavel' ? repositorio : entity.name === 'EvidenciaEsperada' ? checklist : entity.name === 'ComprovanteEvidencia' ? comprovante : ({
      findOneBy: jest.fn(async () => ({ id: etapa, ativo: true, modoCalculo })),
      find: jest.fn(async () => []),
      createQueryBuilder: jest.fn(() => ({ setLock: () => ({ where: () => ({ getOne: async () => ({ id: contrato }) }) }) })),
    })),
  };
  const dataSource = { transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn(ctx)) };
  const service = new EntregaveisService(
    repositorio as unknown as Repository<Entregavel>, {} as never,
    dataSource as unknown as DataSource,
    auditoria as unknown as AuditoriaService,
    escopos as unknown as ResolverEscopoContratoService,
  );
  beforeEach(() => { jest.clearAllMocks(); usuario.findOne.mockReset().mockImplementation(async () => ({...ator, ativo:true})); modoCalculo = 'PONDERADO'; });

  it('B05: rejeita versão desatualizada antes da escrita', async () => {
    repositorio.findOneBy.mockResolvedValueOnce(Object.assign(exemplo(),{id}));
    await expect(service.editar(contrato,id,{nome:'Novo nome',versaoPlanejamento:'a'.repeat(64)},ator)).rejects.toThrow(/planejamento mudou/);
    expect(repositorio.save).not.toHaveBeenCalled();
  });

  it('registra escopo persistido e resolvedor de auditoria, sem confiar no body', async () => {
    service.onModuleInit();
    expect(escopos.registrarAdaptador).toHaveBeenCalledWith('entregavel', expect.any(Function));
    expect(auditoria.registrarResolvedorContexto).toHaveBeenCalledWith('ENTREGAVEL', expect.any(Function));
    const calls = escopos.registrarAdaptador.mock.calls as unknown as Array<[string, (id: string) => Promise<string>]>;
    const resolve = calls[0][1];
    expect(await resolve(id)).toBe(contrato);
  });
  it('criação faz uma transação, exige etapa e registra ator na auditoria', async () => {
    const dto = { etapaId: etapa, nome: 'Entrega teste', tipo: TipoEntregavel.UNICO, inicioPrevisto: '2026-10-30', peso: '20' } as CriarEntregavelDto;
    const resultado = await service.criar(contrato, dto, ator);
    expect(resultado.id).toBe(id);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledWith(ctx, ator, expect.objectContaining({
      entidadeTipo: 'ENTREGAVEL', entidadeId: id,
    }));
  });
  it('cadastro com peso positivo exige delegação específica', async () => {
    const colaborador = {...ator,perfil:PerfilUsuario.COLABORADOR};
    usuario.findOne.mockResolvedValueOnce({...colaborador,ativo:true}).mockResolvedValueOnce({...colaborador,ativo:true});
    const dto = { etapaId: etapa, nome: 'Entrega ponderada', tipo: TipoEntregavel.UNICO, inicioPrevisto: '2026-10-30', peso: '20' } as CriarEntregavelDto;
    await expect(service.criar(contrato,dto,colaborador)).rejects.toThrow('Sem permissão');
    expect(repositorio.save).not.toHaveBeenCalled();
  });
  it('checklist coletivo não altera descrição de evidência verificada', async () => {
    repositorio.findOneBy.mockResolvedValueOnce(Object.assign(exemplo(),{id}));
    checklist.find.mockResolvedValueOnce([Object.assign(new EvidenciaEsperada(),{id, tipoEvidencia:'FOTO', descricao:'Original', obrigatoria:true, arquivadoEm:null})]);
    comprovante.findOne.mockResolvedValueOnce({status:'VERIFICADA'});
    await expect(service.substituirChecklist(contrato,id,{itens:[{id,tipoEvidencia:'FOTO',descricao:'Alterada',obrigatoria:true}]},ator)).rejects.toThrow('Evidência verificada');
    expect(checklist.save).not.toHaveBeenCalled();
  });
  it('cadastro recorrente rejeita agenda acima de 500 períodos sem persistir', async () => {
    await expect(service.criar(contrato,{etapaId:etapa,nome:'Agenda longa',tipo:TipoEntregavel.RECORRENTE,
      inicioPrevisto:'2026-01-01',terminoPrevisto:'2028-01-01',peso:'0',periodicidade:PeriodicidadeEntregavel.DIARIA,
      configuracaoPeriodicidade:{versao:1,modoRegistro:'DESCRITIVO'}},ator)).rejects.toThrow('500 períodos');
    expect(repositorio.save).not.toHaveBeenCalled();
  });
  it('modo ponderado rejeita peso que excede a parcela restante sem inventar conflito de replanejamento', async () => {
    ctx.query.mockResolvedValueOnce([{ soma: '100' }]);
    const dto = { etapaId: etapa, nome: 'Entrega adicional', tipo: TipoEntregavel.UNICO,
      inicioPrevisto: '2026-11-01', peso: '1' } as CriarEntregavelDto;
    await expect(service.criar(contrato, dto, ator)).rejects.toThrow('Apenas 0% restante');
    expect(repositorio.save).not.toHaveBeenCalled();
  });
  it('modo simples permite novo entregável mesmo se pesos informativos somam 100%', async () => {
    modoCalculo = 'SIMPLES';
    const dto = { etapaId: etapa, nome: 'Novo item em média simples', tipo: TipoEntregavel.UNICO,
      inicioPrevisto: '2026-11-01', peso: '1' } as CriarEntregavelDto;
    const resposta = await service.criar(contrato, dto, ator);
    expect(resposta.id).toBe(id);
    expect(ctx.query).not.toHaveBeenCalledWith(expect.stringContaining('SUM(peso)'), expect.anything());
  });
  it('bloqueia criação acima de 100 entregáveis, incluindo arquivados', async () => {
    repositorio.count.mockResolvedValueOnce(100);
    const dto = { etapaId: etapa, nome: 'Entrega excedente', tipo: TipoEntregavel.UNICO } as CriarEntregavelDto;
    await expect(service.criar(contrato, dto, ator)).rejects.toThrow('Limite de 100 entregáveis');
    expect(repositorio.count).toHaveBeenCalledWith({ where: { contratoId: contrato } });
    expect(repositorio.save).not.toHaveBeenCalled();
  });
  it('edição sem campos é rejeitada', async () => {
    await expect(service.editar(contrato, id, {}, ator)).rejects.toThrow(BadRequestException);
    // DTO ES2023 possui campos próprios undefined apesar de JSON vazio.
    await expect(service.editar(contrato, id, plainToInstance(EditarEntregavelDto, {}), ator))
      .rejects.toThrow(BadRequestException);
  });

  it('PATCH parcial real preserva código/descrição/datas em DTO transformado', async () => {
    const persistido = Object.assign(exemplo(), {
      id, codigo: 'Q706-CODIGO-1', descricao: 'Descrição original',
    });
    repositorio.findOneBy.mockResolvedValueOnce(persistido);
    const dto = plainToInstance(EditarEntregavelDto, { nome: '  Revisado  ', peso: '12.50' });
    // Reproduz precisamente a classe emitida pelo TypeScript ES2023.
    expect(Object.hasOwn(dto, 'codigo')).toBe(true);
    expect(dto.codigo).toBeUndefined();
    const atualizado = await service.editar(contrato, id, dto, ator);
    expect(atualizado).toEqual(expect.objectContaining({
      nome: 'Revisado', peso: '12.50', codigo: 'Q706-CODIGO-1',
      descricao: 'Descrição original', inicioPrevisto: '2026-10-30',
    }));
    expect(persistido.codigo).toBe('Q706-CODIGO-1');
    expect(persistido.descricao).toBe('Descrição original');
    expect(auditoria.registrarNaTransacao).toHaveBeenCalled();
  });

  it('PATCH parcial permite limpar explicitamente campo opcional com null', async () => {
    const persistido = Object.assign(exemplo(), { id, codigo: 'Q706-ANTES', descricao: 'Texto' });
    repositorio.findOneBy.mockResolvedValueOnce(persistido);
    const dto = plainToInstance(EditarEntregavelDto, { codigo: null });
    const atualizado = await service.editar(contrato, id, dto, ator);
    expect(atualizado.codigo).toBeNull();
    expect(atualizado.descricao).toBe('Texto');
  });
});


describe('Rastreabilidade do entregável: escopo raiz por contrato', () => {
  it('não consulta eventos se o entregável não pertence ao contrato da URL', async () => {
    const repo = { findOne: jest.fn(async () => null) };
    const db = { getRepository: jest.fn() };
    const service = new EntregaveisService(repo as never, {} as never, db as never, {} as never, {} as never);
    await expect(service.historico(contrato, id, ator)).rejects.toThrow('Entregável não encontrado neste contrato');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id, contratoId: contrato }, select: { id: true } });
    expect(db.getRepository).not.toHaveBeenCalled();
  });
  it('não concede histórico de auditoria a leitor apenas vinculado, sem autorização específica', async () => {
    const repo = { findOne: jest.fn(async () => ({ id })) };
    const vinculos = { findOneBy: jest.fn(async () => null) };
    const eventos = { find: jest.fn() };
    const db = { getRepository: (tipo: { name: string }) => tipo.name === 'PermissaoContrato' ? vinculos : eventos };
    const service = new EntregaveisService(repo as never, {} as never, db as never, {} as never, {} as never);
    await expect(service.historico(contrato, id, { ...ator, perfil: PerfilUsuario.COLABORADOR }))
      .rejects.toThrow('Sem permissão para consultar a trilha');
    expect(eventos.find).not.toHaveBeenCalled();
  });
  it('consulta apenas eventos da entidade autorizada e não retorna JSON de auditoria', async () => {
    const evento = {
      id: 'evento-qa', acao: 'ENTREGAVEL_CRIADO', registradoEm: new Date('2026-11-04T12:00:00Z'),
      atorSupertokensUserId: 'st-qa', dadosAnteriores: null, dadosPosteriores: { nome: 'QA' },
    };
    const repo = { findOne: jest.fn(async () => ({ id })) };
    const eventosRepo = { find: jest.fn(async () => [evento]) };
    const usuarioRepo = { find: jest.fn(async () => [{ supertokensUserId: 'st-qa', nome: 'Fiscal QA', email: 'fiscal@example.org' }]) };
    const db = { getRepository: (tipo: { name: string }) => tipo.name === 'EventoAuditoria' ? eventosRepo : usuarioRepo };
    const service = new EntregaveisService(repo as never, {} as never, db as never, {} as never, {} as never);
    const resultado = await service.historico(contrato, id, ator);
    expect(eventosRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { contratoId: contrato, entidadeTipo: 'ENTREGAVEL', entidadeId: id }, take: 100,
    }));
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toEqual(expect.objectContaining({ descricao: 'Entregável cadastrado', ator: {
      nome: 'Fiscal QA', email: 'fiscal@example.org',
    } }));
    expect(resultado[0]).not.toHaveProperty('dadosPosteriores');
  });
});

describe('Rastreabilidade contextual: nomes da época do evento', () => {
  it('mostra antes/depois de evidência renomeada e nome de comprovante mesmo sem versão física disponível', async () => {
    const eventos = [
      { id: 'mudanca-qa', acao: 'ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA',
        registradoEm: new Date('2026-11-06T01:01:00Z'), atorSupertokensUserId: 'st-qa',
        dadosAnteriores: { itemId: 'ev-qa', tipoEvidencia: 'Relatório original' },
        dadosPosteriores: { itemId: 'ev-qa', tipoEvidencia: 'Relatório atualizado', operacao: 'EDITAR_ITEM' } },
      { id: 'upload-qa', acao: 'ENTREGAVEL_COMPROVANTE_ENVIADO',
        registradoEm: new Date('2026-11-06T01:00:00Z'), atorSupertokensUserId: 'st-qa',
        dadosAnteriores: null,
        dadosPosteriores: { evidenciaEsperadaId: 'ev-qa', comprovanteId: 'anexo-qa', nomeOriginal: 'versao-2026.pdf' } },
    ];
    const repo = { findOne: jest.fn(async () => ({ id })) };
    const db = { getRepository: (tipo: { name: string }) => {
      if (tipo.name === 'EventoAuditoria') return { find: async () => eventos };
      if (tipo.name === 'Usuario') return { find: async () => [{ supertokensUserId: 'st-qa', nome: 'QA', email: 'qa@example.invalid' }] };
      if (tipo.name === 'EvidenciaEsperada') return { find: async () => [{ id: 'ev-qa', tipoEvidencia: 'Relatório atualizado' }] };
      if (tipo.name === 'ComprovanteEvidencia') return { find: async () => [] };
      throw new Error(`Repositório não esperado: ${tipo.name}`);
    } };
    const service = new EntregaveisService(repo as never, {} as never, db as never, {} as never, {} as never);
    const resultado = await service.historico(contrato, id, ator);
    expect(resultado[0]).toEqual(expect.objectContaining({
      evidenciaNome: 'Relatório atualizado', nomeAnterior: 'Relatório original',
      nomeAtual: 'Relatório atualizado', objetoRenomeado: 'Evidência',
    }));
    expect(resultado[1]).toEqual(expect.objectContaining({ nomeArquivo: 'versao-2026.pdf' }));
    expect(resultado[0]).not.toHaveProperty('dadosAnteriores');
  });
});


describe('B05 — precisão, vigência e versão do planejamento', () => {
  it('aceita caracteres suplementares, peso zero e quatro casas', () => {
    const e=exemplo(); e.nome='😀'.repeat(22); e.peso='0';
    expect(()=>validarPlanejamento(e)).not.toThrow();
    e.peso='33.3333'; expect(()=>validarPlanejamento(e)).not.toThrow();
    e.nome='😀'.repeat(46); expect(()=>validarPlanejamento(e)).toThrow(BadRequestException);
  });
  it('verifica datas novas sem impedir metadados de planejamento histórico', () => {
    const e=exemplo(); const vigencia={inicioVigencia:'2026-11-01',terminoVigencia:'2026-11-30'};
    expect(()=>validarVigenciaPlanejamento(e,vigencia)).toThrow(BadRequestException);
    expect(()=>validarVigenciaPlanejamento(e,vigencia,e)).not.toThrow();
    expect(()=>validarVigenciaPlanejamento({...e,inicioPrevisto:'2026-11-01'},vigencia,e)).not.toThrow();
  });
  it('identifica a data inválida e informa a vigência real do contrato', () => {
    const v={inicioVigencia:'2026-11-01',terminoVigencia:'2026-11-30'};
    expect(()=>validarVigenciaPlanejamento({inicioPrevisto:'2026-10-31',terminoPrevisto:'2026-11-15'},v)).toThrow('Início previsto fora da vigência do contrato. Informe uma data entre 01/11/2026 e 30/11/2026.');
    expect(()=>validarVigenciaPlanejamento({inicioPrevisto:'2026-11-01',terminoPrevisto:'2026-12-01'},v)).toThrow('Término previsto fora da vigência do contrato. Informe uma data entre 01/11/2026 e 30/11/2026.');
    expect(()=>validarVigenciaPlanejamento({inicioPrevisto:'2026-11-01',terminoPrevisto:'2026-11-30'},v)).not.toThrow();
  });
  it('hash não depende da escala decimal ou ordem do JSON, mas diferencia milésimos grandes', () => {
    const e=exemplo(TipoEntregavel.RECORRENTE); e.configuracaoPeriodicidade={versao:1,modoRegistro:'DESCRITIVO'};
    e.quantidadePrevista='999999999999999.001';
    const v=versaoPlanejamentoEntregavel(e);
    expect(versaoPlanejamentoEntregavel({...e,peso:'12.5',configuracaoPeriodicidade:{modoRegistro:'DESCRITIVO',versao:1}})).toBe(v);
    expect(versaoPlanejamentoEntregavel({...e,quantidadePrevista:'999999999999999.002'})).not.toBe(v);
    expect(versaoPlanejamentoEntregavel({...e,agendaInicioFuturo:'2026-11-02'})).not.toBe(v);
  });
});

it('limita novos metadados aos contadores da interface', () => {
  for (const [campo,limite] of [['codigo',15],['nome',45],['descricao',200],['observacoes',100],['unidadeMedida',40],['criterioConclusao',200]] as const) {
    const e=exemplo();
    e[campo]='x'.repeat(limite);
    expect(()=>validarMetadadosEntregavel(e,undefined,[campo])).not.toThrow();
    e[campo]+='x';
    expect(()=>validarMetadadosEntregavel(e,undefined,[campo])).toThrow(BadRequestException);
  }
});
