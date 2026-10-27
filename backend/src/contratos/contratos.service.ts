import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, type Repository } from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from './contrato.entity.js';
import type { AtualizarContratoDto } from './dto/atualizar-contrato.dto.js';
import type { CriarContratoDto } from './dto/criar-contrato.dto.js';

/** Códigos PostgreSQL mapeados para respostas HTTP padronizadas (issue HU05-02). */
const PG_CHECK_VIOLATION = '23514';
const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';

/**
 * Regras de negócio da API de contratos — HU05-02.
 *
 * Autorização já foi resolvida pelo `AutorizacaoGuard` global (TEC07-02):
 * sessão, usuário de domínio ativo e política aplicada. Aqui só persistimos,
 * validamos vigência/calendário e auditamos.
 *
 * **Atomicidade**: `criar` e `atualizar` delegam a transação a
 * `AuditoriaService.executarComAuditoria` — o contrato e o evento
 * `eventos_auditoria` são gravados no mesmo commit/rollback. Em `atualizar`,
 * eventos específicos de negócio (RB-18/RB-19) também entram na mesma
 * transação via `registrarNaTransacao(manager, ...)`, sem abrir sub-transação.
 */
@Injectable()
export class ContratosService {
  constructor(
    @InjectRepository(Contrato)
    private readonly contratos: Repository<Contrato>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async criar(
    dto: CriarContratoDto,
    ator: UsuarioAutenticado,
  ): Promise<Contrato> {
    this.validarVigencia(dto.inicioVigencia, dto.terminoVigencia);

    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      const repo = manager.getRepository(Contrato);
      const contrato = repo.create({
        numeroContrato: dto.numeroContrato.trim(),
        processoAdministrativo: dto.processoAdministrativo ?? null,
        orgaoContratante: dto.orgaoContratante.trim(),
        unidadeResponsavel: dto.unidadeResponsavel ?? null,
        objeto: dto.objeto.trim(),
        descricao: dto.descricao ?? null,
        dataAssinatura: dto.dataAssinatura ?? null,
        inicioVigencia: dto.inicioVigencia,
        terminoVigencia: dto.terminoVigencia,
        status: dto.status,
        responsavelInternoId: dto.responsavelInternoId ?? null,
        fiscalGestor: dto.fiscalGestor ?? null,
        modoCalculo: dto.modoCalculo,
        observacoes: dto.observacoes ?? null,
      });
      const salvo = await salvarContrato(repo, contrato);

      return {
        resultado: salvo,
        evento: {
          acao: AcaoAuditoria.CONTRATO_CRIADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: null,
          dadosPosteriores: serializarContrato(salvo),
        },
      };
    });
  }

  async listar(): Promise<Contrato[]> {
    // `contratos:listar` só passa para ADMINISTRADOR (PoliticaAcessoService).
    // Ordenação estável prepara paginação de HU05-04 sem reescrever a query.
    return this.contratos.find({
      order: { inicioVigencia: 'DESC', numeroContrato: 'ASC' },
    });
  }

  async detalhar(id: string): Promise<Contrato> {
    const encontrado = await this.contratos.findOneBy({ id });
    if (!encontrado) throw new NotFoundException('Contrato não encontrado');
    return encontrado;
  }

  async atualizar(
    id: string,
    dto: AtualizarContratoDto,
    ator: UsuarioAutenticado,
  ): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      const repo = manager.getRepository(Contrato);
      const existente = await repo.findOneBy({ id });
      if (!existente) throw new NotFoundException('Contrato não encontrado');

      const inicioAnterior = existente.inicioVigencia;
      const terminoAnterior = existente.terminoVigencia;
      const statusAnterior = existente.status;

      // Vigência combinada — o DTO parcial não vê o registro atual.
      const inicioVigencia = dto.inicioVigencia ?? inicioAnterior;
      const terminoVigencia = dto.terminoVigencia ?? terminoAnterior;
      this.validarVigencia(inicioVigencia, terminoVigencia);

      const antes = serializarContrato(existente);
      aplicarAtualizacao(existente, dto);
      existente.inicioVigencia = inicioVigencia;
      existente.terminoVigencia = terminoVigencia;

      const salvo = await salvarContrato(repo, existente);
      const depois = serializarContrato(salvo);

      // Eventos específicos exigidos pelo PRD, na mesma transação.
      // RB-19: alteração de status; RB-18: alteração de prazo; EC-02 preserva
      // os valores anteriores na trilha.
      if (salvo.status !== statusAnterior) {
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: { status: statusAnterior },
          dadosPosteriores: { status: salvo.status },
        });
      }
      if (
        salvo.inicioVigencia !== inicioAnterior ||
        salvo.terminoVigencia !== terminoAnterior
      ) {
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.CONTRATO_PRAZO_ALTERADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: {
            inicioVigencia: inicioAnterior,
            terminoVigencia: terminoAnterior,
          },
          dadosPosteriores: {
            inicioVigencia: salvo.inicioVigencia,
            terminoVigencia: salvo.terminoVigencia,
          },
        });
      }

      // Evento principal: snapshot completo para reconstrução.
      return {
        resultado: salvo,
        evento: {
          acao: AcaoAuditoria.CONTRATO_EDITADO,
          entidadeTipo: 'CONTRATO',
          entidadeId: salvo.id,
          dadosAnteriores: antes,
          dadosPosteriores: depois,
        },
      };
    });
  }

  /** Calendário real + coerência de vigência (issue + §8.2). */
  private validarVigencia(inicio: string, termino: string): void {
    if (!isCalendarioValido(inicio) || !isCalendarioValido(termino)) {
      throw new BadRequestException('Datas de vigência inválidas');
    }
    if (inicio > termino) {
      throw new BadRequestException(
        'Término da vigência deve ser maior ou igual ao início',
      );
    }
  }
}

