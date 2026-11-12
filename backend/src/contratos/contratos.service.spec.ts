import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  QueryFailedError,
  type EntityManager,
  type Repository,
} from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from './contrato.entity.js';
import { ContratosService } from './contratos.service.js';
import type { CriarContratoDto } from './dto/criar-contrato.dto.js';
import { ModoCalculo } from './modo-calculo.enum.js';
import { StatusContrato } from './status-contrato.enum.js';

const ID_CONTRATO = '11111111-1111-4111-8111-111111111111';

const PLANEJAMENTO = 'PLANEJAMENTO' as StatusContrato;
const EM_EXECUCAO = 'EM_EXECUCAO' as StatusContrato;
const SIMPLES = 'SIMPLES' as ModoCalculo;

type EventoRetornado = {
  acao: AcaoAuditoria;
  entidadeTipo: 'CONTRATO';
  entidadeId: string;
  dadosAnteriores: Record<string, unknown> | null;
  dadosPosteriores: Record<string, unknown> | null;
};

type RetornoAuditoria = {
  resultado: Contrato;
  evento: EventoRetornado;
};

const ator = {
  id: '22222222-2222-4222-8222-222222222222',
  perfil: 'ADMINISTRADOR',
} as unknown as UsuarioAutenticado;

function contratoBase(
  alteracoes: Partial<Contrato> = {},
): Contrato {
  return {
    id: ID_CONTRATO,
    codigoPublico: '00427',
    numeroContrato: '2026/001',
    processoAdministrativo: null,
    orgaoContratante: 'UTFPR',
    unidadeResponsavel: null,
    objeto: 'Prestação de serviços',
    descricao: null,
    dataAssinatura: null,
    inicioVigencia: '2026-10-17',
    terminoVigencia: '2027-10-16',
    status: PLANEJAMENTO,
    responsavelInternoId: null,
    responsavelInterno: null,
    fiscalGestor: null,
    modoCalculo: SIMPLES,
    observacoes: null,
    arquivadoEm: null, arquivadoPor: null, ordemEtapasBloqueada: false,
    reabertoEm: null, encerradoEm: null, encerradoPor: null, motivoEncerramento: null,
    ...alteracoes,
  };
}

function dtoCriacao(
  alteracoes: Partial<CriarContratoDto> = {},
): CriarContratoDto {
  return {
    numeroContrato: '2026/001',
    orgaoContratante: 'UTFPR',
    objeto: 'Prestação de serviços',
    inicioVigencia: '2026-10-17',
    terminoVigencia: '2027-10-16',
    status: PLANEJAMENTO,
    modoCalculo: SIMPLES,
    ...alteracoes,
  };
}

function montarCenario() {
  const eventos: EventoRetornado[] = [];

  const repositorio = {
    create: jest.fn(
      (dados: Partial<Contrato>) => ({ ...dados }) as Contrato,
    ),

    save: jest.fn(async (contrato: Contrato) =>
      Object.assign(new Contrato(), contrato, {
        id: contrato.id || ID_CONTRATO,
      }),
    ),

    find: jest.fn<() => Promise<Contrato[]>>().mockResolvedValue([]),

    findOneBy: jest.fn<() => Promise<Contrato | null>>().mockResolvedValue(null),
    findOne: jest.fn<() => Promise<Contrato | null>>().mockResolvedValue(null),
  };

  const manager = {
    getRepository: jest.fn(() => repositorio),
    query: jest.fn(async (sql: string) => /FROM ocorrencias o|FROM entregaveis e JOIN etapas et/.test(sql) ? [] : [{ numero: 428 }]),
  } as unknown as EntityManager;

  const auditoria = {
    executarComAuditoria: jest.fn(
      async (
        _ator: UsuarioAutenticado,
        executar: (
          manager: EntityManager,
        ) => Promise<RetornoAuditoria>,
      ) => {
        const retorno = await executar(manager);
        eventos.push(retorno.evento);
        return retorno.resultado;
      },
    ),

    registrarNaTransacao: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };

  const service = new ContratosService(
    repositorio as unknown as Repository<Contrato>,
    auditoria as unknown as AuditoriaService,
  );

  return {
    service,
    repositorio,
    auditoria,
    manager,
    eventos,
  };
}

function erroPostgres(codigo: string): QueryFailedError {
  const erroDriver = Object.assign(
    new Error(`Erro PostgreSQL ${codigo}`),
    { code: codigo },
  );

  return new QueryFailedError(
    'INSERT INTO contratos',
    [],
    erroDriver,
  );
}

