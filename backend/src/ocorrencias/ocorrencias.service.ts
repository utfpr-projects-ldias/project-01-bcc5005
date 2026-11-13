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
import { resumoMedicao, proximoStatusAutomatico, type ResumoMedicao } from './medicao-ocorrencia.js';
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
    acaoPerfil: 'criar' | 'editar' | 'visualizar' | 'concluir' | 'reabrir' | 'gerar' | 'registrar' | 'vincularEvidencia',
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
          : acaoPerfil === 'registrar' ? efetivas.editarExecucaoFisica
          : acaoPerfil === 'vincularEvidencia' ? efetivas.enviarComprovantes
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

  private async exigirPermissaoEspecifica(m: EntityManager, contratoId: string,
    ator: UsuarioAutenticado, chave: 'editarExigenciasOcorrencia' | 'editarPesoOcorrencia') {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return;
    const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
    if (!vinculo || !permissoesEfetivas(ator.perfil, Boolean(vinculo.podeEditar), vinculo.permissoesDetalhadas)[chave])
      throw new ForbiddenException(`Sem permissão específica para ${chave === 'editarPesoOcorrencia' ? 'alterar peso do período' : 'alterar exigências de atividades/evidências'}`);
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
    requisitos?: {minimoAtividadesVerificadas?: number; minimoEvidenciasVerificadas?: number;
      minimoFotos?: number; minimoRelatorios?: number; minimoEvidenciasLivres?: number;
      modoRegistro?: 'DESCRITIVO' | 'QUANTITATIVO'; metaQuantidade?: string;
      evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?: boolean},
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
      validarRequisitosMinimos(requisitos?.minimoEvidenciasVerificadas, requisitos?.evidenciaExigida, requisitos);
      if (requisitos?.modoRegistro === 'QUANTITATIVO' && (!entregavel.unidadeMedida || !requisitos.metaQuantidade || !(Number(requisitos.metaQuantidade) > 0)))
        throw new BadRequestException('Recorrente quantitativo requer unidade do entregável e meta positiva por ocorrência.');
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
          exigeAtividade: (requisitos?.minimoAtividadesVerificadas ?? 1) > 0,
          minimoAtividadesVerificadas: requisitos?.minimoAtividadesVerificadas ?? 1,
          evidenciaExigida: requisitos?.evidenciaExigida ?? 'NENHUMA',
          minimoEvidenciasVerificadas: requisitos?.minimoEvidenciasVerificadas ?? 0,
          minimoFotos: requisitos?.minimoFotos ?? null,
          minimoRelatorios: requisitos?.minimoRelatorios ?? null,
          minimoEvidenciasLivres: requisitos?.minimoEvidenciasLivres ?? null,
          permiteEncerramentoExcepcional: requisitos?.permiteEncerramentoExcepcional ?? true,
          // Calendário recorrente mantém meta por período somente quando a obrigação
          // está explicitamente configurada com quantidade/unidade.
          modoRegistro: requisitos?.modoRegistro ?? 'DESCRITIVO',
          metaQuantidade: requisitos?.modoRegistro === 'QUANTITATIVO' ? requisitos.metaQuantidade! : null,
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
            minimoAtividadesVerificadas: salva.minimoAtividadesVerificadas,
            minimoEvidenciasVerificadas: salva.minimoEvidenciasVerificadas,
            evidenciaExigida: salva.evidenciaExigida,
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
      validarRequisitosMinimos(dto.minimoEvidenciasVerificadas, dto.evidenciaExigida, dto);
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
        exigeAtividade: (dto.minimoAtividadesVerificadas ?? (dto.exigeAtividade === false ? 0 : 1)) > 0,
        minimoAtividadesVerificadas: dto.minimoAtividadesVerificadas ?? (dto.exigeAtividade === false ? 0 : 1),
        evidenciaExigida: dto.evidenciaExigida ?? 'NENHUMA',
        minimoEvidenciasVerificadas: dto.minimoEvidenciasVerificadas ?? (dto.evidenciaExigida === 'AMBOS' ? 2 : dto.evidenciaExigida && dto.evidenciaExigida !== 'NENHUMA' ? 1 : 0),
        minimoFotos: dto.minimoFotos ?? null,
        minimoRelatorios: dto.minimoRelatorios ?? null,
        minimoEvidenciasLivres: dto.minimoEvidenciasLivres ?? null,
        pesoPeriodo: dto.pesoPeriodo ?? null,
        permiteEncerramentoExcepcional: dto.permiteEncerramentoExcepcional ?? true,
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
          minimoAtividadesVerificadas: salva.minimoAtividadesVerificadas,
          minimoEvidenciasVerificadas: salva.minimoEvidenciasVerificadas,
          minimoFotos: salva.minimoFotos, minimoRelatorios: salva.minimoRelatorios,
          minimoEvidenciasLivres: salva.minimoEvidenciasLivres, pesoPeriodo: salva.pesoPeriodo,
          evidenciaExigida: salva.evidenciaExigida,
        },
      });

      return salva;
    });
  }

  /** Medições verificadas por atividade (inclusive secundárias) + lançamentos manuais identificáveis. */
  private async somarAtividades(m: EntityManager, id: string): Promise<number> {
    const o = await m.findOneBy(Ocorrencia, { id });
    return o ? (await resumoMedicao(m, o)).quantidadeExecutada : 0;
  }

  /** Não aprova uma ocorrência; apenas a coloca em fila de decisão quando elegível. */
  private async recalcularEstado(m: EntityManager, o: Ocorrencia, ator: UsuarioAutenticado): Promise<ResumoMedicao> {
    const r = await resumoMedicao(m, o);
    if (o.metaQuantidade != null && r.quantidadeRegistrada > Number(o.metaQuantidade))
      throw new ConflictException(`Quantidade registrada (${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(r.quantidadeRegistrada)}) excede a meta (${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(Number(o.metaQuantidade))}). Corrija a meta ou o lançamento sem duplicar a execução.`);
    if ([StatusOcorrencia.CONCLUIDO,StatusOcorrencia.ENCERRADA,
      StatusOcorrencia.PENDENTE_ENCERRAMENTO,StatusOcorrencia.PENDENTE_CONCLUSAO].includes(o.status)) return r;
    const anterior = o.status;
    const proximo = proximoStatusAutomatico(o,r) as StatusOcorrencia;
    if (anterior !== proximo) {
      o.status = proximo;
      await m.save(Ocorrencia,o);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO,entidadeTipo:'OCORRENCIA',entidadeId:o.id,
        dadosAnteriores:{status:anterior},dadosPosteriores:{status:proximo,quantidadeExecutada:r.quantidadeExecutada,
          motivo:proximo===StatusOcorrencia.PENDENTE_CONCLUSAO?'CRITERIOS_ATENDIDOS_AGUARDANDO_APROVACAO':'RECALCULO_EXECUCAO'},
      });
    }
    return r;
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
      const r = await resumoMedicao(m,o);
      if (!r.metaAtingida) throw new ConflictException('Meta ou execução ainda não atingida. Confira as quantidades verificadas e os lançamentos.');
      if (!r.requisitosAtendidos) throw new ConflictException('Existem atividades pendentes ou evidências obrigatórias ainda não vinculadas/verificadas.');
      // A execução física não exige evidência por padrão. Só critérios configurados
      // explicitamente bloqueiam a solicitação, preservando RB-07/08 do PRD.
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
      const r = await resumoMedicao(m,o);
      if (!r.metaAtingida || !r.requisitosAtendidos) throw new ConflictException('A execução ou as exigências da ocorrência mudaram; reabra e revise antes da aprovação.');
      const quantidade = r.quantidadeExecutada;
      const antes = { status: o.status, quantidadeAprovada: o.quantidadeAprovada };
      o.status = StatusOcorrencia.CONCLUIDO;
      o.quantidadeAprovada = o.modoRegistro === 'QUANTITATIVO' ? String(quantidade) : null;
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
      if (o && !o.permiteEncerramentoExcepcional) throw new ConflictException('Encerramento excepcional desabilitado nesta ocorrência');
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
      const resumoAtual = await resumoMedicao(m, o);
      const prazoContinuoCumprido = e.tipo !== TipoEntregavel.CONTINUO ||
        !e.terminoPrevisto || new Date().toISOString().slice(0, 10) >= e.terminoPrevisto;
      if (resumoAtual.metaAtingida && resumoAtual.requisitosAtendidos && prazoContinuoCumprido)
        throw new ConflictException('Todos os requisitos estão atendidos; solicite conclusão em vez de encerramento.');
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
    return Promise.all(itens.map(async o => {
      if (o.metaQuantidade == null) return { ...o, quantidadeExecutada: null };
      const r = await resumoMedicao(this.ocorrenciasRepo.manager,o);
      return { ...o, quantidadeExecutada: r.quantidadeExecutada.toFixed(3),
        quantidadeRestante: r.quantidadeRestante, progressoPercentual: r.progressoPercentual };
    }));
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
    const resumo = await resumoMedicao(this.ocorrenciasRepo.manager,o);
    return { ...o, ...resumo, atividades: atividades.filter(a => !a.excluidaEm) };
  }

  /** Início explícito: não envolve aprovação nem alteração quantitativa.
   *  Transição idempotente com política da ocorrência e auditoria transacional. */
  /** Ativação temporal explícita e idempotente; nunca altera revisão, pendências ou finais.
   * A visualização pública não executa UPDATE em GET. */
  async iniciarPrevistas(contratoId:string,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await this.validarPermissaoContrato(m,contratoId,ator,'editar');
      await this.bloquearContratoAberto(m,contratoId);
      const hoje=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const previstas=await m.getRepository(Ocorrencia).find({where:{contratoId,status:StatusOcorrencia.NAO_INICIADO,substituidaEm:IsNull()},order:{periodoInicio:'ASC'},take:500,lock:{mode:'pessimistic_write'}});
      let iniciadas=0;
      for (const o of previstas) {
        const data=o.periodoInicio??o.dataPrevista;
        if (!data || data>hoje) continue;
        const e=await m.findOneBy(Entregavel,{id:o.entregavelId,contratoId});
        if (!e || e.arquivadoEm || ['CONCLUIDO','FINALIZADO'].includes(e.statusExecucao??'')) continue;
        o.status=StatusOcorrencia.EM_ANDAMENTO;
        await m.save(Ocorrencia,o);
        await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO,
          entidadeTipo:'OCORRENCIA',entidadeId:o.id,dadosAnteriores:{status:StatusOcorrencia.NAO_INICIADO},
          dadosPosteriores:{status:StatusOcorrencia.EM_ANDAMENTO,motivo:'INICIO_AUTOMATICO_POR_DATA',data}});
        iniciadas++;
      }
      return {iniciadas,dataReferencia:hoje};
    });
  }
  async iniciar(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m, contratoId, ator, 'editar');
      await this.bloquearContratoAberto(m, contratoId);
      const repo = m.getRepository(Ocorrencia);
      const o = await repo.findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const entregavel = await m.getRepository(Entregavel).findOneBy({ id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, entregavel);
      if (o.status === StatusOcorrencia.EM_ANDAMENTO) return o; // repetição não duplica auditoria
      if (o.status !== StatusOcorrencia.NAO_INICIADO)
        throw new ConflictException('Somente uma ocorrência não iniciada pode ser colocada em andamento.');
      o.status = StatusOcorrencia.EM_ANDAMENTO;
      await repo.save(o);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id,
        dadosAnteriores: { status: StatusOcorrencia.NAO_INICIADO }, dadosPosteriores: { status: StatusOcorrencia.EM_ANDAMENTO },
      });
      return o;
    });
  }

  async atualizar(
    contratoId: string,
    id: string,
    dto: AtualizarOcorrenciaDto,
    ator: UsuarioAutenticado,
    escopo: 'GERAL' | 'EXIGENCIAS' | 'PESO' = 'GERAL',
  ) {
    return this.dataSource.transaction(async (m) => {
      await this.validarPermissaoContrato(m, contratoId, ator, escopo === 'GERAL' ? 'editar' : 'visualizar');
      if (escopo !== 'GERAL') {
        const chavesPermitidas = escopo === 'PESO' ? ['pesoPeriodo'] : [
          'exigeAtividade','minimoAtividadesVerificadas','minimoEvidenciasVerificadas',
          'minimoFotos','minimoRelatorios','minimoEvidenciasLivres','evidenciaExigida','permiteEncerramentoExcepcional',
        ];
        if (Object.keys(dto).some(chave => !chavesPermitidas.includes(chave)))
          throw new BadRequestException('Esta operação só pode alterar as propriedades autorizadas da ocorrência.');
        await this.exigirPermissaoEspecifica(m, contratoId, ator, escopo === 'PESO' ? 'editarPesoOcorrencia' : 'editarExigenciasOcorrencia');
      }
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
      if (['minimoAtividadesVerificadas','minimoEvidenciasVerificadas','minimoFotos','minimoRelatorios','minimoEvidenciasLivres','exigeAtividade','evidenciaExigida'].some(c => Object.prototype.hasOwnProperty.call(dto,c)))
        await this.exigirPermissaoEspecifica(m, contratoId, ator, 'editarExigenciasOcorrencia');
      if (dto.pesoPeriodo !== undefined) await this.exigirPermissaoEspecifica(m, contratoId, ator, 'editarPesoOcorrencia');
      validarRequisitosMinimos(dto.minimoEvidenciasVerificadas, dto.evidenciaExigida ?? o.evidenciaExigida, {
        minimoFotos: dto.minimoFotos ?? o.minimoFotos, minimoRelatorios: dto.minimoRelatorios ?? o.minimoRelatorios,
        minimoEvidenciasLivres: dto.minimoEvidenciasLivres ?? o.minimoEvidenciasLivres,
      });
      if (o.origem === OrigemOcorrencia.RECORRENTE && dto.quantidadeRealizada != null) throw new BadRequestException('Quantidade é exclusiva de ocorrências quantitativas');
      if (o.modoRegistro === 'DESCRITIVO' && (dto.quantidadeRealizada != null || dto.metaQuantidade != null)) throw new BadRequestException('Ocorrência descritiva não aceita quantidade nem meta');
      const antes = {
        titulo: o.titulo,
        status: o.status,
        dataPrevista: o.dataPrevista,
        dataRealizada: o.dataRealizada,
        quantidadeRealizada: o.quantidadeRealizada, observacoes: o.observacoes,
        metaQuantidade: o.metaQuantidade, exigeAtividade: o.exigeAtividade,
        minimoAtividadesVerificadas: o.minimoAtividadesVerificadas,
        minimoEvidenciasVerificadas: o.minimoEvidenciasVerificadas,
        minimoFotos: o.minimoFotos, minimoRelatorios: o.minimoRelatorios,
        minimoEvidenciasLivres: o.minimoEvidenciasLivres, pesoPeriodo: o.pesoPeriodo,
        evidenciaExigida: o.evidenciaExigida, permiteEncerramentoExcepcional: o.permiteEncerramentoExcepcional,
      };

      if (dto.status !== undefined) throw new ConflictException('A situação é controlada pelo fluxo de atividades, conclusão e reabertura; não pode ser editada diretamente');
      if (dto.metaQuantidade !== undefined && o.metaQuantidade != null) {
        const r = await resumoMedicao(m,o);
        const comprometida = r.quantidadeRegistrada;
        if (Number(dto.metaQuantidade) <= 0 || Number(dto.metaQuantidade) < comprometida)
          throw new ConflictException('Nova meta não pode ser inferior à quantidade já registrada, incluindo medições pendentes e lançamentos manuais');
        o.metaQuantidade = dto.metaQuantidade;
        // A meta atingida habilita a solicitação, não aprova nem bloqueia atividades automaticamente.
      }
      if (o.metaQuantidade != null && dto.quantidadeRealizada !== undefined) throw new ConflictException('Quantidade executada é calculada a partir das atividades; edite a atividade vinculada');
      if (dto.exigeAtividade !== undefined) { o.exigeAtividade = dto.exigeAtividade; o.minimoAtividadesVerificadas = dto.exigeAtividade ? 1 : 0; }
      if (dto.minimoAtividadesVerificadas !== undefined) {
        o.minimoAtividadesVerificadas = dto.minimoAtividadesVerificadas;
        o.exigeAtividade = dto.minimoAtividadesVerificadas > 0;
      }
      if (dto.evidenciaExigida !== undefined) {
        o.evidenciaExigida = dto.evidenciaExigida;
        if (dto.minimoEvidenciasVerificadas === undefined)
          o.minimoEvidenciasVerificadas = dto.evidenciaExigida === 'AMBOS' ? 2 : dto.evidenciaExigida === 'NENHUMA' ? 0 : 1;
      }
      if (dto.minimoEvidenciasVerificadas !== undefined) o.minimoEvidenciasVerificadas = dto.minimoEvidenciasVerificadas;
      if (dto.minimoFotos !== undefined) o.minimoFotos = dto.minimoFotos;
      if (dto.minimoRelatorios !== undefined) o.minimoRelatorios = dto.minimoRelatorios;
      if (dto.minimoEvidenciasLivres !== undefined) o.minimoEvidenciasLivres = dto.minimoEvidenciasLivres;
      if (dto.pesoPeriodo !== undefined) o.pesoPeriodo = dto.pesoPeriodo;
      if (dto.permiteEncerramentoExcepcional !== undefined) o.permiteEncerramentoExcepcional = dto.permiteEncerramentoExcepcional;
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
          quantidadeRealizada: salva.quantidadeRealizada, metaQuantidade: salva.metaQuantidade, exigeAtividade: salva.exigeAtividade,
          minimoAtividadesVerificadas: salva.minimoAtividadesVerificadas,
          minimoEvidenciasVerificadas: salva.minimoEvidenciasVerificadas,
          minimoFotos: salva.minimoFotos, minimoRelatorios: salva.minimoRelatorios,
          minimoEvidenciasLivres: salva.minimoEvidenciasLivres, pesoPeriodo: salva.pesoPeriodo,
          evidenciaExigida: salva.evidenciaExigida, permiteEncerramentoExcepcional: salva.permiteEncerramentoExcepcional,
        },
      });

      await this.recalcularEstado(m,salva,ator);
      return salva;
    });
  }
  async listarLancamentos(contratoId: string, id: string) {
    const ocorrencia = await this.ocorrenciasRepo.findOneBy({ id, contratoId });
    if (!ocorrencia) throw new NotFoundException('Ocorrência não encontrada');
    return this.dataSource.query(`SELECT id,quantidade::text AS quantidade,justificativa,
      criado_em AS "criadoEm",criado_por AS "criadoPor",alterado_em AS "alteradoEm",alterado_por AS "alteradoPor"
      FROM ocorrencia_lancamentos WHERE contrato_id=$1 AND ocorrencia_id=$2
      ORDER BY criado_em,id LIMIT 200`,[contratoId,id]);
  }

  /** Cada POST recebe um UUID de operação. Reenvio idêntico não soma novamente. */
  async registrarLancamento(contratoId: string, id: string, operacaoId: string, quantidade: string,
    justificativa: string | undefined, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m,contratoId,ator,'visualizar');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await m.findOneBy(PermissaoContrato,{contratoId,usuarioId:ator.id});
        if (!vinculo || !permissoesEfetivas(ator.perfil,Boolean(vinculo.podeEditar),vinculo.permissoesDetalhadas).registrarExecucaoOcorrencia)
          throw new ForbiddenException('Sem permissão para registrar execução manual');
      }
      await this.bloquearContratoAberto(m,contratoId);
      const o = await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null)
        throw new BadRequestException('Somente ocorrências com meta quantitativa aceitam lançamentos');
      const existente: Array<{quantidade:string;justificativa:string|null}> = await m.query(
        `SELECT quantidade::text,justificativa FROM ocorrencia_lancamentos WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3`,
        [operacaoId,id,contratoId]);
      if (existente.length) {
        if (Number(existente[0].quantidade)===Number(quantidade) && (existente[0].justificativa ?? '')===(justificativa??''))
          return {id:operacaoId,repetido:true};
        throw new ConflictException('O identificador deste lançamento já foi utilizado com outros dados');
      }
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para lançar quantidade');
      const antes=await resumoMedicao(m,o);
      await m.query(`INSERT INTO ocorrencia_lancamentos(id,ocorrencia_id,contrato_id,quantidade,justificativa,criado_por)
        VALUES ($1,$2,$3,$4,$5,$6)`,[operacaoId,id,contratoId,quantidade,justificativa?.trim()||null,ator.id]);
      const depois=await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{quantidadeExecutada:antes.quantidadeExecutada},
        dadosPosteriores:{lancamentoId:operacaoId,quantidadeAdicionada:quantidade,quantidadeExecutada:depois.quantidadeExecutada,
          justificativa:justificativa?.trim()??null},
      });
      return {id:operacaoId,quantidadeExecutada:depois.quantidadeExecutada,restante:depois.quantidadeRestante};
    });
  }

  async corrigirLancamento(contratoId: string,id: string,lancamentoId: string,
    quantidade:string,justificativa:string,ator:UsuarioAutenticado) {
    if (justificativa.trim().length<15 || justificativa.trim().length>200)
      throw new BadRequestException('Explique a correção em 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await this.validarPermissaoContrato(m,contratoId,ator,'visualizar');
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
        const vinculo = await m.findOneBy(PermissaoContrato,{contratoId,usuarioId:ator.id});
        if (!vinculo || !permissoesEfetivas(ator.perfil,Boolean(vinculo.podeEditar),vinculo.permissoesDetalhadas).corrigirExecucaoOcorrencia)
          throw new ForbiddenException('Sem permissão para corrigir lançamentos manuais');
      }
      await this.bloquearContratoAberto(m,contratoId);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para corrigir um lançamento');
      const anteriores:Array<{quantidade:string}> = await m.query(
        `SELECT quantidade::text AS quantidade FROM ocorrencia_lancamentos WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3 FOR UPDATE`,
        [lancamentoId,id,contratoId]);
      if (!anteriores.length) throw new NotFoundException('Lançamento não encontrado');
      const antiga=anteriores[0].quantidade;
      await m.query(`UPDATE ocorrencia_lancamentos SET quantidade=$4,justificativa=$5,alterado_por=$6,alterado_em=now()
        WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3`,[lancamentoId,id,contratoId,quantidade,justificativa.trim(),ator.id]);
      const depois=await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{lancamentoId,quantidade:antiga},
        dadosPosteriores:{lancamentoId,quantidade,justificativa:justificativa.trim(),quantidadeExecutada:depois.quantidadeExecutada,
          tipo:'CORRECAO_LANCAMENTO'},
      });
      return {id:lancamentoId,quantidadeAnterior:antiga,quantidade,restante:depois.quantidadeRestante};
    });
  }

  async listarComprovantes(contratoId:string,id:string) {
    const o=await this.ocorrenciasRepo.findOneBy({id,contratoId});
    if (!o) throw new NotFoundException('Ocorrência não encontrada');
    const linhas:Array<{id:string;nomeOriginal:string;tipoEvidencia:string;vinculado:boolean;status:string}> =
      await this.dataSource.query(`SELECT c.id,c.nome_original AS "nomeOriginal",ev.tipo_evidencia AS "tipoEvidencia",
        c.status,(oc.ocorrencia_id IS NOT NULL) AS vinculado
        FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        LEFT JOIN ocorrencia_comprovantes oc ON oc.ocorrencia_id=$2 AND oc.comprovante_id=c.id AND oc.contrato_id=$1
        WHERE c.contrato_id=$1 AND c.entregavel_id=$3 AND
          (oc.ocorrencia_id IS NOT NULL OR (c.status='VERIFICADA' AND ev.arquivado_em IS NULL
            AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia nova WHERE nova.evidencia_esperada_id=c.evidencia_esperada_id
              AND (nova.criado_em,nova.id) > (c.criado_em,c.id))))
        ORDER BY c.criado_em DESC LIMIT 100`,[contratoId,id,o.entregavelId]);
    return {vinculadas:linhas.filter(l=>l.vinculado),disponiveis:linhas.filter(l=>!l.vinculado)};
  }
  async vincularComprovante(contratoId:string,id:string,comprovanteId:string,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await this.validarPermissaoContrato(m,contratoId,ator,'vincularEvidencia');
      await this.bloquearContratoAberto(m,contratoId);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para alterar evidências vinculadas');
      const validos:Array<{id:string}>=await m.query(`SELECT c.id FROM comprovantes_evidencia c
        JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
        WHERE c.id=$1 AND c.contrato_id=$2 AND c.entregavel_id=$3 AND c.status='VERIFICADA'
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id
            AND (n.criado_em,n.id) > (c.criado_em,c.id))`,[comprovanteId,contratoId,o.entregavelId]);
      if (!validos.length) throw new ConflictException('Somente comprovantes verificados e atuais do mesmo entregável podem ser vinculados');
      const inseridos:Array<{comprovante_id:string}>=await m.query(`INSERT INTO ocorrencia_comprovantes
        (ocorrencia_id,comprovante_id,contrato_id,vinculado_por) VALUES ($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING comprovante_id`,[id,comprovanteId,contratoId,ator.id]);
      if (!inseridos.length) throw new ConflictException('Comprovante já vinculado');
      await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EDITADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{comprovanteId:null},dadosPosteriores:{comprovanteId,operacao:'VINCULAR_EVIDENCIA'},
      });
      return {vinculado:true};
    });
  }
  async desvincularComprovante(contratoId:string,id:string,comprovanteId:string,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await this.validarPermissaoContrato(m,contratoId,ator,'vincularEvidencia');
      await this.bloquearContratoAberto(m,contratoId);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o) throw new NotFoundException('Ocorrência não encontrada');
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para alterar evidências vinculadas');
      const removidos:Array<{comprovante_id:string}>=await m.query(`DELETE FROM ocorrencia_comprovantes
        WHERE ocorrencia_id=$1 AND comprovante_id=$2 AND contrato_id=$3 RETURNING comprovante_id`,[id,comprovanteId,contratoId]);
      if (!removidos.length) throw new NotFoundException('Vínculo não encontrado');
      await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EDITADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{comprovanteId},dadosPosteriores:{comprovanteId:null,operacao:'DESVINCULAR_EVIDENCIA'},
      });
      return {desvinculado:true};
    });
  }

  async historico(contratoId:string,id:string) {
    const o=await this.ocorrenciasRepo.findOneBy({id,contratoId});
    if (!o) throw new NotFoundException('Ocorrência não encontrada');
    // Apenas eventos dessa ocorrência, já associados ao contrato persistido.
    return this.dataSource.query(`SELECT a.id, a.acao, a.registrado_em AS "registradoEm",
      a.ator_supertokens_user_id AS "ator", COALESCE(NULLIF(u.nome, ''), u.email) AS "autorNome",
      a.dados_anteriores AS "dadosAnteriores", a.dados_posteriores AS "dadosPosteriores"
      FROM eventos_auditoria a
      LEFT JOIN usuarios u ON u.supertokens_user_id = a.ator_supertokens_user_id
      WHERE a.contrato_id=$1 AND a.entidade_tipo='OCORRENCIA' AND a.entidade_id=$2
      ORDER BY a.registrado_em DESC,a.id DESC LIMIT 150`,[contratoId,id]);
  }

}

/** Não permitir combinações impossíveis: "ambos" requer pelo menos um de cada tipo. */
function validarRequisitosMinimos(minimo: number | undefined, formato: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS' | undefined,
  individuais?: { minimoFotos?:number|null; minimoRelatorios?:number|null; minimoEvidenciasLivres?:number|null }) {
  if (individuais && [individuais.minimoFotos, individuais.minimoRelatorios, individuais.minimoEvidenciasLivres].some(n=>n!=null)) {
    const soma = (individuais.minimoFotos??0)+(individuais.minimoRelatorios??0)+(individuais.minimoEvidenciasLivres??0);
    if (soma>99) throw new BadRequestException('O total das evidências obrigatórias não pode ultrapassar 99.');
    if (minimo !== undefined && minimo !== soma)
      throw new BadRequestException('O total de evidências precisa corresponder à soma de fotos, relatórios e evidências livres.');
    return;
  }
  if (minimo === undefined) return;
  if (formato === 'NENHUMA' && minimo > 0)
    throw new BadRequestException('Escolha o formato das evidências antes de exigir uma quantidade.');
  if (formato === 'AMBOS' && minimo === 1)
    throw new BadRequestException('Para fotografia e relatório, exija pelo menos dois comprovantes, um de cada formato.');
}
