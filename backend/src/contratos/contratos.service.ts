import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, type EntityManager, type Repository } from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { documentacaoVerificada } from '../entregaveis/conclusao-documental.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from './contrato.entity.js';
import type { AtualizarContratoDto } from './dto/atualizar-contrato.dto.js';
import type { CriarContratoDto } from './dto/criar-contrato.dto.js';

/** Códigos PostgreSQL mapeados para respostas HTTP padronizadas (issue HU05-02). */
const PG_CHECK_VIOLATION = '23514';
const PG_UNIQUE_VIOLATION = '23505';
const PG_FK_VIOLATION = '23503';
// Restricao unica criada pela migration 1793800000000-CodigoPublicoContratos.
const CONSTRAINT_CODIGO_PUBLICO = 'uq_contratos_codigo_publico';
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

    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      await this.validarResponsavel(manager, dto.responsavelInternoId);
      // A sequência PG é atômica entre processos, não depende do relógio nem de
      // números aleatórios. Preserve códigos históricos; não reutilize lacunas.
      const numeros = await manager.query("SELECT nextval('seq_contratos_codigo_publico')::integer AS numero") as Array<{numero: number|string}>;
      const numero = Number(numeros[0]?.numero);
      if (!Number.isSafeInteger(numero) || numero < 0 || numero > 99999) {
        throw new ConflictException('Limite de códigos públicos de contrato atingido');
      }
      const contrato = repo.create({
        codigoPublico: String(numero).padStart(5, '0'),
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
      const salvo = await salvarContrato(repo, contrato, false);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_CRIADO, entidadeTipo: 'CONTRATO',
        entidadeId: salvo.id, dadosAnteriores: null, dadosPosteriores: serializarContrato(salvo),
      }};
    });
  }

  async listar(ator: UsuarioAutenticado): Promise<Contrato[]> {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) {
      return this.contratos.find({ order: { inicioVigencia: 'DESC', numeroContrato: 'ASC' } });
    }
    // Vínculo explícito OU atribuição ativa como responsável (somente leitura).
    // A seleção é escopada ao usuário autenticado; nunca aceitar ID pela query.
    return this.contratos.createQueryBuilder('c')
      .leftJoin('permissoes_contrato', 'p', 'p.contrato_id = c.id AND p.usuario_id = :usuarioId', { usuarioId: ator.id })
      .where('(p.usuario_id IS NOT NULL OR c.responsavelInternoId = :usuarioId)', { usuarioId: ator.id })
      .andWhere('c.arquivado_em IS NULL')
      .orderBy('c.inicioVigencia', 'DESC')
      .addOrderBy('c.numeroContrato', 'ASC')
      .getMany();
  }

  async consultarAcesso(id: string, ator: UsuarioAutenticado) {
    // Mesmo estando sob guard: não confirmar ID inexistente.
    await this.detalhar(id);
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return {
      podeEditar: true, permissoes: permissoesEfetivas(ator.perfil, true, null),
    };
    const vinculo = await this.contratos.manager.getRepository(PermissaoContrato)
      .findOneBy({ usuarioId: ator.id, contratoId: id });
    const podeEditar = ator.perfil === PerfilUsuario.GESTOR && Boolean(vinculo?.podeEditar);
    // Sem vínculo, a responsabilidade administrativa NÃO concede mutações.
    const permissoes = vinculo
      ? permissoesEfetivas(ator.perfil, podeEditar, vinculo.permissoesDetalhadas)
      : permissoesEfetivas('COLABORADOR', false, { enviarComprovantes: false, verificarComprovantes: false });
    return { podeEditar, permissoes };
  }

  async detalhar(id: string): Promise<Contrato> {
    const encontrado = await this.contratos.findOneBy({ id });
    if (!encontrado) throw new NotFoundException('Contrato não encontrado');
    return encontrado;
  }

  /** Alterna arquivamento sem deletar contrato, documentos, etapas ou eventos.
   * Exclusivo do ADMIN no guard; valida novamente dentro da transação auditada.
   */
  async alterarArquivamento(id: string, arquivar: boolean, ator: UsuarioAutenticado): Promise<Contrato> {
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) throw new ForbiddenException('Somente Administrador pode arquivar contratos');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (arquivar && (contrato.status === 'CONCLUIDO' ||
        (contrato.reabertoEm === null && await documentacaoVerificada(manager, id))))
        throw new ConflictException('Contrato concluído: reabra antes de arquivar.');
      if (Boolean(contrato.arquivadoEm) === arquivar) {
        throw new ConflictException(arquivar ? 'Contrato já está arquivado' : 'Contrato não está arquivado');
      }
      const anterior = { arquivado: Boolean(contrato.arquivadoEm), status: contrato.status };
      contrato.arquivadoEm = arquivar ? new Date() : null;
      contrato.arquivadoPor = arquivar ? ator.id : null;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: arquivar ? AcaoAuditoria.CONTRATO_ARQUIVADO : AcaoAuditoria.CONTRATO_REATIVADO,
        entidadeTipo: 'CONTRATO' as const, entidadeId: id,
        dadosAnteriores: anterior,
        dadosPosteriores: { arquivado: arquivar, status: salvo.status },
      }};
    });
  }

  /** Reabertura OPERACIONAL explícita, auditada, sem alterar comprovações. */
  async reabrir(id: string, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Reative o contrato arquivado antes de reabri-lo');
      if (contrato.reabertoEm) throw new ConflictException('Contrato já foi reaberto');
      const concluidoOperacional = contrato.status === 'CONCLUIDO';
      if (!concluidoOperacional && !await documentacaoVerificada(manager, id))
        throw new ConflictException('Contrato ainda não possui comprovação concluída para reabrir');
      const anterior = contrato.status;
      if (concluidoOperacional) contrato.status = 'PLANEJAMENTO' as Contrato['status'];
      contrato.reabertoEm = new Date();
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_REABERTO, entidadeTipo: 'CONTRATO' as const,
        entidadeId: id, dadosAnteriores: { status: anterior, reabertoEm: null },
        dadosPosteriores: { status: salvo.status, reabertoEm: salvo.reabertoEm },
      } };
    });
  }

  /** Admin ou delegação explícita; guard valida antes desta chamada.
   * A trava é mantida no contrato com auditoria na mesma transação.
   * O mesmo lock de linha é usado pelo serviço de reordenação. */
  async alterarBloqueioOrdem(id: string, bloqueada: boolean, ator: UsuarioAutenticado): Promise<Contrato> {
    return this.auditoria.executarComAuditoria(ator, async (manager) => {
      const repo = manager.getRepository(Contrato);
      const contrato = await repo.createQueryBuilder('c')
        .setLock('pessimistic_write').where('c.id = :id', { id }).getOne();
      if (!contrato) throw new NotFoundException('Contrato não encontrado');
      if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado não pode ter sua ordem alterada.');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await manager.getRepository(PermissaoContrato).findOneBy({ usuarioId: ator.id, contratoId: id });
        if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).bloquearOrdemEtapas) {
          throw new ForbiddenException('Sem permissão para bloquear ou liberar a ordem deste contrato.');
        }
      }
      const anterior = Boolean(contrato.ordemEtapasBloqueada);
      contrato.ordemEtapasBloqueada = bloqueada;
      const salvo = await repo.save(contrato);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.CONTRATO_ORDEM_ETAPAS_ALTERADA,
        entidadeTipo: 'CONTRATO' as const, entidadeId: id,
        dadosAnteriores: { ordemEtapasBloqueada: anterior },
        dadosPosteriores: { ordemEtapasBloqueada: bloqueada },
      } };
    });
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
      if (existente.arquivadoEm) throw new ConflictException('Contrato arquivado. Reative antes de editar.');
      if (existente.status === 'CONCLUIDO' ||
        (existente.reabertoEm === null && await documentacaoVerificada(manager, id)))
        throw new ConflictException('Contrato concluído: reabra antes de editar.');
      if (dto.responsavelInternoId !== undefined) {
        if (ator.perfil !== PerfilUsuario.ADMINISTRADOR && dto.responsavelInternoId !== existente.responsavelInternoId) {
          throw new ForbiddenException('Somente Administrador pode alterar o responsável interno');
        }
        if (dto.responsavelInternoId !== existente.responsavelInternoId) {
          await this.validarResponsavel(manager, dto.responsavelInternoId);
        }
      }

      const inicioAnterior = existente.inicioVigencia;
      const terminoAnterior = existente.terminoVigencia;
      const statusAnterior = existente.status;

      // Vigência combinada — o DTO parcial não vê o registro atual.
      const inicioVigencia = dto.inicioVigencia ?? inicioAnterior;
      const terminoVigencia = dto.terminoVigencia ?? terminoAnterior;
      this.validarVigencia(inicioVigencia, terminoVigencia);

      const antes = serializarContrato(existente);
      aplicarAtualizacao(existente, dto);
      if (dto.status === 'CONCLUIDO') existente.reabertoEm = null;
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

  private async validarResponsavel(manager: EntityManager, id: string | null | undefined): Promise<void> {
    if (!id) return; // Responsável é opcional no PRD.
    const responsavel = await manager.getRepository(Usuario).findOneBy({ id, ativo: true });
    if (!responsavel) throw new BadRequestException('Responsável interno inexistente ou inativo');
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
  traduzirUnicidade = true,
): Promise<Contrato> {
  try {
    return await repo.save(contrato);
  } catch (error: unknown) {
    if (error instanceof QueryFailedError) {
      const erroDriver = error.driverError as { code?: string; constraint?: string };
      const codigo =
        erroDriver.code ?? (error as QueryFailedError & { code?: string }).code;

      if (codigo === PG_CHECK_VIOLATION) {
        throw new BadRequestException('Dados violam restrição de integridade');
      }

      if (codigo === PG_UNIQUE_VIOLATION) {
        if (!traduzirUnicidade && erroDriver.constraint === CONSTRAINT_CODIGO_PUBLICO) throw error;
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
    codigoPublico: contrato.codigoPublico,
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
    ordemEtapasBloqueada: contrato.ordemEtapasBloqueada,
  };
}

/** `2025-02-30` não é calendário válido apesar de bater o regex. */
function isCalendarioValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
