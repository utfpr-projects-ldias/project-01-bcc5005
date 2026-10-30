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
import { EntregaveisService, validarPlanejamento } from './entregaveis.service.js';
import { Entregavel } from './entregavel.entity.js';
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
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.quantidadePrevista = '0'; e.unidadeMedida = 'un';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
    e.quantidadePrevista = '2.125';
    expect(() => validarPlanejamento(e)).not.toThrow();
    e.quantidadePrevista = '2.1234';
    expect(() => validarPlanejamento(e)).toThrow(BadRequestException);
  });
  it('recorrente exige frequência fixa e versão 1 exata', () => {
    const e = exemplo(TipoEntregavel.RECORRENTE);
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
    for (const metodo of ['detalhar', 'editar', 'atualizarChecklist'] as const) {
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
  };
  const auditoria = { registrarResolvedorContexto: jest.fn(), registrarNaTransacao: jest.fn(async () => undefined) };
  const escopos = { registrarAdaptador: jest.fn() };
  const ctx = {
    getRepository: jest.fn((entity: { name: string }) => entity.name === 'Entregavel' ? repositorio : ({
      findOneBy: jest.fn(async () => ({ id: etapa, ativo: true })),
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
  beforeEach(() => jest.clearAllMocks());

  it('registra escopo persistido e resolvedor de auditoria, sem confiar no body', async () => {
    service.onModuleInit();
    expect(escopos.registrarAdaptador).toHaveBeenCalledWith('entregavel', expect.any(Function));
    expect(auditoria.registrarResolvedorContexto).toHaveBeenCalledWith('ENTREGAVEL', expect.any(Function));
    const calls = escopos.registrarAdaptador.mock.calls as unknown as Array<[string, (id: string) => Promise<string>]>;
    const resolve = calls[0][1];
    expect(await resolve(id)).toBe(contrato);
  });
  it('criação faz uma transação, exige etapa e registra ator na auditoria', async () => {
    const dto = { etapaId: etapa, nome: 'Entrega teste', tipo: TipoEntregavel.UNICO } as CriarEntregavelDto;
    const resultado = await service.criar(contrato, dto, ator);
    expect(resultado.id).toBe(id);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledWith(ctx, ator, expect.objectContaining({
      entidadeTipo: 'ENTREGAVEL', entidadeId: id,
    }));
  });
  it('edição sem campos é rejeitada', async () => {
    await expect(service.editar(contrato, id, {}, ator)).rejects.toThrow(BadRequestException);
  });
});
