import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';

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
import { AtividadeEntity } from '../atividades/atividade.entity.js';
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
    throw new BadRequestException('Não é possível gerar essa periodicidade a partir do dia 29, 30 ou 31 sem uma regra homologada para meses curtos (PQ-09/10). Ajuste o início previsto do entregável.');
  }
  const rejeitarParcial = (dataInicio: string, fimNecessario: string) => {
    const br = (data: string) => data.split('-').reverse().join('/');
    throw new BadRequestException(
      `Não foi possível gerar a agenda: a periodicidade ${periodicidade.toLowerCase()} exige períodos completos. ` +
      `O último período seria de ${br(dataInicio)} a ${br(fimNecessario)}, ` +
      `mas o entregável termina em ${br(termino)}. ` +
      'Ajuste a vigência prevista do entregável ou aguarde a homologação de períodos parciais (PQ-09/10).',
    );
  };
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
      if (proximo > termino) rejeitarParcial(atual, proximo);
    } else if (periodicidade === PeriodicidadeEntregavel.MENSAL) {
      proximo = addDias(addMeses(atual, 1), -1);
      if (proximo > termino) rejeitarParcial(atual, proximo);
    } else if (periodicidade === PeriodicidadeEntregavel.TRIMESTRAL) {
      proximo = addDias(addMeses(atual, 3), -1);
      if (proximo > termino) rejeitarParcial(atual, proximo);
    } else if (periodicidade === PeriodicidadeEntregavel.SEMESTRAL) {
      proximo = addDias(addMeses(atual, 6), -1);
      if (proximo > termino) rejeitarParcial(atual, proximo);
    } else if (periodicidade === PeriodicidadeEntregavel.ANUAL) {
      proximo = addDias(addMeses(atual, 12), -1);
      if (proximo > termino) rejeitarParcial(atual, proximo);
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

export function validarDadosOcorrencia(dto: { titulo?: string | null; periodoInicio?: string | null; periodoFim?: string | null; dataPrevista?: string | null; dataRealizada?: string | null; quantidadeRealizada?: string | null; status?: StatusOcorrencia | null }) {
  for (const v of [dto.periodoInicio, dto.periodoFim, dto.dataPrevista, dto.dataRealizada]) {
    if (v == null) continue;
    const d = new Date(`${v}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== v) throw new BadRequestException('Data civil inválida');
  }
  if (dto.periodoInicio && dto.periodoFim && dto.periodoInicio > dto.periodoFim) throw new BadRequestException('Período invertido');
  if (dto.titulo !== undefined && (typeof dto.titulo !== 'string' || !dto.titulo.trim())) throw new BadRequestException('Título obrigatório');
  if (dto.quantidadeRealizada != null && !/^\d{1,15}(?:\.\d{1,3})?$/.test(dto.quantidadeRealizada)) throw new BadRequestException('Quantidade decimal inválida');
  if (dto.status === null) throw new BadRequestException('Status não pode ser nulo');
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
    acaoPerfil: 'criar' | 'editar' | 'visualizar' | 'concluir' | 'reabrir' | 'gerar',
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
          ? efetivas.criarOcorrencias
          : acaoPerfil === 'editar' ? efetivas.editarOcorrencias
          : acaoPerfil === 'concluir' ? efetivas.concluirOcorrencias
          : acaoPerfil === 'reabrir' ? efetivas.reabrirOcorrencias
          : efetivas.configurarAgendaOcorrencias;
    if (!permitido || !vinculo) {
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
    return contrato;
  }

  private async exigirEntregavelAberto(m: EntityManager, entregavel: Entregavel) {
    if (entregavel.arquivadoEm || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? '')) {
      throw new ConflictException('Reabra o entregável antes de alterar ocorrências');
    }
    const etapa = await m.findOne(Etapa, { where: { id: entregavel.etapaId, contratoId: entregavel.contratoId } });
    if (!etapa || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || etapa.arquivadoEm || etapa.status === 'CONCLUIDA' || etapa.status === 'ENCERRADA' || etapa.status === 'FINALIZADA') {
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
    // e confirmação pela rota dedicada de replanejamento.
    if (forcar) {
      throw new BadRequestException('Use a rota de replanejamento com análise de impacto e confirmação');
    }
    return this.dataSource.transaction(async (m) => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'gerar');
      const contrato = await this.bloquearContratoAberto(m, contratoId);
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

      const inicioAgenda = entregavel.agendaInicioFuturo ?? entregavel.inicioPrevisto;
      if (inicioAgenda < contrato.inicioVigencia || entregavel.terminoPrevisto > contrato.terminoVigencia) {
        throw new ConflictException('A agenda deve estar contida na vigência do contrato; revise o planejamento');
      }
      const periodos = calcularPeriodosRecorrentes(
        inicioAgenda,
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
          substituidaEm: IsNull(),
        });

        if (existente) {
          if (existente.substituidaEm) throw new ConflictException('Período substituído: use o replanejamento confirmado');
          continue;
        }

        const nova = repo.create({
          entregavelId,
          contratoId,
          titulo: `${entregavel.nome} - ${p.titulo}`.slice(0, 255),
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
      if (entregavel.tipo === TipoEntregavel.UNICO) throw new BadRequestException('Entregável único não possui ocorrências');
            if (entregavel.tipo === TipoEntregavel.RECORRENTE) {
        throw new BadRequestException('Em entregáveis recorrentes, use a geração da agenda; registre a descrição nas atividades vinculadas aos períodos');
      }

      if ([TipoEntregavel.CONTINUO, TipoEntregavel.MARCO].includes(entregavel.tipo) &&
          await m.count(Ocorrencia, { where: { entregavelId, contratoId, substituidaEm: IsNull() } }))
        throw new ConflictException('Este entregável admite uma única ocorrência principal');
      const modoRegistro = dto.modoRegistro ?? ((dto.metaQuantidade != null || dto.quantidadeRealizada != null) ? 'QUANTITATIVO' : 'DESCRITIVO');
      if (modoRegistro === 'QUANTITATIVO' && entregavel.quantidadeRealizada != null && Number(entregavel.quantidadeRealizada) !== 0) throw new ConflictException('Já existe quantidade declarada diretamente; concilie antes de detalhar por ocorrências');
      if (modoRegistro === 'QUANTITATIVO' && entregavel.tipo !== TipoEntregavel.QUANTITATIVO) throw new BadRequestException('Registro por quantidade exige entregável quantitativo');
      if (modoRegistro === 'DESCRITIVO' && entregavel.tipo === TipoEntregavel.QUANTITATIVO) throw new BadRequestException('Entregável quantitativo exige ocorrência com meta e unidade de medida; utilize as atividades para o relato do trabalho');
      if (modoRegistro === 'DESCRITIVO' && (dto.metaQuantidade != null || dto.quantidadeRealizada != null)) throw new BadRequestException('Ocorrência descritiva não recebe metas ou quantidades; descreva o trabalho nas atividades');
      if (modoRegistro === 'QUANTITATIVO' && (!entregavel.quantidadePrevista || !entregavel.unidadeMedida)) throw new BadRequestException('Informe a meta total e a unidade no Planejamento do entregável antes de cadastrar a medição');
      if (modoRegistro === 'QUANTITATIVO' && dto.metaQuantidade == null && dto.quantidadeRealizada == null) throw new BadRequestException('Ocorrência por quantidade exige meta planejada');
      if (dto.metaQuantidade != null && (!Number.isFinite(Number(dto.metaQuantidade)) || Number(dto.metaQuantidade) <= 0)) throw new BadRequestException('Meta quantitativa deve ser maior que zero');
      validarDadosOcorrencia(dto);
      const repo = m.getRepository(Ocorrencia);
      const nova = repo.create({
        entregavelId,
        contratoId,
        titulo: dto.titulo.trim(),
        periodoInicio: dto.periodoInicio ?? null,
        periodoFim: dto.periodoFim ?? null,
        dataPrevista: dto.dataPrevista ?? dto.periodoFim ?? dto.periodoInicio ?? null,
        quantidadeRealizada: dto.metaQuantidade != null ? null : dto.quantidadeRealizada ?? null,
        metaQuantidade: dto.metaQuantidade ?? null,
        modoRegistro,
        quantidadeAprovada: null,
        observacoes: dto.observacoes?.trim() ?? null,
        origem: modoRegistro === 'DESCRITIVO' ? OrigemOcorrencia.MANUAL_DESCRITIVA : OrigemOcorrencia.MANUAL_QUANTITATIVA,
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
          modoRegistro: salva.modoRegistro,
        },
      });

      return salva;
    });
  }

  /** Soma executada pelas atividades ativas, sem duplicar o valor de cada registro. */
  private async somarAtividades(m: EntityManager, id: string): Promise<number> {
    const rows: Array<{ total: string }> = await m.query(`SELECT COALESCE(SUM("quantidade_execucao"),0)::text AS total FROM atividades WHERE "ocorrenciaId"=$1 AND "excluidaEm" IS NULL AND status <> 'ARQUIVADA'`, [id]);
    return Number(rows[0]?.total ?? 0);
  }

  async solicitarConclusao(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'editar');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.getRepository(Ocorrencia).findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, entregavel);
      if (![StatusOcorrencia.NAO_INICIADO, StatusOcorrencia.EM_ANDAMENTO, StatusOcorrencia.EM_REVISAO].includes(o.status)) throw new ConflictException('Ocorrência já submetida à conclusão');
      if (entregavel.tipo === TipoEntregavel.CONTINUO && entregavel.terminoPrevisto &&
          new Date().toISOString().slice(0, 10) < entregavel.terminoPrevisto)
        throw new ConflictException('A conclusão de serviço contínuo somente pode ser solicitada após o término previsto');
      if (o.metaQuantidade != null && await this.somarAtividades(m, id) < Number(o.metaQuantidade)) throw new ConflictException('Meta ainda não alcançada; registre as atividades restantes');
      // Não basta uma data realizada: a ocorrência deve ter trabalho real
      // validado antes de entrar na fila de aprovação.
      const linhasVerificadas: Array<{ total: string }> = await m.query(`SELECT COUNT(*)::text AS total FROM atividades a
        WHERE a."contratoId"=$2 AND a.status='VERIFICADA' AND a."excluidaEm" IS NULL
          AND (a."ocorrenciaId"=$1 OR EXISTS (SELECT 1 FROM "atividade_ocorrencias" ao
            WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=$1))`, [id, contratoId]);
      const verificadas = Number(linhasVerificadas[0]?.total ?? 0);
      if (verificadas < 1) throw new ConflictException('Verifique ao menos uma atividade vinculada antes de solicitar a conclusão');
      // A solicitação bloqueia todas as atividades vinculadas. Não é possível
      // deixá-las aguardando verificação depois de congelar os registros.
      const aindaPendentes: Array<{ total: string }> = await m.query(
        `SELECT COUNT(*)::text AS total FROM atividades WHERE "excluidaEm" IS NULL AND status <> 'ARQUIVADA' AND status <> 'VERIFICADA' AND ("ocorrenciaId"=$1 OR EXISTS (SELECT 1 FROM "atividade_ocorrencias" ao WHERE ao."atividadeId"=atividades.id AND ao."ocorrenciaId"=$1))`, [id]);
      if (Number(aindaPendentes[0]?.total ?? 0) > 0)
        throw new ConflictException('Verifique todas as atividades vinculadas antes de solicitar a conclusão');
      const antes = { status: o.status };
      o.status = StatusOcorrencia.PENDENTE_CONCLUSAO;
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id, dadosAnteriores: antes, dadosPosteriores: { status: salvo.status } });
      return salvo;
    });
  }

  async concluir(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'concluir');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.getRepository(Ocorrencia).findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      if (o.status !== StatusOcorrencia.PENDENTE_CONCLUSAO) throw new ConflictException('Somente ocorrências pendentes podem ser aprovadas');
      const quantidade = o.metaQuantidade != null ? await this.somarAtividades(m, id) : Number(o.quantidadeRealizada ?? 0);
      if (o.metaQuantidade != null && quantidade < Number(o.metaQuantidade)) throw new ConflictException('Quantidade abaixo da meta');
      if (o.origem === OrigemOcorrencia.MANUAL_QUANTITATIVA && o.modoRegistro !== 'DESCRITIVO' && quantidade <= 0) throw new ConflictException('Registre quantidade positiva antes de concluir');
      const pendentes: Array<{ total: string }> = await m.query(
        `SELECT COUNT(*)::text AS total FROM atividades WHERE "excluidaEm" IS NULL AND status <> 'ARQUIVADA' AND status <> 'VERIFICADA' AND ("ocorrenciaId"=$1 OR EXISTS (SELECT 1 FROM "atividade_ocorrencias" ao WHERE ao."atividadeId"=atividades.id AND ao."ocorrenciaId"=$1))`, [id]);
      if (Number(pendentes[0]?.total ?? 0) > 0) throw new ConflictException('Todas as atividades vinculadas devem estar verificadas antes da aprovação');
      const linhasVerificadas: Array<{ total: string }> = await m.query(`SELECT COUNT(*)::text AS total FROM atividades a
        WHERE a."contratoId"=$2 AND a.status='VERIFICADA' AND a."excluidaEm" IS NULL
          AND (a."ocorrenciaId"=$1 OR EXISTS (SELECT 1 FROM "atividade_ocorrencias" ao
            WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=$1))`, [id, contratoId]);
      const verificadas = Number(linhasVerificadas[0]?.total ?? 0);
      if (verificadas < 1) throw new ConflictException('Ao menos uma atividade vinculada precisa estar verificada para aprovar');
      const antes = { status: o.status, quantidadeAprovada: o.quantidadeAprovada };
      o.status = StatusOcorrencia.CONCLUIDO;
      o.quantidadeAprovada = o.origem === OrigemOcorrencia.MANUAL_QUANTITATIVA && o.modoRegistro !== 'DESCRITIVO' ? String(quantidade) : null;
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id, dadosAnteriores: antes, dadosPosteriores: { status: salvo.status, quantidadeAprovada: salvo.quantidadeAprovada } });
      return salvo;
    });
  }

  /** Encerramento administrativo: não aprova quantidades e não aumenta o progresso físico. */
  async solicitarEncerramento(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Justifique o encerramento com 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'editar');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.findOne(Ocorrencia, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const e = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, e);
      if (!['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(o.status))
        throw new ConflictException('Esta ocorrência já possui uma solicitação ou decisão final');
      const abertas: Array<{ total: string }> = await m.query(
        `SELECT COUNT(*)::text AS total FROM atividades WHERE "excluidaEm" IS NULL AND status NOT IN ('ARQUIVADA','VERIFICADA') AND ("ocorrenciaId"=$1 OR EXISTS (SELECT 1 FROM "atividade_ocorrencias" ao WHERE ao."atividadeId"=atividades.id AND ao."ocorrenciaId"=$1))`, [id]);
      if (Number(abertas[0]?.total ?? 0) > 0)
        throw new ConflictException('Verifique ou arquive as atividades antes de solicitar encerramento');
      // Conclusão e encerramento são alternativas mutuamente exclusivas.
      // Não permitir contornar a conclusão integral pela chamada direta à API.
      const verificadas: Array<{ total: string }> = await m.query(`SELECT COUNT(*)::text AS total
        FROM atividades a WHERE a."contratoId"=$2 AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
        AND (a."ocorrenciaId"=$1 OR EXISTS (SELECT 1 FROM atividade_ocorrencias ao
          WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=$1))`, [id, contratoId]);
      const atividadeAprovada = Number(verificadas[0]?.total ?? 0) > 0;
      const metaAtingida = o.metaQuantidade == null || (await this.somarAtividades(m, id)) >= Number(o.metaQuantidade);
      const prazoContinuoCumprido = e.tipo !== TipoEntregavel.CONTINUO ||
        !e.terminoPrevisto || new Date().toISOString().slice(0, 10) >= e.terminoPrevisto;
      if (atividadeAprovada && metaAtingida && prazoContinuoCumprido)
        throw new ConflictException('A conclusão está disponível. Solicite conclusão em vez de encerramento.');
      const anterior = { status: o.status, motivoEncerramento: o.motivoEncerramento };
      o.status = StatusOcorrencia.PENDENTE_ENCERRAMENTO;
      o.motivoEncerramento = justificativa;
      o.quantidadeAprovada = null;
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id,
        dadosAnteriores: anterior, dadosPosteriores: { status: salvo.status, justificativa },
      });
      return salvo;
    });
  }

  async aprovarEncerramento(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'concluir');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.findOne(Ocorrencia, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      if (o.status !== StatusOcorrencia.PENDENTE_ENCERRAMENTO)
        throw new ConflictException('A ocorrência não está aguardando encerramento');
      const anterior = { status: o.status, quantidadeAprovada: o.quantidadeAprovada };
      o.status = StatusOcorrencia.ENCERRADA;
      o.encerradaEm = new Date(); o.encerradaPor = ator.id;
      o.quantidadeAprovada = null;
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id,
        dadosAnteriores: anterior, dadosPosteriores: { status: salvo.status,
          justificativa: o.motivoEncerramento, aprovadoPor: ator.id,
          quantidadeAprovada: null, encerradaEm: o.encerradaEm },
      });
      return salvo;
    });
  }

  async reabrir(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    if (motivo.trim().length < 15 || motivo.trim().length > 200) throw new BadRequestException('Justificativa de reabertura: 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'reabrir');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.getRepository(Ocorrencia).findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, entregavel);
      if (![StatusOcorrencia.PENDENTE_CONCLUSAO, StatusOcorrencia.CONCLUIDO, StatusOcorrencia.PENDENTE_ENCERRAMENTO, StatusOcorrencia.ENCERRADA].includes(o.status)) throw new ConflictException('Somente ocorrências pendentes ou concluídas podem ser reabertas');
      const antes = { status: o.status, quantidadeAprovada: o.quantidadeAprovada };
      o.status = StatusOcorrencia.EM_REVISAO;
      o.quantidadeAprovada = null; o.motivoEncerramento = null; o.encerradaEm = null; o.encerradaPor = null;
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id, dadosAnteriores: antes, dadosPosteriores: { status: salvo.status, quantidadeAprovada: null, justificativa: motivo.trim() } });
      return salvo;
    });
  }

  async listar(contratoId: string, entregavelId?: string) {
    const where: Record<string, any> = { contratoId };
    if (entregavelId) where.entregavelId = entregavelId;
    const itens = await this.ocorrenciasRepo.find({
      where,
      order: { dataPrevista: 'ASC', periodoInicio: 'ASC', id: 'ASC' },
    });
    if (!itens.length) return [];
    const ids = itens.filter(o => o.metaQuantidade != null).map(o => o.id);
    if (!ids.length) return itens.map(o => ({ ...o, quantidadeExecutada: null }));
    const linhas: Array<{ id: string; total: string }> = await this.ocorrenciasRepo.manager.query(
      `SELECT "ocorrenciaId" AS id, COALESCE(SUM(quantidade_execucao),0)::text AS total
       FROM atividades WHERE "ocorrenciaId" = ANY($1::uuid[])
       AND "excluidaEm" IS NULL AND status <> 'ARQUIVADA'
       GROUP BY "ocorrenciaId"`, [ids]);
    const totais = new Map(linhas.map(linha => [linha.id, linha.total]));
    return itens.map(o => ({ ...o, quantidadeExecutada: o.metaQuantidade != null ? (totais.get(o.id) ?? '0') : null }));
  }

  async detalhar(contratoId: string, id: string) {
    const o = await this.ocorrenciasRepo.findOneBy({ id, contratoId });
    if (!o) throw new NotFoundException('Ocorrência não encontrada');
    const atividades = await this.ocorrenciasRepo.manager.createQueryBuilder(AtividadeEntity, 'atividade')
      .select(['atividade.id', 'atividade.titulo', 'atividade.status', 'atividade.excluidaEm', 'atividade.dataHora'])
      .where('atividade.contratoId = :contratoId', { contratoId })
      .andWhere(`(atividade.ocorrenciaId = :id OR EXISTS (
        SELECT 1 FROM "atividade_ocorrencias" ao WHERE ao."atividadeId"=atividade.id AND ao."ocorrenciaId"=:id
      ))`, { id }).orderBy('atividade.dataHora', 'DESC').getMany();
    const quantidadeExecutada = o.metaQuantidade != null ? await this.somarAtividades(this.ocorrenciasRepo.manager, id) : null;
    return { ...o, quantidadeExecutada: quantidadeExecutada == null ? null : quantidadeExecutada.toFixed(3), atividades: atividades.filter(a => !a.excluidaEm) };
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
      if (o.substituidaEm) throw new ConflictException('Ocorrência histórica não pode ser editada');
      if ([StatusOcorrencia.PENDENTE_CONCLUSAO, StatusOcorrencia.CONCLUIDO, StatusOcorrencia.PENDENTE_ENCERRAMENTO, StatusOcorrencia.ENCERRADA].includes(o.status)) throw new ConflictException('A ocorrência está pendente ou concluída; solicite reabertura autorizada antes de alterar');
      const entregavel = await m.getRepository(Entregavel).findOneBy({ id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.exigirEntregavelAberto(m, entregavel);

      validarDadosOcorrencia(dto);
      if (o.origem === OrigemOcorrencia.RECORRENTE && dto.quantidadeRealizada != null) throw new BadRequestException('Quantidade é exclusiva de ocorrências quantitativas');
      if (o.modoRegistro === 'DESCRITIVO' && (dto.quantidadeRealizada != null || dto.metaQuantidade != null)) throw new BadRequestException('Ocorrência descritiva não aceita quantidade nem meta');
      const antes = {
        titulo: o.titulo,
        status: o.status,
        dataPrevista: o.dataPrevista,
        dataRealizada: o.dataRealizada,
        quantidadeRealizada: o.quantidadeRealizada, observacoes: o.observacoes,
      };

      if (dto.status !== undefined) throw new ConflictException('A situação é controlada pelo fluxo de atividades, conclusão e reabertura; não pode ser editada diretamente');
      if (dto.metaQuantidade !== undefined && o.metaQuantidade != null) {
        const executada = await this.somarAtividades(m, id);
        if (Number(dto.metaQuantidade) <= 0 || Number(dto.metaQuantidade) < executada) throw new ConflictException('Nova meta não pode ser inferior ao volume já executado');
        o.metaQuantidade = dto.metaQuantidade;
        // A meta atingida habilita a solicitação, não aprova nem bloqueia atividades automaticamente.
      }
      if (o.metaQuantidade != null && dto.quantidadeRealizada !== undefined) throw new ConflictException('Quantidade executada é calculada a partir das atividades; edite a atividade vinculada');
      if (dto.titulo !== undefined) o.titulo = dto.titulo.trim();
      if (dto.dataPrevista !== undefined) o.dataPrevista = dto.dataPrevista;
      if (dto.dataRealizada !== undefined) o.dataRealizada = dto.dataRealizada;
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
          dataRealizada: salva.dataRealizada, dataPrevista: salva.dataPrevista, observacoes: salva.observacoes,
          quantidadeRealizada: salva.quantidadeRealizada,
        },
      });

      return salva;
    });
  }
}