describe('Escopo de carteira de contratos (RF-40)', () => {
  it('não usa find global para GESTOR; consulta filtrada pelo próprio id', async () => {
    const c = montarCenario();
    const getMany = jest.fn<() => Promise<Contrato[]>>().mockResolvedValue([]);
    const builder = {
      leftJoin: jest.fn(), where: jest.fn(), andWhere: jest.fn(), orderBy: jest.fn(), addOrderBy: jest.fn(), getMany,
    };
    builder.leftJoin.mockReturnValue(builder);
    builder.where.mockReturnValue(builder);
    builder.andWhere.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    builder.addOrderBy.mockReturnValue(builder);
    Object.assign(c.repositorio, { createQueryBuilder: jest.fn(() => builder) });
    const gestor = { ...ator, perfil: 'GESTOR' } as UsuarioAutenticado;
    expect(await c.service.listar(gestor)).toEqual([]);
    expect(c.repositorio.find).not.toHaveBeenCalled();
    expect(builder.leftJoin).toHaveBeenCalledWith('permissoes_contrato', 'p',
      expect.stringContaining('p.usuario_id = :usuarioId'), { usuarioId: gestor.id });
    expect(builder.where).toHaveBeenCalledWith(
      expect.stringContaining('c.responsavelInternoId = :usuarioId'), { usuarioId: gestor.id });
  });
});

