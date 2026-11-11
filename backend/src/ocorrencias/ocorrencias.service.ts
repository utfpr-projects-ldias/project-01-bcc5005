import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { PeriodicidadeEntregavel } from '../entregaveis/periodicidade-entregavel.enum.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { OrigemOcorrencia } from './origem-ocorrencia.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import type { CriarOcorrenciaManualDto } from './dto/criar-ocorrencia-manual.dto.js';
import type { AtualizarOcorrenciaDto } from './dto/atualizar-ocorrencia.dto.js';

function addDias(dataStr: string, dias: number): string {
  const d = new Date(`${dataStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function addMeses(dataStr: string, meses: number): string {
  const [ano, mes, dia] = dataStr.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  return d.toISOString().slice(0, 10);
}

export function calcularPeriodosRecorrentes(
  inicio: string,
  termino: string,
  periodicidade: PeriodicidadeEntregavel,
): Array<{ inicio: string; fim: string; titulo: string }> {
  const periodos: Array<{ inicio: string; fim: string; titulo: string }> = [];
  // PQ-09/10: não presumir interpretação de calendário para dias 29–31
  // nem gerar um último período parcial sem regra formal homologada.
  const civil = (valor: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
    const data = new Date(`${valor}T00:00:00Z`);
    return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === valor;
  };
  if (!civil(inicio) || !civil(termino) || inicio > termino) {
    throw new BadRequestException('Período civil inválido');
  }
  if ([PeriodicidadeEntregavel.MENSAL, PeriodicidadeEntregavel.TRIMESTRAL,
    PeriodicidadeEntregavel.SEMESTRAL, PeriodicidadeEntregavel.ANUAL].includes(periodicidade)
    && Number(inicio.slice(8)) > 28) {
    throw new BadRequestException('Início nos dias 29–31 exige regra de calendário homologada');
  }
  let atual = inicio;
  let contador = 1;

  while (atual <= termino) {
    if (periodos.length >= 500) {
      throw new BadRequestException('Geração excede o limite de 500 períodos; nenhuma ocorrência foi criada');
    }
    let proximo = termino;
    if (periodicidade === PeriodicidadeEntregavel.DIARIA) {
      proximo = atual;
    } else if (periodicidade === PeriodicidadeEntregavel.SEMANAL) {
      proximo = addDias(atual, 6);
      if (proximo > termino) throw new BadRequestException('Período parcial não homologado (PQ-09/10)');
    } else if (periodicidade === PeriodicidadeEntregavel.MENSAL) {
      proximo = addDias(addMeses(atual, 1), -1);
      if (proximo > termino) throw new BadRequestException('Período parcial não homologado (PQ-09/10)');
    } else if (periodicidade === PeriodicidadeEntregavel.TRIMESTRAL) {
      proximo = addDias(addMeses(atual, 3), -1);
      if (proximo > termino) throw new BadRequestException('Período parcial não homologado (PQ-09/10)');
    } else if (periodicidade === PeriodicidadeEntregavel.SEMESTRAL) {
      proximo = addDias(addMeses(atual, 6), -1);
      if (proximo > termino) throw new BadRequestException('Período parcial não homologado (PQ-09/10)');
    } else if (periodicidade === PeriodicidadeEntregavel.ANUAL) {
      proximo = addDias(addMeses(atual, 12), -1);
      if (proximo > termino) throw new BadRequestException('Período parcial não homologado (PQ-09/10)');
    } else {
      throw new BadRequestException(
        'Periodicidade não homologada para geração automática',
      );
    }

    periodos.push({
      inicio: atual,
      fim: proximo,
      titulo: `Ocorrência #${contador} (${atual} a ${proximo})`,
    });

    contador++;
    atual = addDias(proximo, 1);

  }
  return periodos;
}

@Injectable()
export class OcorrenciasService implements OnModuleInit {
  constructor(
    @InjectRepository(Ocorrencia)
    private readonly ocorrenciasRepo: Repository<Ocorrencia>,
    @InjectRepository(Entregavel)
    private readonly entregaveisRepo: Repository<Entregavel>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly escopos: ResolverEscopoContratoService,
  ) {}

  onModuleInit(): void {
    // O guard da HU09 obtém o contrato da ocorrência persistida, nunca da URL.
    this.escopos.registrarAdaptador('ocorrencia', async (id) => {
      const item = await this.ocorrenciasRepo.findOne({
        where: { id }, select: { contratoId: true },
      });
      return item?.contratoId ?? null;
    });
    // Contexto de auditoria da ocorrência precisa ter o mesmo contrato raiz.
    this.auditoria.registrarResolvedorContexto('OCORRENCIA', async (manager, id) => {
      const item = await manager.getRepository(Ocorrencia).findOne({
        where: { id }, select: { contratoId: true },
      });
      return item?.contratoId ?? null;
    });
  }