/**
 * Save com tradução de códigos SQLSTATE (issue: padronizar 400/409).
 * Fora da classe porque é stateless — não precisa de `this`.
 */
async function salvarContrato(
  repo: Repository<Contrato>,
  contrato: Contrato,
): Promise<Contrato> {
  try {
    return await repo.save(contrato);
  } catch (error: unknown) {
    if (error instanceof QueryFailedError) {
      const erroDriver = error.driverError as { code?: string };
      const codigo =
        erroDriver.code ?? (error as QueryFailedError & { code?: string }).code;

      if (codigo === PG_CHECK_VIOLATION) {
        throw new BadRequestException('Dados violam restrição de integridade');
      }

      if (codigo === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('Registro conflita com outro existente');
      }

      if (codigo === PG_FK_VIOLATION) {
        throw new BadRequestException(
          'Referência inválida (responsável ou contrato)',
        );
      }
    }

    throw error;
  }
}

/**
 * Aplica só chaves presentes no DTO. `undefined` preserva; `null` (só em
 * opcionais) limpa. Campos obrigatórios já foram rejeitados em `null` pelo
 * `@ValidateIf` do DTO.
 */
function aplicarAtualizacao(alvo: Contrato, dto: AtualizarContratoDto): void {
  const camposOpcionais: (keyof AtualizarContratoDto)[] = [
    'processoAdministrativo',
    'unidadeResponsavel',
    'descricao',
    'dataAssinatura',
    'responsavelInternoId',
    'fiscalGestor',
    'observacoes',
  ];
  const camposObrigatorios: (keyof AtualizarContratoDto)[] = [
    'numeroContrato',
    'orgaoContratante',
    'objeto',
    'status',
    'modoCalculo',
  ];

  for (const campo of [...camposOpcionais, ...camposObrigatorios]) {
    if (dto[campo] !== undefined) {
      // @ts-expect-error — atribuição dinâmica homônima DTO ↔ entidade.
      alvo[campo] = dto[campo];
    }
  }
  if (dto.numeroContrato !== undefined)
    alvo.numeroContrato = dto.numeroContrato.trim();
  if (dto.orgaoContratante !== undefined)
    alvo.orgaoContratante = dto.orgaoContratante.trim();
  if (dto.objeto !== undefined) alvo.objeto = dto.objeto.trim();
}

/** Snapshot serializável — evita enviar métodos/entidade crua à auditoria. */
function serializarContrato(contrato: Contrato): Record<string, unknown> {
  return {
    numeroContrato: contrato.numeroContrato,
    processoAdministrativo: contrato.processoAdministrativo,
    orgaoContratante: contrato.orgaoContratante,
    unidadeResponsavel: contrato.unidadeResponsavel,
    objeto: contrato.objeto,
    descricao: contrato.descricao,
    dataAssinatura: contrato.dataAssinatura,
    inicioVigencia: contrato.inicioVigencia,
    terminoVigencia: contrato.terminoVigencia,
    status: contrato.status,
    responsavelInternoId: contrato.responsavelInternoId,
    fiscalGestor: contrato.fiscalGestor,
    modoCalculo: contrato.modoCalculo,
    observacoes: contrato.observacoes,
  };
}

/** `2025-02-30` não é calendário válido apesar de bater o regex. */
function isCalendarioValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