describe('ContratosService', () => {
  describe('criar', () => {
    it('persiste o contrato e prepara o evento de criação', async () => {
      const cenario = montarCenario();

      const resultado = await cenario.service.criar(
        dtoCriacao({
          numeroContrato: '  2026/001  ',
          orgaoContratante: '  UTFPR  ',
          objeto: '  Prestação de serviços  ',
        }),
        ator,
      );

      expect(resultado.id).toBe(ID_CONTRATO);
      expect(resultado.codigoPublico).toMatch(/^[0-9]{5}$/);
      expect(resultado.numeroContrato).toBe('2026/001');
      expect(resultado.orgaoContratante).toBe('UTFPR');
      expect(resultado.objeto).toBe('Prestação de serviços');

      expect(cenario.repositorio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          numeroContrato: '2026/001',
          codigoPublico: expect.stringMatching(/^[0-9]{5}$/),
          orgaoContratante: 'UTFPR',
          objeto: 'Prestação de serviços',
          processoAdministrativo: null,
          unidadeResponsavel: null,
          responsavelInternoId: null,
          fiscalGestor: null,
        }),
      );

      expect(
        cenario.auditoria.executarComAuditoria,
      ).toHaveBeenCalledWith(ator, expect.any(Function));

      expect(cenario.eventos).toHaveLength(1);
      expect(cenario.eventos[0]).toMatchObject({
        acao: AcaoAuditoria.CONTRATO_CRIADO,
        entidadeTipo: 'CONTRATO',
        entidadeId: ID_CONTRATO,
        dadosAnteriores: null,
        dadosPosteriores: expect.objectContaining({
          numeroContrato: '2026/001',
          status: PLANEJAMENTO,
        }),
      });
    });

    it('preserva as datas civis normalizadas recebidas pela API', async () => {
      const cenario = montarCenario();

      const resultado = await cenario.service.criar(
        dtoCriacao({
          inicioVigencia: '2026-10-17',
          terminoVigencia: '2027-10-16',
        }),
        ator,
      );

      expect(resultado.inicioVigencia).toBe('2026-10-17');
      expect(resultado.terminoVigencia).toBe('2027-10-16');
    });

    const vigenciasValidas = [
      ['2026-12-31', '2027-01-01'],
      ['2024-02-28', '2024-02-29'],
      ['2024-02-29', '2024-03-01'],
      ['2025-02-28', '2025-03-01'],
      ['2026-04-30', '2026-05-01'],
      ['2026-01-31', '2026-02-01'],
      ['2026-10-17', '2027-10-16'],
    ] as const;

    for (const [inicioVigencia, terminoVigencia] of vigenciasValidas) {
      it(
        `aceita a vigência ${inicioVigencia} até ${terminoVigencia}`,
        async () => {
          const cenario = montarCenario();

          const resultado = await cenario.service.criar(
            dtoCriacao({
              inicioVigencia,
              terminoVigencia,
            }),
            ator,
          );

          expect(resultado.inicioVigencia).toBe(inicioVigencia);
          expect(resultado.terminoVigencia).toBe(terminoVigencia);
          expect(cenario.repositorio.save).toHaveBeenCalledTimes(1);
        },
      );
    }

    const vigenciasInvalidas = [
      {
        inicio: '2026-10-17',
        termino: '2026-10-16',
        motivo: 'término anterior ao início',
      },
      {
        inicio: '2025-02-29',
        termino: '2025-03-01',
        motivo: '29 de fevereiro em ano não bissexto',
      },
      {
        inicio: '2026-04-30',
        termino: '2026-02-30',
        motivo: 'dia inexistente no calendário',
      },
      {
        inicio: '17/10/2026',
        termino: '2027-10-16',
        motivo: 'data fora do formato ISO',
      },
    ] as const;

    for (const caso of vigenciasInvalidas) {
      it(`rejeita vigência inválida: ${caso.motivo}`, async () => {
        const cenario = montarCenario();

        await expect(
          cenario.service.criar(
            dtoCriacao({
              inicioVigencia: caso.inicio,
              terminoVigencia: caso.termino,
            }),
            ator,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(
          cenario.auditoria.executarComAuditoria,
        ).not.toHaveBeenCalled();

        expect(cenario.repositorio.save).not.toHaveBeenCalled();
        expect(cenario.eventos).toHaveLength(0);
      });
    }
  });

  describe('atualizar', () => {
    it('rejeita um contrato inexistente', async () => {
      const cenario = montarCenario();

      await expect(
        cenario.service.atualizar(
          ID_CONTRATO,
          { status: EM_EXECUCAO },
          ator,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(cenario.repositorio.save).not.toHaveBeenCalled();
      expect(cenario.eventos).toHaveLength(0);
    });

    it('registra ator e snapshots na operação auditada', async () => {
      const cenario = montarCenario();
      const existente = contratoBase();

      cenario.repositorio.findOneBy.mockResolvedValue(existente);

      const resultado = await cenario.service.atualizar(
        ID_CONTRATO,
        { objeto: 'Objeto revisado' },
        ator,
      );

      expect(resultado.objeto).toBe('Objeto revisado');

      expect(
        cenario.auditoria.executarComAuditoria,
      ).toHaveBeenCalledWith(ator, expect.any(Function));

      expect(cenario.eventos).toHaveLength(1);
      expect(cenario.eventos[0]).toMatchObject({
        acao: AcaoAuditoria.CONTRATO_EDITADO,
        entidadeTipo: 'CONTRATO',
        entidadeId: ID_CONTRATO,
        dadosAnteriores: expect.objectContaining({
          objeto: 'Prestação de serviços',
        }),
        dadosPosteriores: expect.objectContaining({
          objeto: 'Objeto revisado',
        }),
      });
    });

    it('registra a mudança de status com os valores anterior e posterior', async () => {
      const cenario = montarCenario();

      cenario.repositorio.findOneBy.mockResolvedValue(
        contratoBase(),
      );

      const resultado = await cenario.service.atualizar(
        ID_CONTRATO,
        { status: EM_EXECUCAO },
        ator,
      );

      expect(resultado.status).toBe(EM_EXECUCAO);

      expect(
        cenario.auditoria.registrarNaTransacao,
      ).toHaveBeenCalledWith(
        cenario.manager,
        ator,
        expect.objectContaining({
          acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: ID_CONTRATO,
          dadosAnteriores: { status: PLANEJAMENTO },
          dadosPosteriores: { status: EM_EXECUCAO },
        }),
      );
    });

    it('registra a mudança de vigência com o intervalo anterior e o novo', async () => {
      const cenario = montarCenario();

      cenario.repositorio.findOneBy.mockResolvedValue(
        contratoBase(),
      );

      await cenario.service.atualizar(
        ID_CONTRATO,
        {
          terminoVigencia: '2028-10-16',
        },
        ator,
      );

      expect(
        cenario.auditoria.registrarNaTransacao,
      ).toHaveBeenCalledWith(
        cenario.manager,
        ator,
        expect.objectContaining({
          acao: AcaoAuditoria.CONTRATO_PRAZO_ALTERADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: ID_CONTRATO,
          dadosAnteriores: {
            inicioVigencia: '2026-10-17',
            terminoVigencia: '2027-10-16',
          },
          dadosPosteriores: {
            inicioVigencia: '2026-10-17',
            terminoVigencia: '2028-10-16',
          },
        }),
      );
    });

    it('valida a vigência combinada com o registro existente', async () => {
      const cenario = montarCenario();

      cenario.repositorio.findOneBy.mockResolvedValue(
        contratoBase(),
      );

      await expect(
        cenario.service.atualizar(
          ID_CONTRATO,
          {
            terminoVigencia: '2026-10-16',
          },
          ator,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(cenario.repositorio.save).not.toHaveBeenCalled();
      expect(cenario.eventos).toHaveLength(0);
    });
  });

  describe('consulta', () => {
    it('ordena a listagem por início descendente e número ascendente', async () => {
      const cenario = montarCenario();

      await cenario.service.listar(ator);

      expect(cenario.repositorio.find).toHaveBeenCalledWith({
        order: {
          inicioVigencia: 'DESC',
          numeroContrato: 'ASC',
        },
      });
    });

    it('rejeita a consulta de um contrato inexistente', async () => {
      const cenario = montarCenario();

      await expect(
        cenario.service.detalhar(ID_CONTRATO),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('erros de persistência', () => {
    const casos = [
      {
        codigo: '23514',
        excecao: BadRequestException,
        descricao: 'CHECK violation',
      },
      {
        codigo: '23505',
        excecao: ConflictException,
        descricao: 'UNIQUE violation',
      },
      {
        codigo: '23503',
        excecao: BadRequestException,
        descricao: 'foreign key violation',
      },
    ] as const;

    for (const caso of casos) {
      it(`mapeia ${caso.descricao} para uma resposta HTTP apropriada`, async () => {
        const cenario = montarCenario();

        cenario.repositorio.save.mockRejectedValueOnce(
          erroPostgres(caso.codigo),
        );

        await expect(
          cenario.service.criar(dtoCriacao(), ator),
        ).rejects.toBeInstanceOf(caso.excecao);

        expect(cenario.eventos).toHaveLength(0);
      });
    }

    it('propaga erros de banco que não possuem mapeamento específico', async () => {
      const cenario = montarCenario();
      const erro = erroPostgres('08006');

      cenario.repositorio.save.mockRejectedValueOnce(erro);

      await expect(
        cenario.service.criar(dtoCriacao(), ator),
      ).rejects.toBe(erro);
    });
  });
});

describe('Código público de contratos', () => {
  it('reserva um código de cinco dígitos, mantém UUID e registra o código na auditoria', async () => {
    const c = montarCenario();
    const salvo = await c.service.criar(dtoCriacao(), ator);
    expect(salvo.id).toBe(ID_CONTRATO);
    expect(salvo.codigoPublico).toMatch(/^[0-9]{5}$/);
    expect(c.eventos[0].dadosPosteriores).toMatchObject({ codigoPublico: salvo.codigoPublico });
  });

  it('reserva o próximo número pelo PostgreSQL e não reutiliza códigos em colisões', async () => {
    const c = montarCenario();
    Object.assign(c.manager, { query: jest.fn(async () => [{ numero: 429 }]) });
    const salvo = await c.service.criar(dtoCriacao(), ator);
    expect(salvo.codigoPublico).toBe('00429');
    expect(c.auditoria.executarComAuditoria).toHaveBeenCalledTimes(1);
    expect(c.repositorio.save).toHaveBeenCalledTimes(1);
  });

  it('não repete colisões de outras restrições de unicidade', async () => {
    const c = montarCenario();
    c.repositorio.save.mockRejectedValueOnce(erroPostgres('23505'));
    await expect(c.service.criar(dtoCriacao(), ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.auditoria.executarComAuditoria).toHaveBeenCalledTimes(1);
  });

  it('não altera o código público ao editar os dados do contrato', async () => {
    const c = montarCenario();
    c.repositorio.findOneBy.mockResolvedValue(contratoBase());
    const salvo = await c.service.atualizar(ID_CONTRATO, { objeto: 'Novo objeto' }, ator);
    expect(salvo.codigoPublico).toBe('00427');
    expect(c.eventos[0].dadosPosteriores).toMatchObject({ codigoPublico: '00427' });
  });
});


test('código público: esgotamento da sequência não cria contrato e devolve 409', async () => {
  const c = montarCenario();
  Object.assign(c.manager, { query: jest.fn(async () => [{ numero: 100000 }]) });
  await expect(c.service.criar(dtoCriacao(), ator)).rejects.toBeInstanceOf(ConflictException);
  expect(c.repositorio.save).not.toHaveBeenCalled();
  expect(c.eventos).toHaveLength(0);
});


describe('Conclusão operacional explícita do contrato', () => {
  it('recusa conclusão quando não existem comprovantes completos, sem gravar estado', async () => {
    const c = montarCenario();
    const atual = contratoBase();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => atual) });
    Object.assign(c.manager, { query: jest.fn(async () => [{ etapas: 1, entregaveis: 1, evidencias: 2,
      verificadas: 1, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }]) });
    await expect(c.service.concluir(ID_CONTRATO, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
    expect(c.eventos).toHaveLength(0);
  });

  it('não permite concluir o contrato diretamente enquanto a revisão explícita estiver aberta', async () => {
    const c = montarCenario();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({ reabertoEm: new Date('2026-11-06T20:00:00Z') })) });
    await expect(c.service.concluir(ID_CONTRATO, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
    expect(c.eventos).toHaveLength(0);
  });

  it('nega a conclusão a GESTOR sem delegação granular, mesmo que a documentação esteja completa', async () => {
    const c = montarCenario();
    const atual = contratoBase();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => atual) });
    const gestor = { ...ator, perfil: 'GESTOR' } as UsuarioAutenticado;
    await expect(c.service.concluir(ID_CONTRATO, gestor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
    expect(c.eventos).toHaveLength(0);
  });

  it('recusa conclusão definitiva quando não existe PDF principal verificado', async () => {
    const c = montarCenario();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({ reabertoEm: null })) });
    Object.assign(c.manager, { query: jest.fn(async (sql: string) => sql.includes('FROM documentos_contratuais') ? [{ verificado: false }] : [{ etapas: 1, entregaveis: 1, evidencias: 1,
      verificadas: 1, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0, pendentes: false }]) });
    await expect(c.service.concluir(ID_CONTRATO, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
  });

  it('permite ao ADMIN concluir após revisão encerrada e PDF principal verificado, com auditoria', async () => {
    const c = montarCenario();
    const atual = contratoBase({ reabertoEm: null });
    Object.assign(c.repositorio, { findOne: jest.fn(async () => atual) });
    Object.assign(c.manager, { query: jest.fn(async (sql: string) => sql.includes('FROM documentos_contratuais') ? [{ verificado: true }] : [{ etapas: 1, entregaveis: 1, evidencias: 1,
      verificadas: 1, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0, pendentes: false }]) });
    const concluido = await c.service.concluir(ID_CONTRATO, ator);
    expect(concluido.status).toBe('CONCLUIDO');
    expect(concluido.reabertoEm).toBeNull();
    expect(c.eventos[0]).toMatchObject({ acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
      dadosPosteriores: { status: 'CONCLUIDO', reabertoEm: null, motivo: 'CONCLUSAO_EXPLICITA' } });
  });
});

describe('Rastreabilidade contratual e pendência de conclusão (TEC08)', () => {
  it('restringe histórico à raiz contratual e projeta apenas campos públicos, sem JSONB cru', async () => {
    const cenario = montarCenario();
    cenario.repositorio.findOneBy.mockResolvedValue(contratoBase());
    const eventoRepo = { find: jest.fn(async () => [{
      id: 'evento-1', entidadeTipo: 'CONTRATO', entidadeId: ID_CONTRATO, acao: AcaoAuditoria.CONTRATO_REABERTO, registradoEm: new Date('2026-11-06T18:00:00Z'),
      dadosAnteriores: { status: 'CONCLUIDO', senha: 'nunca-expor' },
      dadosPosteriores: { status: 'PLANEJAMENTO', segredo: 'nunca-expor' },
    }]) };
    Object.assign(cenario.repositorio, { manager: { getRepository: () => eventoRepo } });
    const eventos = await cenario.service.historico(ID_CONTRATO, ator);
    expect(eventoRepo.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { contratoId: ID_CONTRATO }, take: 100,
    }));
    expect(eventos[0]).toEqual(expect.objectContaining({
      descricao: 'Contrato reaberto', situacaoAnterior: 'Concluído', situacaoAtual: 'Em revisão · Planejamento',
    }));
    expect(JSON.stringify(eventos)).not.toContain('nunca-expor');
  });
  it('reabrir sem modificação não marca pendência mesmo com documentação completa', async () => {
    const c = montarCenario();
    c.repositorio.find.mockResolvedValue([contratoBase({ reabertoEm: new Date('2026-11-06T20:00:00Z') })]);
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) return [{ etapas: 1, entregaveis: 1, evidencias: 1, verificadas: 1,
        etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }];
      if (sql.includes('eventos_auditoria')) return [{ alterado: false }];
      return [{ pendentes: false }];
    });
    Object.assign(c.repositorio, { manager: { query } });
    expect(await c.service.pendentesConclusao(ator)).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('revisão explícita nunca entra em pendentes antes de Fechar novamente, mesmo após edições', async () => {
    const c = montarCenario();
    c.repositorio.find.mockResolvedValue([contratoBase({ reabertoEm: new Date('2026-11-06T20:00:00Z') })]);
    const query = jest.fn(async (sql: string) => sql.includes('COUNT(DISTINCT')
      ? [{ etapas: 1, entregaveis: 1, evidencias: 1, verificadas: 1,
        etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }]
      : [{ pendentes: false }]);
    Object.assign(c.repositorio, { manager: { query } });
    expect(await c.service.pendentesConclusao(ator)).toEqual([]);
    // Não consultar auditoria material: o encerramento é uma decisão explícita.
    expect(query.mock.calls.some(([sql]) => String(sql).includes('eventos_auditoria'))).toBe(false);
  });

  it('não classifica contrato reaberto com etapas reabertas como pendente de conclusão', async () => {
    const cenario = montarCenario();
    cenario.repositorio.find.mockResolvedValue([contratoBase()]);
    const query = jest.fn(async (sql: string) => sql.includes('COUNT(DISTINCT')
      ? [{ etapas: 1, entregaveis: 1, evidencias: 1, verificadas: 1, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }]
      : [{ pendentes: true }]);
    Object.assign(cenario.repositorio, { manager: { query } });
    expect(await cenario.service.pendentesConclusao(ator)).toEqual([]);
    expect(query).toHaveBeenCalled();
  });
});


test('histórico do contrato inclui evento de entregável com nomes de etapa e evidência, sem snapshots', async () => {
  const c = montarCenario();
  c.repositorio.findOneBy.mockResolvedValue(contratoBase());
  const eventoRepo = { find: jest.fn(async () => [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO,
    entidadeTipo: 'ENTREGAVEL', entidadeId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', registradoEm: new Date('2026-11-06T20:00:00Z'),
    dadosAnteriores: { segredo: 'nunca-expor' }, dadosPosteriores: { status: 'VERIFICADA', segredo: 'nunca-expor' },
  }]) };
  const query = jest.fn(async () => [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', etapa: 'Etapa de QA', entregavel: 'Entregável de QA',
    evidencia: 'Relatório', arquivo: 'comprovante.pdf', nome_evento: null, evidencia_evento: null,
  }]);
  Object.assign(c.repositorio, { manager: { getRepository: () => eventoRepo, query } });
  const eventos = await c.service.historico(ID_CONTRATO, ator);
  expect(eventos[0]).toMatchObject({
    contexto: 'Etapa: Etapa de QA · Entregável: Entregável de QA · Evidência: Relatório',
    nomeArquivo: 'comprovante.pdf',
  });
  expect(JSON.stringify(eventos)).not.toContain('nunca-expor');
  expect(query).toHaveBeenCalledTimes(1);
});


test('histórico inclui justificativa e identidade do autor consultada no banco, nunca no payload da UI', async () => {
  const c = montarCenario();
  c.repositorio.findOneBy.mockResolvedValue(contratoBase());
  const evento = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', entidadeTipo: 'CONTRATO', entidadeId: ID_CONTRATO,
    acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO, registradoEm: new Date('2026-11-08T02:21:23Z'),
    atorSupertokensUserId: 'qa-super-token-id',
    dadosAnteriores: { status: 'SUSPENSO' },
    dadosPosteriores: { status: 'PLANEJAMENTO', justificativa: 'Retomada aprovada pelo responsável do contrato.', senha: 'segredo-privado' },
  };
  const eventoRepo = { find: jest.fn(async () => [evento]) };
  const autorRepo = { find: jest.fn(async () => [{ supertokensUserId: 'qa-super-token-id', nome: 'Autoria de QA', email: 'autoria@example.test' }]) };
  Object.assign(c.repositorio, { manager: {
    getRepository: (entidade: { name?: string }) => entidade.name === 'Usuario' ? autorRepo : eventoRepo,
  } });
  const historico = await c.service.historico(ID_CONTRATO, ator);
  expect(historico[0]).toMatchObject({
    justificativa: 'Retomada aprovada pelo responsável do contrato.',
    ator: { nome: 'Autoria de QA', email: 'autoria@example.test' },
    situacaoAnterior: 'Suspenso', situacaoAtual: 'Planejamento',
  });
  expect(autorRepo.find).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(historico)).not.toContain('segredo-privado');
});