  private async validarPermissaoContrato(
    m: EntityManager,
    contratoId: string,
    ator: UsuarioAutenticado,
    acaoPerfil: 'criar' | 'editar' | 'visualizar',
  ) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return;
    const vinculo = await m
      .getRepository(PermissaoContrato)
      .findOneBy({ contratoId, usuarioId: ator.id });
    const efetivas = permissoesEfetivas(
      ator.perfil,
      Boolean(vinculo?.podeEditar),
      vinculo?.permissoesDetalhadas,
    );
    const permitido =
      acaoPerfil === 'visualizar'
        ? vinculo !== null || ator.perfil === PerfilUsuario.GESTOR
        : acaoPerfil === 'criar'
          ? efetivas.criarEntregaveis
          : efetivas.editarEntregaveis;
    if (!permitido) {
      throw new ForbiddenException(
        'Sem permissão para gerenciar ocorrências neste contrato',
      );
    }
  }

  // Mesmo lock raiz da HU08: uma mutação não pode atravessar uma conclusão
  // concorrente do contrato, da etapa ou do entregável.
  private async bloquearContratoAberto(m: EntityManager, contratoId: string) {
    const contrato = await m.findOne(Contrato, {
      where: { id: contratoId }, lock: { mode: 'pessimistic_write' },
    });
    if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status)) {
      throw new ConflictException('Reabra ou retome o contrato antes de alterar ocorrências');
    }
  }

  private async exigirEntregavelAberto(m: EntityManager, entregavel: Entregavel) {
    if (entregavel.arquivadoEm || entregavel.statusExecucao === 'CONCLUIDO') {
      throw new ConflictException('Reabra o entregável antes de alterar ocorrências');
    }
    const etapa = await m.findOne(Etapa, { where: { id: entregavel.etapaId, contratoId: entregavel.contratoId } });
    if (!etapa || etapa.arquivadoEm || etapa.status === 'CONCLUIDA' || etapa.status === 'ENCERRADA') {
      throw new ConflictException('Reabra a etapa antes de alterar ocorrências');
    }
  }

  async gerarRecorrentes(
    contratoId: string,
    entregavelId: string,
    forcar: boolean,
    ator: UsuarioAutenticado,
  ) {
    // Não simular regeneração de períodos futuros: depende de versão/impacto
    // e confirmação conforme HU09-02, ainda não implementados.
    if (forcar) {
      throw new BadRequestException('Regeneração futura requer análise de impacto e confirmação (HU09-02 pendente)');
    }
    return this.dataSource.transaction(async (m) => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'criar');
      await this.bloquearContratoAberto(m, contratoId);
      const entregavel = await m
        .getRepository(Entregavel)
        .findOne({ where: { id: entregavelId, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!entregavel)
        throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.exigirEntregavelAberto(m, entregavel);
      if (entregavel.tipo !== TipoEntregavel.RECORRENTE) {
        throw new BadRequestException(
          'Geração automática de ocorrências é exclusiva para entregáveis recorrentes',
        );
      }
      if (
        !entregavel.inicioPrevisto ||
        !entregavel.terminoPrevisto ||
        !entregavel.periodicidade
      ) {
        throw new BadRequestException(
          'Entregável recorrente exige início previsto, término previsto e periodicidade definidos',
        );
      }

      const periodos = calcularPeriodosRecorrentes(
        entregavel.inicioPrevisto,
        entregavel.terminoPrevisto,
        entregavel.periodicidade,
      );
      const repo = m.getRepository(Ocorrencia);
      let geradas = 0;

      for (const p of periodos) {
        const existente = await repo.findOneBy({
          entregavelId,
          periodoInicio: p.inicio,
          periodoFim: p.fim,
          origem: OrigemOcorrencia.RECORRENTE,
        });

        if (existente) {
          if (existente.status === StatusOcorrencia.CONCLUIDO && !forcar) {
            continue; // Preserva concluídas se não for forçado
          }
          if (existente.status === StatusOcorrencia.CONCLUIDO && forcar) {
            continue;
          }
          continue;
        }

        const nova = repo.create({
          entregavelId,
          contratoId,
          titulo: `${entregavel.nome} - ${p.titulo}`,
          periodoInicio: p.inicio,
          periodoFim: p.fim,
          dataPrevista: p.fim,
          status: StatusOcorrencia.NAO_INICIADO,
          origem: OrigemOcorrencia.RECORRENTE,
        });

        // A linha do entregável foi bloqueada nesta transação; duas gerações
        // da mesma série não intercalam a verificação e a escrita.
        // Não engolir 23505 dentro da transação PG: após erro SQL a
        // transação já está abortada e deve ocorrer rollback integral.
        const salva = await repo.save(nova);
        geradas++;
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.OCORRENCIA_GERADA,
          entidadeTipo: 'OCORRENCIA',
          entidadeId: salva.id,
          dadosPosteriores: {
            titulo: salva.titulo,
            periodoInicio: p.inicio,
            periodoFim: p.fim,
            origem: salva.origem,
          },
        });
      }

      return {
        entregavelId,
        periodosPrevistos: periodos.length,
        novasGeradas: geradas,
      };
    });
  }

  async criarManualQuantitativa(
    contratoId: string,
    entregavelId: string,
    dto: CriarOcorrenciaManualDto,
    ator: UsuarioAutenticado,
  ) {
    return this.dataSource.transaction(async (m) => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'criar');
      await this.bloquearContratoAberto(m, contratoId);
      const entregavel = await m
        .getRepository(Entregavel)
        .findOneBy({ id: entregavelId, contratoId });
      if (!entregavel)
        throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.exigirEntregavelAberto(m, entregavel);
      if (entregavel.tipo !== TipoEntregavel.QUANTITATIVO) {
        throw new BadRequestException(
          'Ocorrência manual quantitativa exige entregável do tipo QUANTITATIVO',
        );
      }

      const repo = m.getRepository(Ocorrencia);
      const nova = repo.create({
        entregavelId,
        contratoId,
        titulo: dto.titulo.trim(),
        periodoInicio: dto.periodoInicio ?? null,
        periodoFim: dto.periodoFim ?? null,
        dataPrevista: dto.dataPrevista ?? null,
        quantidadeRealizada: dto.quantidadeRealizada ?? null,
        observacoes: dto.observacoes?.trim() ?? null,
        origem: OrigemOcorrencia.MANUAL_QUANTITATIVA,
        status: StatusOcorrencia.NAO_INICIADO,
      });

      const salva = await repo.save(nova);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_CRIADA,
        entidadeTipo: 'OCORRENCIA',
        entidadeId: salva.id,
        dadosPosteriores: {
          titulo: salva.titulo,
          origem: salva.origem,
          quantidadeRealizada: salva.quantidadeRealizada,
        },
      });

      return salva;
    });
  }

  async listar(contratoId: string, entregavelId?: string) {
    const where: Record<string, any> = { contratoId };
    if (entregavelId) where.entregavelId = entregavelId;
    return this.ocorrenciasRepo.find({
      where,
      order: { dataPrevista: 'ASC', periodoInicio: 'ASC', id: 'ASC' },
    });
  }

  async detalhar(contratoId: string, id: string) {
    const o = await this.ocorrenciasRepo.findOneBy({ id, contratoId });
    if (!o) throw new NotFoundException('Ocorrência não encontrada');
    return o;
  }

  async atualizar(
    contratoId: string,
    id: string,
    dto: AtualizarOcorrenciaDto,
    ator: UsuarioAutenticado,
  ) {
    return this.dataSource.transaction(async (m) => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'editar');
      await this.bloquearContratoAberto(m, contratoId);
      const repo = m.getRepository(Ocorrencia);
      const o = await repo.findOne({
        where: { id, contratoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!o) throw new NotFoundException('Ocorrência não encontrada');
      const entregavel = await m.getRepository(Entregavel).findOneBy({ id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.exigirEntregavelAberto(m, entregavel);

      const antes = {
        titulo: o.titulo,
        status: o.status,
        dataPrevista: o.dataPrevista,
        dataRealizada: o.dataRealizada,
        quantidadeRealizada: o.quantidadeRealizada,
      };

      if (dto.titulo !== undefined) o.titulo = dto.titulo.trim();
      if (dto.dataPrevista !== undefined) o.dataPrevista = dto.dataPrevista;
      if (dto.dataRealizada !== undefined) o.dataRealizada = dto.dataRealizada;
      if (dto.status !== undefined) o.status = dto.status;
      if (dto.quantidadeRealizada !== undefined)
        o.quantidadeRealizada = dto.quantidadeRealizada;
      if (dto.observacoes !== undefined)
        o.observacoes = dto.observacoes?.trim() ?? null;

      const salva = await repo.save(o);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_EDITADA,
        entidadeTipo: 'OCORRENCIA',
        entidadeId: id,
        dadosAnteriores: antes,
        dadosPosteriores: {
          titulo: salva.titulo,
          status: salva.status,
          dataRealizada: salva.dataRealizada,
          quantidadeRealizada: salva.quantidadeRealizada,
        },
      });

      return salva;
    });
  }
}
