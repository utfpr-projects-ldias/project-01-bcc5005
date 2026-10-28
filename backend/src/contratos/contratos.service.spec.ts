import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
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
  };

  const manager = {
    getRepository: jest.fn(() => repositorio),
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
      innerJoin: jest.fn(), orderBy: jest.fn(), addOrderBy: jest.fn(), getMany,
    };
    builder.innerJoin.mockReturnValue(builder);
    builder.orderBy.mockReturnValue(builder);
    builder.addOrderBy.mockReturnValue(builder);
    Object.assign(c.repositorio, { createQueryBuilder: jest.fn(() => builder) });
    const gestor = { ...ator, perfil: 'GESTOR' } as UsuarioAutenticado;
    expect(await c.service.listar(gestor)).toEqual([]);
    expect(c.repositorio.find).not.toHaveBeenCalled();
    expect(builder.innerJoin).toHaveBeenCalledWith('permissoes_contrato', 'p',
      expect.stringContaining('p.usuario_id = :usuarioId'), { usuarioId: gestor.id });
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
      expect(resultado.numeroContrato).toBe('2026/001');
      expect(resultado.orgaoContratante).toBe('UTFPR');
      expect(resultado.objeto).toBe('Prestação de serviços');

      expect(cenario.repositorio.create).toHaveBeenCalledWith(
        expect.objectContaining({
          numeroContrato: '2026/001',
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