describe('Encerramento explícito da revisão contratual (TEC08)', () => {
  const emRevisao = () => contratoBase({ status: PLANEJAMENTO, reabertoEm: new Date('2026-11-06T20:00:00Z') });

  function preparar(filhoEmRevisao = false, filhoIncompleto = false) {
    const c = montarCenario();
    const atual = emRevisao();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => atual) });
    Object.assign(c.manager, { query: jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) return [{ etapas: 1, entregaveis: 1, evidencias: 1,
        verificadas: 1, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }];
      if (sql.includes('possui_revisao')) return [{ possui_revisao: filhoEmRevisao }];
      return [{ pendentes: filhoIncompleto }];
    }) });
    return c;
  }

  it('fechar novamente não conclui automaticamente, limpa revisão e audita a transição', async () => {
    const c = preparar();
    const resultado = await c.service.fecharRevisao(ID_CONTRATO, ator);
    expect(resultado.status).toBe(PLANEJAMENTO);
    expect(resultado.reabertoEm).toBeNull();
    expect(c.eventos).toHaveLength(1);
    expect(c.eventos[0]).toMatchObject({ acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
      dadosPosteriores: { status: PLANEJAMENTO, reabertoEm: null, motivo: 'REVISAO_ENCERRADA_PENDENTE_CONCLUSAO' } });
  });

  it('não permite fechar novamente com etapa ou entregável em revisão', async () => {
    const c = preparar(true);
    await expect(c.service.fecharRevisao(ID_CONTRATO, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.eventos).toHaveLength(0);
    expect(c.repositorio.save).not.toHaveBeenCalled();
  });

  it('não permite fechar novamente quando o último entregável ainda não foi concluído', async () => {
    const c = preparar(false, true);
    await expect(c.service.fecharRevisao(ID_CONTRATO, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.eventos).toHaveLength(0);
    expect(c.repositorio.save).not.toHaveBeenCalled();
  });
});


describe('Decisão independente de aprovação ou devolução à revisão (TEC08)', () => {
  function preparar() {
    const c = montarCenario();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({ reabertoEm: null })) });
    Object.assign(c.manager, { query: jest.fn(async (sql: string) => {
      if (sql.includes('COUNT(DISTINCT')) return [{ etapas: 1, entregaveis: 1, evidencias: 1,
        verificadas: 1, etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }];
      if (sql.includes('possui_revisao')) return [{ possui_revisao: false }];
      return [{ pendentes: false }];
    }) });
    return c;
  }
  it('ADMIN devolve contrato pendente para revisão sem reabri-lo como concluído nem apagar filhos', async () => {
    const c = preparar();
    const resultado = await c.service.devolverParaRevisao(ID_CONTRATO, ator);
    expect(resultado.status).toBe(PLANEJAMENTO);
    expect(resultado.reabertoEm).toBeInstanceOf(Date);
    expect(c.eventos).toHaveLength(1);
    expect(c.eventos[0]).toMatchObject({ acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
      dadosPosteriores: { motivo: 'DEVOLVIDO_PARA_REVISAO', status: PLANEJAMENTO } });
  });
  it('nega devolução a GESTOR sem concluirContrato, mesmo que possua editarContrato', async () => {
    const c = preparar();
    const gestor = { ...ator, perfil: 'GESTOR' } as UsuarioAutenticado;
    await expect(c.service.devolverParaRevisao(ID_CONTRATO, gestor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
    expect(c.eventos).toHaveLength(0);
  });
  it('recusa devolução para revisão de contrato já em revisão', async () => {
    const c = preparar();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({ reabertoEm: new Date() })) });
    await expect(c.service.devolverParaRevisao(ID_CONTRATO, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
  });
});

describe('ENCERRADO: decisão antecipada auditada, sem conclusão fictícia', () => {
  function preparar(existemEtapas = true) {
    const c = montarCenario();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({ reabertoEm: null })) });
    Object.assign(c.manager, { query: jest.fn(async (_sql: string) => [{ existe: existemEtapas }]) });
    return c;
  }

  it('registra encerramento excepcional com justificativa e sem concluir filhos', async () => {
    const c = preparar();
    const resultado = await c.service.encerrarAntecipadamente(ID_CONTRATO,
      'Execução interrompida por acordo administrativo formal.', ator);
    expect(resultado.status).toBe(StatusContrato.ENCERRADO);
    expect(resultado.encerradoEm).toBeInstanceOf(Date);
    expect(resultado.motivoEncerramento).toContain('acordo administrativo');
    expect(c.eventos).toHaveLength(1);
    expect(c.eventos[0]).toMatchObject({
      acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
      dadosPosteriores: { status: 'ENCERRADO', motivo: 'ENCERRAMENTO_ANTECIPADO_SEM_CONCLUSAO_TOTAL' },
    });
  });

  it('permite encerrar antecipadamente durante revisão e preserva anterior no evento', async () => {
    const c = preparar();
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({
      status: StatusContrato.EM_EXECUCAO,
      reabertoEm: new Date('2026-11-06T12:00:00Z'),
    })) });
    const encerrado = await c.service.encerrarAntecipadamente(ID_CONTRATO,
      'Encerramento motivado pela administração durante revisão contratual.', ator);
    expect(encerrado.status).toBe(StatusContrato.ENCERRADO);
    expect(encerrado.reabertoEm).toBeNull();
    expect(c.eventos[0].dadosAnteriores).toMatchObject({
      status: StatusContrato.EM_EXECUCAO,
      reabertoEm: new Date('2026-11-06T12:00:00Z'),
    });
  });

  it('permite encerramento administrativo sem etapas, sem fabricar avanço físico', async () => {
    const c = preparar(false);
    const encerrado = await c.service.encerrarAntecipadamente(ID_CONTRATO,
      'Interrupção contratual suficientemente justificada.', ator);
    expect(encerrado.status).toBe(StatusContrato.ENCERRADO);
    expect(c.eventos).toHaveLength(1);
    expect(c.eventos[0].dadosPosteriores).toMatchObject({ status: 'ENCERRADO' });
  });

  it('exige permissão granular de encerramento, independente da conclusão', async () => {
    const c = preparar();
    const gestor = { ...ator, perfil: 'GESTOR' } as UsuarioAutenticado;
    await expect(c.service.encerrarAntecipadamente(ID_CONTRATO,
      'Necessidade de encerramento administrativo motivada.', gestor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
  });

  it('exige justificativa adequada e impede encerramento duplicado', async () => {
    const c = preparar();
    await expect(c.service.encerrarAntecipadamente(ID_CONTRATO, 'curta', ator)).rejects.toBeInstanceOf(BadRequestException);
    Object.assign(c.repositorio, { findOne: jest.fn(async () => contratoBase({ status: StatusContrato.CONCLUIDO })) });
    await expect(c.service.encerrarAntecipadamente(ID_CONTRATO,
      'Tentativa de encerrar um contrato já concluído.', ator)).rejects.toBeInstanceOf(ConflictException);
    expect(c.repositorio.save).not.toHaveBeenCalled();
  });
});


describe('Cancelamento auditado, independente de conclusão e arquivamento', () => {
  it('rejeita cancelamento sem justificativa suficiente', async () => {
    const c = montarCenario();
    await expect(c.service.alterarCancelamento(ID_CONTRATO, true, ator, 'curta'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(c.auditoria.executarComAuditoria).not.toHaveBeenCalled();
  });
  it('cancela com justificativa e preserva estados dos descendentes', async () => {
    const c = montarCenario();
    c.repositorio.findOne.mockResolvedValue(contratoBase());
    const salvo = await c.service.alterarCancelamento(ID_CONTRATO, true, ator,
      'Interrupção administrativa autorizada para este contrato.');
    expect(salvo.status).toBe('CANCELADO');
    expect(c.eventos[0]).toMatchObject({
      acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
      dadosPosteriores: expect.objectContaining({ decisao: 'CANCELAMENTO_EXPLICITO' }),
    });
  });
  it('não reverte por permissão de cancelamento e retorna ao Planejamento quando autorizado', async () => {
    const c = montarCenario();
    c.repositorio.findOne.mockResolvedValue(contratoBase({status: StatusContrato.CANCELADO}));
    const salvo = await c.service.alterarCancelamento(ID_CONTRATO, false, ator);
    expect(salvo.status).toBe('PLANEJAMENTO');
    expect(salvo.reabertoEm).toBeInstanceOf(Date);
    expect(c.eventos[0]).toMatchObject({
      dadosPosteriores: expect.objectContaining({ decisao: 'REVERSAO_DE_CANCELAMENTO', reabertoEm: expect.any(Date) }),
    });
  });
  it('não permite inserir cancelamento, suspensão nem conclusão pela atualização genérica', async () => {
    const c = montarCenario();
    c.repositorio.findOneBy.mockResolvedValue(contratoBase());
    for (const status of ['CANCELADO','SUSPENSO','EM_ENCERRAMENTO','CONCLUIDO','ENCERRADO'] as const) {
      await expect(c.service.atualizar(ID_CONTRATO, {status: status as StatusContrato}, ator))
        .rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});

describe('TEC08: suspensão contratual independente e auditada', () => {
  it('suspende contrato em execução sem alterar prazos, filhos ou progresso', async () => {
    const c = montarCenario();
    const registro = contratoBase({ status: EM_EXECUCAO });
    c.repositorio.findOne.mockResolvedValue(registro);
    const resultado = await c.service.alterarSuspensao(ID_CONTRATO, true, ator);
    expect(resultado.status).toBe(StatusContrato.SUSPENSO);
    expect(resultado.inicioVigencia).toBe('2026-10-17');
    expect(resultado.terminoVigencia).toBe('2027-10-16');
    expect(c.eventos.at(-1)?.dadosAnteriores).toEqual({ status: 'EM_EXECUCAO', reabertoEm: null });
    expect(c.eventos.at(-1)?.dadosPosteriores).toEqual({ status: 'SUSPENSO', reabertoEm: null, motivo: 'SUSPENSAO_CONTRATUAL' });
  });

  it('retoma o estado exato guardado na auditoria', async () => {
    const c = montarCenario();
    c.repositorio.findOne.mockResolvedValue(contratoBase({ status: StatusContrato.SUSPENSO }));
    (c.manager.query as jest.MockedFunction<typeof c.manager.query>).mockResolvedValue([{ anterior: 'EM_EXECUCAO' }]);
    const resultado = await c.service.alterarSuspensao(ID_CONTRATO, false, ator);
    expect(resultado.status).toBe(EM_EXECUCAO);
    expect(resultado.reabertoEm).toBeInstanceOf(Date);
    expect(c.eventos.at(-1)?.dadosPosteriores?.motivo).toBe('RETOMADA_SUSPENSAO');
  });

  it('recusa retomada sem evento anterior confiável, em vez de inventar Planejamento', async () => {
    const c = montarCenario();
    c.repositorio.findOne.mockResolvedValue(contratoBase({ status: StatusContrato.SUSPENSO }));
    (c.manager.query as jest.MockedFunction<typeof c.manager.query>).mockResolvedValue([]);
    await expect(c.service.alterarSuspensao(ID_CONTRATO, false, ator)).rejects.toBeInstanceOf(ConflictException);
  });

  it('não suspende contrato concluído ou arquivado', async () => {
    const c = montarCenario();
    c.repositorio.findOne.mockResolvedValue(contratoBase({ status: StatusContrato.CONCLUIDO }));
    await expect(c.service.alterarSuspensao(ID_CONTRATO, true, ator)).rejects.toBeInstanceOf(ConflictException);
    c.repositorio.findOne.mockResolvedValue(contratoBase({ arquivadoEm: new Date() }));
    await expect(c.service.alterarSuspensao(ID_CONTRATO, true, ator)).rejects.toBeInstanceOf(ConflictException);
  });
});


describe('Revisão com fase operacional independente', () => {
  it('editar objeto não fecha a revisão quando nenhuma fase foi escolhida', async () => {
    const c = montarCenario();
    const reabertoEm = new Date('2026-11-08T09:00:00Z');
    c.repositorio.findOneBy.mockResolvedValue(contratoBase({ reabertoEm }));
    const resultado = await c.service.atualizar(ID_CONTRATO, { objeto: 'Objeto atualizado' }, ator);
    expect(resultado.reabertoEm).toEqual(reabertoEm);
    expect(resultado.status).toBe(PLANEJAMENTO);
    expect(c.auditoria.registrarNaTransacao).not.toHaveBeenCalledWith(c.manager, ator,
      expect.objectContaining({ acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO }));
  });

  it('alterar a fase durante revisão mantém a revisão aberta e audita somente a mudança operacional', async () => {
    const c = montarCenario();
    const reabertoEm = new Date('2026-11-08T09:00:00Z');
    c.repositorio.findOneBy.mockResolvedValue(contratoBase({ reabertoEm }));
    const resultado = await c.service.atualizar(ID_CONTRATO,
      { status: EM_EXECUCAO }, ator);
    expect(resultado.reabertoEm).toEqual(reabertoEm);
    expect(resultado.status).toBe(EM_EXECUCAO);
    expect(c.auditoria.registrarNaTransacao).toHaveBeenCalledWith(c.manager, ator,
      expect.objectContaining({ acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
        dadosAnteriores: expect.objectContaining({ status: PLANEJAMENTO, reabertoEm }),
        dadosPosteriores: { status: EM_EXECUCAO } }));
  });

  it('não aceita o sinalizador legado de fechamento implícito da revisão', async () => {
    const c = montarCenario();
    c.repositorio.findOneBy.mockResolvedValue(contratoBase({ reabertoEm: new Date('2026-11-08T09:00:00Z') }));
    await expect(c.service.atualizar(ID_CONTRATO,
      { status: PLANEJAMENTO, retomarOperacao: true }, ator)).rejects.toBeInstanceOf(ConflictException);
  });

  it('não aceita sair de revisão quando não existe revisão aberta', async () => {
    const c = montarCenario();
    c.repositorio.findOneBy.mockResolvedValue(contratoBase());
    await expect(c.service.atualizar(ID_CONTRATO,
      { status: PLANEJAMENTO, retomarOperacao: true }, ator)).rejects.toBeInstanceOf(ConflictException);
  });
});
