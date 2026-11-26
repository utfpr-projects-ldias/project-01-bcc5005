import { exigirRegistroMetaEditavel } from '../metas-marco/proteger-registro-meta.js';
import { MetaMarco, VinculoMetaMarco } from '../metas-marco/meta-marco.entity.js';
import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import type { CacheParcelasOcorrencia } from '../execucao/parcelas-execucao.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { avaliarAgendaRecorrente } from './avaliar-agenda-recorrente.js';
import { milesimos, quantidadeDecimal } from '../common/quantidade-exata.js';
import { protegerReferenciaManual } from '../execucao/proteger-referencia-execucao.js';
import { iniciarHierarquiaOperacional } from '../execucao/inicio-operacional.js';
import { estadoOcorrenciaReconhecida, indicadoresPrazo } from '../entregaveis/estado-operacional-entregavel.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { chavesDefinidas } from '../common/chaves-definidas.js';
import { hojeCivil } from '../common/data-civil.js';

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
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';
import { tituloOcorrenciaRecorrente } from './titulo-recorrente.js';
import { OrigemOcorrencia } from './origem-ocorrencia.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import { resumoMedicao, proximoStatusAutomatico, conclusaoTemporalPermitida, quantidadeLegadaParaDecisao, medicaoLegadaReconhecida, type ResumoMedicao } from './medicao-ocorrencia.js';
import type { CriarOcorrenciaManualDto } from './dto/criar-ocorrencia-manual.dto.js';
import type { AtualizarOcorrenciaDto } from './dto/atualizar-ocorrencia.dto.js';

function fimPeriodo(dataStr: string, dias: number, meses = 0): Date {
  const d = new Date(`${dataStr}T00:00:00Z`);
  if (meses) d.setUTCMonth(d.getUTCMonth() + meses);
  d.setUTCDate(d.getUTCDate() + dias);
  return d;
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || valor.startsWith('0000-')) return false;
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
    let fim: Date;
    switch (periodicidade) {
      case PeriodicidadeEntregavel.DIARIA: fim = fimPeriodo(atual, 0); break;
      case PeriodicidadeEntregavel.SEMANAL: fim = fimPeriodo(atual, 6); break;
      case PeriodicidadeEntregavel.MENSAL: fim = fimPeriodo(atual, -1, 1); break;
      case PeriodicidadeEntregavel.TRIMESTRAL: fim = fimPeriodo(atual, -1, 3); break;
      case PeriodicidadeEntregavel.SEMESTRAL: fim = fimPeriodo(atual, -1, 6); break;
      case PeriodicidadeEntregavel.ANUAL: fim = fimPeriodo(atual, -1, 12); break;
      default: throw new BadRequestException('Periodicidade não homologada para geração automática');
    }
    const proximo = fim.toISOString().split('T')[0];
    if (fim.getTime() > Date.parse(`${termino}T00:00:00Z`)) rejeitarParcial(atual, proximo);

    periodos.push({
      inicio: atual,
      fim: proximo,
      titulo: `Ocorrência #${contador} (${atual} a ${proximo})`,
    });

    if (proximo === termino) break;
    contador++;
    atual = fimPeriodo(proximo, 1).toISOString().slice(0, 10);

  }
  return periodos;
}

export function validarDadosOcorrencia(dto: { titulo?: string | null; periodoInicio?: string | null; periodoFim?: string | null; dataPrevista?: string | null; dataRealizada?: string | null; quantidadeRealizada?: string | null; status?: StatusOcorrencia | null }) {
  for (const v of [dto.periodoInicio, dto.periodoFim, dto.dataPrevista, dto.dataRealizada]) {
    if (v == null) continue;
    const d = new Date(`${v}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== v) throw new BadRequestException('Data civil inválida');
  }
  if (dto.dataRealizada && dto.dataRealizada > hojeCivil()) throw new BadRequestException('A data realizada não pode ser futura.');
  if (dto.periodoInicio && dto.periodoFim && dto.periodoInicio > dto.periodoFim) throw new BadRequestException('Período invertido');
  if (dto.titulo !== undefined && (typeof dto.titulo !== 'string' || !dto.titulo.trim())) throw new BadRequestException('Título obrigatório');
  if (dto.quantidadeRealizada != null && !/^\d{1,15}(?:\.\d{1,3})?$/.test(dto.quantidadeRealizada)) throw new BadRequestException('Quantidade decimal inválida');
  if (dto.status === null) throw new BadRequestException('Status não pode ser nulo');
}

/** Datas previstas são civis e devem respeitar os limites conhecidos dos pais.
 * Datas efetivas permanecem históricas; não são truncadas à vigência. */
export function validarVigenciaOcorrencia(datas: readonly (string|null|undefined)[], contrato: Pick<Contrato,'inicioVigencia'|'terminoVigencia'>, entregavel: Pick<Entregavel,'inicioPrevisto'|'terminoPrevisto'>) {
  for(const data of datas) if(data && ((contrato.inicioVigencia && data<contrato.inicioVigencia) ||
      (contrato.terminoVigencia && data>contrato.terminoVigencia) || (entregavel.inicioPrevisto && data<entregavel.inicioPrevisto) ||
      (entregavel.terminoPrevisto && data>entregavel.terminoPrevisto)))
    throw new BadRequestException('Data prevista da ocorrência fora da vigência do contrato ou do entregável.');
}

const chavesExigencias = ['exigeAtividade','minimoAtividadesVerificadas','minimoEvidenciasVerificadas','minimoFotos','minimoRelatorios','minimoEvidenciasLivres','evidenciaExigida','permiteEncerramentoExcepcional'];
const metaPositiva = (valor: string | null | undefined) => typeof valor==='string' && /^\d{1,15}(?:\.\d{1,3})?$/.test(valor) && milesimos(valor)>0n;

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

  // Mesmo lock raiz da HU08: uma mutação não pode atravessar uma conclusão
  // concorrente do contrato, da etapa ou do entregável.
  private async bloquearContratoAberto(m: EntityManager, contratoId: string, documental = false) {
    const contrato = await m.findOne(Contrato, {
      where: { id: contratoId }, lock: { mode: 'pessimistic_write' },
    });
    if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || ![...FASES_OPERACIONAIS_CONTRATO, ...(documental ? ['CONCLUIDO_PARCIALMENTE'] : [])].includes(contrato.status)) {
      throw new ConflictException('Reabra ou retome o contrato antes de alterar ocorrências');
    }
    return contrato;
  }

  private async exigirEntregavelAberto(m: EntityManager, entregavel: Entregavel, regularizacao = false) {
    if (entregavel.arquivadoEm || entregavel.regularizacaoDocumentalSolicitada || (['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? '') || (entregavel.statusExecucao === 'CONCLUIDO_PARCIALMENTE' && !regularizacao))) {
      throw new ConflictException('Reabra o entregável antes de alterar ocorrências');
    }
    const etapa = await m.findOne(Etapa, { where: { id: entregavel.etapaId, contratoId: entregavel.contratoId } });
    if (!etapa || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || etapa.arquivadoEm || (etapa.status === 'CONCLUIDA' || (etapa.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao)) || etapa.status === 'ENCERRADA' || etapa.status === 'FINALIZADA') {
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
      modoRegistro?: 'DESCRITIVO' | 'QUANTITATIVO'; metaQuantidade?: string; recuperarFaltantes?: boolean;
      evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?: boolean},
  ) {
    // Não simular regeneração de períodos futuros: depende de versão/impacto
    // e confirmação pela rota dedicada de replanejamento.
    if (forcar) {
      throw new BadRequestException('Use a rota de replanejamento com análise de impacto e confirmação');
    }
    return this.dataSource.transaction(async (m) => {
      await exigirPermissaoTransacional(m,contratoId,ator,'configurarAgendaOcorrencias');
      if (requisitos && chavesExigencias.some(k=>Object.prototype.hasOwnProperty.call(requisitos,k) && (requisitos as Record<string,unknown>)[k]!==undefined))
        await exigirPermissaoTransacional(m,contratoId,ator,'editarExigenciasOcorrencia');
      if (requisitos?.metaQuantidade != null) await exigirPermissaoTransacional(m,contratoId,ator,'editarMetaOcorrencia');
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
      // Após replanejar, a configuração vigente (não o fim original do entregável)
      // determina a grade. Uma geração comum não pode recriar períodos substituídos.
      const configAgenda = entregavel.agendaInicioFuturo ? await m.findOneBy(ConfiguracaoOcorrencias, { entregavelId, contratoId }) : null;
      if (entregavel.agendaInicioFuturo && !configAgenda?.terminoPrevisto) throw new ConflictException('Agenda replanejada sem configuração vigente. Regularize o planejamento.');
      const fimAgenda = configAgenda?.terminoPrevisto ?? entregavel.terminoPrevisto;
      if (inicioAgenda < contrato.inicioVigencia || fimAgenda > contrato.terminoVigencia || fimAgenda > entregavel.terminoPrevisto) {
        throw new ConflictException('A agenda deve estar contida na vigência do contrato; revise o planejamento');
      }
      const periodos = calcularPeriodosRecorrentes(
        inicioAgenda,
        fimAgenda,
        entregavel.periodicidade,
      );
      const repo = m.getRepository(Ocorrencia);
      const existentes = await repo.find({where:{entregavelId,contratoId,origem:OrigemOcorrencia.RECORRENTE,substituidaEm:IsNull()}});
      const chave = (inicio:string|null,fim:string|null)=>`${inicio}/${fim}`;
      const porPeriodo = new Map(existentes.map(o=>[chave(o.periodoInicio,o.periodoFim),o]));
      const grade = new Set(periodos.map(p=>chave(p.inicio,p.fim)));
      const atuais = existentes.filter(o=>!o.periodoFim || o.periodoFim>=inicioAgenda);
      if (requisitos?.recuperarFaltantes && !existentes.length) throw new ConflictException('Não há agenda existente para recuperar. Configure a geração inicial.');
      if (porPeriodo.size!==existentes.length || atuais.some(o=>!grade.has(chave(o.periodoInicio,o.periodoFim))))
        throw new ConflictException('A agenda contém períodos incompatíveis. Use o replanejamento com confirmação.');
      const faltantes = periodos.filter(p=>!porPeriodo.has(chave(p.inicio,p.fim)));
      const proposta = [...existentes,...faltantes.map(p=>({periodoInicio:p.inicio,periodoFim:p.fim,status:StatusOcorrencia.NAO_INICIADO}))];
      const avaliacao = avaliarAgendaRecorrente(proposta,periodos,inicioAgenda,entregavel.inicioPrevisto,entregavel.terminoPrevisto);
      if (!avaliacao.completa || (entregavel.agendaInicioFuturo && faltantes.length && !requisitos?.recuperarFaltantes))
        throw new ConflictException('A agenda vigente está incompleta ou inconsistente. Use o replanejamento com confirmação.');
      if (requisitos?.metaQuantidade != null && (!metaPositiva(requisitos.metaQuantidade) || atuais.some(o=>milesimos(o.metaQuantidade)!==milesimos(requisitos.metaQuantidade))))
        throw new ConflictException('A meta informada não altera períodos existentes. Edite a meta individualmente.');
      if (requisitos?.modoRegistro && atuais.some(o=>o.modoRegistro!==requisitos.modoRegistro))
        throw new ConflictException('A modalidade informada diverge de períodos existentes.');
      const exigenciasSolicitadas = chavesExigencias.filter(k=>requisitos && (requisitos as Record<string,unknown>)[k]!==undefined);
      if (atuais.some(o=>exigenciasSolicitadas.some(k=>(o as unknown as Record<string,unknown>)[k] !== (requisitos as Record<string,unknown>)[k])))
        throw new ConflictException('As exigências informadas não alteram períodos existentes. Use a edição de exigências.');
      const modoPlanejado = entregavel.configuracaoPeriodicidade?.modoRegistro;
      if (modoPlanejado && requisitos?.modoRegistro && modoPlanejado !== requisitos.modoRegistro) throw new BadRequestException('A medição deve respeitar o planejamento do entregável.');
      if (requisitos?.metaQuantidade != null && modoPlanejado==='DESCRITIVO') throw new BadRequestException('Registro descritivo não aceita meta quantitativa.');
      if (!faltantes.length) return {entregavelId,periodosPrevistos:avaliacao.total,novasGeradas:0};
      if (!modoPlanejado) throw new BadRequestException('Defina a modalidade recorrente no planejamento do entregável antes de gerar ocorrências.');
      const modoGeracao = modoPlanejado;
      if (existentes.some(o=>o.pesoPeriodo!=null)) throw new ConflictException('Regularize a distribuição de pesos pela revisão da agenda antes de gerar períodos adicionais.');
      // Recuperação é uma operação distinta: replica apenas parâmetros homogêneos
      // da grade vigente. Não altera registros, não inventa pesos nem metas.
      const modelo = requisitos?.recuperarFaltantes ? atuais[0] : undefined;
      if (requisitos?.recuperarFaltantes && (!modelo || exigenciasSolicitadas.length || requisitos.metaQuantidade != null || requisitos.modoRegistro != null))
        throw new ConflictException('Recuperação exige períodos de referência da grade vigente, sem alteração de critérios ou metas. Use a revisão da agenda.');
      const metaGeracao = modelo ? modelo.metaQuantidade : requisitos?.metaQuantidade;
      if (modoGeracao === 'QUANTITATIVO' && (!entregavel.unidadeMedida || !metaPositiva(metaGeracao)))
        throw new BadRequestException('Recorrente quantitativo requer unidade do entregável e meta positiva por ocorrência.');
      const criteriosGeracao = modelo ? {
        exigeAtividade: modelo.exigeAtividade, minimoAtividadesVerificadas: modelo.minimoAtividadesVerificadas,
        evidenciaExigida: modelo.evidenciaExigida, minimoEvidenciasVerificadas: modelo.minimoEvidenciasVerificadas,
        minimoFotos: modelo.minimoFotos, minimoRelatorios: modelo.minimoRelatorios, minimoEvidenciasLivres: modelo.minimoEvidenciasLivres,
        permiteEncerramentoExcepcional: modelo.permiteEncerramentoExcepcional,
      } : {
        exigeAtividade: (requisitos?.minimoAtividadesVerificadas ?? 1)>0,
        minimoAtividadesVerificadas: requisitos?.minimoAtividadesVerificadas ?? 1,
        evidenciaExigida: requisitos?.evidenciaExigida ?? 'NENHUMA',
        minimoEvidenciasVerificadas: minimoInicialEvidencias(requisitos),
        minimoFotos: requisitos?.minimoFotos ?? null, minimoRelatorios: requisitos?.minimoRelatorios ?? null,
        minimoEvidenciasLivres: requisitos?.minimoEvidenciasLivres ?? null,
        permiteEncerramentoExcepcional: requisitos?.permiteEncerramentoExcepcional ?? true,
      };
      validarRequisitosMinimos(criteriosGeracao.minimoEvidenciasVerificadas, criteriosGeracao.evidenciaExigida, criteriosGeracao);
      if (atuais.some(o=>Object.entries(criteriosGeracao).some(([k,v])=>(o as unknown as Record<string,unknown>)[k]!==v) ||
          o.modoRegistro !== modoGeracao || (modoGeracao==='QUANTITATIVO' && milesimos(o.metaQuantidade)!==milesimos(metaGeracao))))
        throw new ConflictException('A agenda incompleta possui exigências ou metas diferentes. Regularize pela revisão da agenda.');
      let geradas = 0;
      for (const p of faltantes) {
        const nova = repo.create({
          entregavelId,
          contratoId,
          titulo: tituloOcorrenciaRecorrente(entregavel.nome, p.titulo),
          periodoInicio: p.inicio,
          periodoFim: p.fim,
          dataPrevista: p.fim,
          status: StatusOcorrencia.NAO_INICIADO,
          origem: OrigemOcorrencia.RECORRENTE,
          ...criteriosGeracao,
          modoRegistro: modoGeracao,
          metaQuantidade: modoGeracao === 'QUANTITATIVO' ? metaGeracao! : null,
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
            modoRegistro: salva.modoRegistro, metaQuantidade: salva.metaQuantidade,
            dataPrevista: salva.dataPrevista, exigeAtividade: salva.exigeAtividade,
            minimoFotos: salva.minimoFotos, minimoRelatorios: salva.minimoRelatorios,
            minimoEvidenciasLivres: salva.minimoEvidenciasLivres,
            permiteEncerramentoExcepcional: salva.permiteEncerramentoExcepcional,
          },
        });
      }

      return {
        entregavelId,
        periodosPrevistos: avaliacao.total,
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
      await exigirPermissaoTransacional(m,contratoId,ator,'criarOcorrencias');
      if (dto.metaQuantidade != null) await exigirPermissaoTransacional(m,contratoId,ator,'editarMetaOcorrencia');
      if (chavesExigencias.some(k=>Object.prototype.hasOwnProperty.call(dto,k) && (dto as unknown as Record<string,unknown>)[k]!==undefined))
        await exigirPermissaoTransacional(m,contratoId,ator,'editarExigenciasOcorrencia');
      const contrato = await this.bloquearContratoAberto(m, contratoId);
      const entregavel = await m
        .getRepository(Entregavel)
        .findOneBy({ id: entregavelId, contratoId });
      if (!entregavel)
        throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.exigirEntregavelAberto(m, entregavel);
      if(entregavel.quantidadeDiretaIntegrada)throw new ConflictException('Este entregável já possui medição direta por atividades ou evidências. Não misture fontes.');
      // RB-03: ocorrências descritivas são opcionais em entregáveis ÚNICOS.
      // A regra quantitativa abaixo continua exclusiva de entregáveis QUANTITATIVOS.
      if (entregavel.tipo === TipoEntregavel.RECORRENTE) {
        throw new BadRequestException('Em entregáveis recorrentes, use a geração da agenda; registre a descrição nas atividades vinculadas aos períodos');
      }

      const modoRegistro = dto.modoRegistro ?? ((dto.metaQuantidade != null || dto.quantidadeRealizada != null) ? 'QUANTITATIVO' : 'DESCRITIVO');
      if (modoRegistro === 'QUANTITATIVO' && entregavel.quantidadeRealizada != null && milesimos(entregavel.quantidadeRealizada) !== 0n) throw new ConflictException('Já existe quantidade declarada diretamente; concilie antes de detalhar por ocorrências');
      let metaMarco:MetaMarco|null=null;
      if(dto.metaMarcoId){
        await exigirPermissaoTransacional(m,contratoId,ator,'vincularMetasMarco');
        metaMarco=await m.findOne(MetaMarco,{where:{id:dto.metaMarcoId,contratoId,entregavelId,arquivadoEm:IsNull()},lock:{mode:'pessimistic_write'}});
        if(entregavel.tipo!==TipoEntregavel.MARCO||!metaMarco||metaMarco.estado!=='ABERTA')throw new ConflictException('Meta do Marco indisponível.');
        if(modoRegistro==='QUANTITATIVO'&&metaMarco.tipo!=='QUANTITATIVA')throw new BadRequestException('Meta descritiva não recebe ocorrência quantitativa.');
      }
      const quantitativaMarco=modoRegistro==='QUANTITATIVO'&&metaMarco?.tipo==='QUANTITATIVA';
      if (modoRegistro === 'QUANTITATIVO' && entregavel.tipo !== TipoEntregavel.QUANTITATIVO && !quantitativaMarco) throw new BadRequestException('Registro por quantidade exige entregável quantitativo');
      if (modoRegistro === 'DESCRITIVO' && entregavel.tipo === TipoEntregavel.QUANTITATIVO) throw new BadRequestException('Entregável quantitativo exige ocorrência com meta e unidade de medida; utilize as atividades para o relato do trabalho');
      if (modoRegistro === 'DESCRITIVO' && (dto.metaQuantidade != null || dto.quantidadeRealizada != null)) throw new BadRequestException('Ocorrência descritiva não recebe metas ou quantidades; descreva o trabalho nas atividades');
      if (modoRegistro === 'QUANTITATIVO' && !quantitativaMarco && (!entregavel.quantidadePrevista || !entregavel.unidadeMedida)) throw new BadRequestException('Informe a meta total e a unidade no Planejamento do entregável antes de cadastrar a medição');
      if (modoRegistro === 'QUANTITATIVO' && dto.metaQuantidade == null) throw new BadRequestException('Ocorrência por quantidade exige meta planejada');
      if (dto.quantidadeRealizada != null) throw new BadRequestException('Registre a quantidade realizada após criar a ocorrência, por lançamento autorizado.');
      if (dto.pesoPeriodo != null) throw new BadRequestException('Peso de período é exclusivo da agenda recorrente.');
      if (dto.metaQuantidade != null && !metaPositiva(dto.metaQuantidade)) throw new BadRequestException('Meta quantitativa deve ser maior que zero');
      if(modoRegistro==='QUANTITATIVO'&&dto.metaQuantidade!=null&&!quantitativaMarco){
        const [saldo]=await m.query(`SELECT (COALESCE(SUM(meta_quantidade),0)+$3::numeric <= $4::numeric) AS disponivel FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND substituida_em IS NULL`,[contratoId,entregavelId,dto.metaQuantidade,entregavel.quantidadePrevista]);
        if(saldo?.disponivel===false)throw new ConflictException('A meta desta ocorrência ultrapassa a quantidade disponível no entregável.');
      }
      if(entregavel.tipo==='CONTINUO'&&!(dto.dataPrevista??dto.periodoFim??dto.periodoInicio))throw new BadRequestException('Informe a data ou o período da ocorrência contínua.');
      validarDadosOcorrencia(dto);
      validarVigenciaOcorrencia([dto.periodoInicio,dto.periodoFim,dto.dataPrevista],contrato,entregavel);
      const repo = m.getRepository(Ocorrencia);
      const minimoEvidencias = minimoInicialEvidencias(dto);
      validarRequisitosMinimos(minimoEvidencias, dto.evidenciaExigida ?? 'NENHUMA', dto);
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
        ...(quantitativaMarco&&metaMarco?{metaMarcoOrigemId:metaMarco.id,unidadeMedidaMarco:metaMarco.unidadeMedida}:{}),
        quantidadeAprovada: null,
        observacoes: dto.observacoes?.trim() ?? null,
        origem: modoRegistro === 'DESCRITIVO' ? OrigemOcorrencia.MANUAL_DESCRITIVA : OrigemOcorrencia.MANUAL_QUANTITATIVA,
        status: StatusOcorrencia.NAO_INICIADO,
        exigeAtividade: (dto.minimoAtividadesVerificadas ?? (dto.exigeAtividade === false ? 0 : 1)) > 0,
        minimoAtividadesVerificadas: dto.minimoAtividadesVerificadas ?? (dto.exigeAtividade === false ? 0 : 1),
        evidenciaExigida: dto.evidenciaExigida ?? 'NENHUMA',
        minimoEvidenciasVerificadas: minimoEvidencias,
        minimoFotos: dto.minimoFotos ?? null,
        minimoRelatorios: dto.minimoRelatorios ?? null,
        minimoEvidenciasLivres: dto.minimoEvidenciasLivres ?? null,
        pesoPeriodo: dto.pesoPeriodo ?? null,
        permiteEncerramentoExcepcional: dto.permiteEncerramentoExcepcional ?? true,
      });

      const salva = await repo.save(nova);
      if(metaMarco){
        const vinculo=await m.save(VinculoMetaMarco,m.create(VinculoMetaMarco,{metaId:metaMarco.id,contratoId,ocorrenciaId:salva.id,status:'APROVADO',solicitadoPor:ator.id}));
        await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.META_MARCO_VINCULO_SOLICITADO,entidadeTipo:'ENTREGAVEL',entidadeId:entregavelId,dadosPosteriores:{metaId:metaMarco.id,vinculoId:vinculo.id,registroId:salva.id,tipo:'OCORRENCIA'}});
      }
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_CRIADA,
        entidadeTipo: 'OCORRENCIA',
        entidadeId: salva.id,
        dadosPosteriores: {
          titulo: salva.titulo,
          origem: salva.origem,
          quantidadeRealizada: salva.quantidadeRealizada,
          metaQuantidade: salva.metaQuantidade, periodoInicio: salva.periodoInicio,
          periodoFim: salva.periodoFim, dataPrevista: salva.dataPrevista, observacoes: salva.observacoes,
          modoRegistro: salva.modoRegistro, exigeAtividade: salva.exigeAtividade,
          permiteEncerramentoExcepcional: salva.permiteEncerramentoExcepcional,
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
  private async recalcularEstado(m: EntityManager, o: Ocorrencia, ator: UsuarioAutenticado, solicitarAutomaticamente = true): Promise<ResumoMedicao> {
    const r = await resumoMedicao(m, o);
    if ([StatusOcorrencia.CONCLUIDO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE,StatusOcorrencia.ENCERRADA,
      StatusOcorrencia.PENDENTE_ENCERRAMENTO,StatusOcorrencia.PENDENTE_CONCLUSAO,StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL].includes(o.status)) return r;
    const anterior = o.status;
    const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId: o.contratoId });
    if (!entregavel) throw new NotFoundException('Entregável da ocorrência indisponível');
    const calculado = proximoStatusAutomatico(o,r,
      conclusaoTemporalPermitida(entregavel.tipo, o.dataPrevista??o.periodoFim??o.periodoInicio)) as StatusOcorrencia;
    // Edições de planejamento são independentes (meta, exigências, peso). Não
    // congelar a ocorrência entre dois PATCHes do mesmo formulário.
    const proximo = !solicitarAutomaticamente && calculado === StatusOcorrencia.PENDENTE_CONCLUSAO
      ? StatusOcorrencia.EM_ANDAMENTO : calculado;
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

  async solicitarConclusao(contratoId: string, id: string, ator: UsuarioAutenticado, parcial = false) {
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'editarOcorrencias');
      const contrato = await this.bloquearContratoAberto(m, contratoId, !parcial);
      const o = await m.getRepository(Ocorrencia).findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado');
      const regularizacao = !parcial && o.status === StatusOcorrencia.CONCLUIDO_PARCIALMENTE;
      if (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao) throw new ConflictException('Somente regularização documental é permitida');
      await this.exigirEntregavelAberto(m, entregavel, regularizacao);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id,regularizacao);
      if (o.regularizacaoDocumentalSolicitada || (!regularizacao && ![StatusOcorrencia.NAO_INICIADO, StatusOcorrencia.EM_ANDAMENTO, StatusOcorrencia.EM_REVISAO].includes(o.status))) throw new ConflictException('Ocorrência já submetida à conclusão');
      if (!conclusaoTemporalPermitida(entregavel.tipo, o.dataPrevista??o.periodoFim??o.periodoInicio))
        throw new ConflictException('A conclusão de serviço contínuo somente pode ser solicitada após o término previsto');
      const r = await resumoMedicao(m,o);
      if (!r.metaAtingida) throw new ConflictException('Meta ou execução ainda não atingida. Confira as quantidades verificadas e os lançamentos.');
      if (!r.criteriosOperacionaisAtendidos) throw new ConflictException('Existem atividades ou requisitos operacionais pendentes.');
      if (parcial === r.documentacaoAtendida) throw new ConflictException(parcial ? 'Documentação completa: solicite conclusão integral.' : 'Documentação pendente: solicite conclusão parcial.');
      // A execução física não exige evidência por padrão. Só critérios configurados
      // explicitamente bloqueiam a solicitação, preservando RB-07/08 do PRD.
      const antes = { status: o.status, regularizacaoDocumentalSolicitada: Boolean(o.regularizacaoDocumentalSolicitada) };
      if (regularizacao) o.regularizacaoDocumentalSolicitada = true;
      else o.status = parcial ? StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL : StatusOcorrencia.PENDENTE_CONCLUSAO;
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id, dadosAnteriores: antes, dadosPosteriores: { status: salvo.status, regularizacaoDocumentalSolicitada: Boolean(salvo.regularizacaoDocumentalSolicitada) } });
      return salvo;
    });
  }

  async concluir(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'concluirOcorrencias');
      const contrato = await this.bloquearContratoAberto(m, contratoId, true);
      const o = await m.getRepository(Ocorrencia).findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const regularizacao = Boolean(o.regularizacaoDocumentalSolicitada && o.status === StatusOcorrencia.CONCLUIDO_PARCIALMENTE);
      if (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao) throw new ConflictException('Somente regularização documental é permitida');
      if (!regularizacao && ![StatusOcorrencia.PENDENTE_CONCLUSAO,StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL].includes(o.status)) throw new ConflictException('Somente ocorrências pendentes podem ser aprovadas');
      const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável da ocorrência indisponível');
      await this.exigirEntregavelAberto(m, entregavel, regularizacao);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id,regularizacao);
      if (!conclusaoTemporalPermitida(entregavel.tipo, o.dataPrevista??o.periodoFim??o.periodoInicio))
        throw new ConflictException('A ocorrência contínua só pode ser aprovada após o término previsto.');
      const r = await resumoMedicao(m,o);
      const parcial = o.status === StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL;
      if (!r.metaAtingida || !r.criteriosOperacionaisAtendidos || parcial === r.documentacaoAtendida) throw new ConflictException('A execução ou as exigências da ocorrência mudaram; reabra e revise antes da aprovação.');
      const quantidade = r.quantidadeExecutadaExata ?? quantidadeDecimal(milesimos(r.quantidadeExecutada));
      const antes = snapshotDecisaoOcorrencia(o);
      o.regularizacaoDocumentalSolicitada = false;
      o.status = parcial ? StatusOcorrencia.CONCLUIDO_PARCIALMENTE : StatusOcorrencia.CONCLUIDO;
      if (!regularizacao) {
        o.quantidadeAprovada = o.modoRegistro === 'QUANTITATIVO'
          ? (o.metaQuantidade == null ? quantidadeLegadaParaDecisao(o, r) : quantidade) : null;
        o.origemMedicaoAprovada = o.modoRegistro==='QUANTITATIVO'
          ? (o.metaQuantidade!=null || r.fontesQuantitativasRegistradas ? 'REGISTROS' : 'DECLARACAO') : null;
        o.concluidaEm = new Date(); o.concluidaPor = ator.id;
      } else if (o.modoRegistro === 'QUANTITATIVO' && milesimos(o.quantidadeAprovada) > milesimos(o.metaQuantidade==null?medicaoLegadaReconhecida(o,r):quantidade)) {
        throw new ConflictException('A medição física anteriormente aprovada não está mais disponível; solicite reabertura operacional.');
      }
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id, dadosAnteriores: antes, dadosPosteriores: snapshotDecisaoOcorrencia(salvo) });
      await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,o.entregavelId);
      return salvo;
    });
  }

  /** Encerramento administrativo: não aprova quantidades e não aumenta o progresso físico. */
  async solicitarEncerramento(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Justifique o encerramento com 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'editarOcorrencias');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.findOne(Ocorrencia, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (o && !o.permiteEncerramentoExcepcional) throw new ConflictException('Encerramento excepcional desabilitado nesta ocorrência');
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const e = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, e);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id);
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
        !(o.dataPrevista??o.periodoFim??o.periodoInicio) || hojeCivil() >= (o.dataPrevista??o.periodoFim??o.periodoInicio)!;
      validarEncerramentoOcorrencia(o, resumoAtual, prazoContinuoCumprido);
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
      await exigirPermissaoTransacional(m,contratoId,ator,'concluirOcorrencias');
      await this.bloquearContratoAberto(m, contratoId);
      const o = await m.findOne(Ocorrencia, { where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      if (o.status !== StatusOcorrencia.PENDENTE_ENCERRAMENTO)
        throw new ConflictException('A ocorrência não está aguardando encerramento');
      const e = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, e);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id);
      const medicao = await resumoMedicao(m, o);
      // A aprovação deve revalidar as mesmas condições da solicitação, dentro do lock.
      validarEncerramentoOcorrencia(o, medicao, conclusaoTemporalPermitida(e.tipo, o.dataPrevista??o.periodoFim??o.periodoInicio));
      const anterior = snapshotDecisaoOcorrencia(o);
      o.status = StatusOcorrencia.ENCERRADA;
      o.encerradaEm = new Date(); o.encerradaPor = ator.id;
      // Preserve a medição já reconhecida, sem aprovar declarações pendentes.
      if (o.modoRegistro === 'QUANTITATIVO') {
        // Encerrar nunca reconhece a declaração legada ainda não aprovada.
        o.quantidadeAprovada = (medicao.quantidadeExecutadaExata ?? quantidadeDecimal(milesimos(medicao.quantidadeExecutada)));
        o.origemMedicaoAprovada = 'REGISTROS';
      }
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id,
        dadosAnteriores: anterior, dadosPosteriores: { status: salvo.status,
          justificativa: o.motivoEncerramento, aprovadoPor: ator.id,
          quantidadeAprovada: salvo.quantidadeAprovada, encerradaEm: o.encerradaEm },
      });
      return salvo;
    });
  }

  async reabrir(contratoId: string, id: string, motivo: string, ator: UsuarioAutenticado) {
    if (motivo.trim().length < 15 || motivo.trim().length > 200) throw new BadRequestException('Justificativa de reabertura: 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'reabrirOcorrencias');
      const contrato = await this.bloquearContratoAberto(m, contratoId, true);
      const o = await m.getRepository(Ocorrencia).findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado');
      const regularizacao = Boolean(o.regularizacaoDocumentalSolicitada && o.status === StatusOcorrencia.CONCLUIDO_PARCIALMENTE);
      if (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao) throw new ConflictException('Somente cancelamento da regularização é permitido');
      await this.exigirEntregavelAberto(m, entregavel, regularizacao);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id,regularizacao);
      if (![StatusOcorrencia.PENDENTE_CONCLUSAO, StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL, StatusOcorrencia.CONCLUIDO, StatusOcorrencia.CONCLUIDO_PARCIALMENTE, StatusOcorrencia.PENDENTE_ENCERRAMENTO, StatusOcorrencia.ENCERRADA].includes(o.status)) throw new ConflictException('Somente ocorrências pendentes ou concluídas podem ser reabertas');
      const antes = snapshotDecisaoOcorrencia(o);
      if (regularizacao) o.regularizacaoDocumentalSolicitada = false;
      else {
        o.status = StatusOcorrencia.EM_REVISAO;
        o.quantidadeAprovada = null; o.motivoEncerramento = null; o.encerradaEm = null; o.encerradaPor = null;
        o.concluidaEm = null; o.concluidaPor = null;
      }
      const salvo = await m.save(Ocorrencia, o);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id, dadosAnteriores: antes, dadosPosteriores: { ...snapshotDecisaoOcorrencia(salvo), justificativa: motivo.trim() } });
      return salvo;
    });
  }

  async listar(contratoId: string, entregavelId?: string) {
    return this.dataSource.transaction('REPEATABLE READ', async m => {
      const where: Record<string, any> = { contratoId };
      if (entregavelId) where.entregavelId = entregavelId;
      const itens = await m.getRepository(Ocorrencia).find({
        where,
        order: { dataPrevista: 'ASC', periodoInicio: 'ASC', id: 'ASC' },
      });
      if (!itens.length) return [];
      // A lista e o detalhe usam a mesma medição. Limite a concorrência de
      // consultas para agendas extensas, sem descartar períodos históricos.
      const resultado = [];
      const cacheParcelas:CacheParcelasOcorrencia=new Map();
      for (let inicio=0; inicio<itens.length; inicio+=16) {
        resultado.push(...await Promise.all(itens.slice(inicio,inicio+16).map(async o => {
          const prazo = indicadoresPrazo(o.dataPrevista ?? o.periodoFim, o.status, Boolean(o.substituidaEm), o.encerradaEm ? hojeCivil(o.encerradaEm) : o.dataRealizada ?? (o.concluidaEm ? hojeCivil(o.concluidaEm) : null));
          const r = await resumoMedicao(m,o,cacheParcelas);
          return Object.assign({}, o, r, prazo, { status:estadoOcorrenciaReconhecida(o,r), quantidadeExecutada: o.modoRegistro !== 'QUANTITATIVO' ? null : o.metaQuantidade == null ? medicaoLegadaReconhecida(o,r) : (r.quantidadeExecutadaExata ?? quantidadeDecimal(milesimos(r.quantidadeExecutada))) });
        })));
      }
      return resultado;
    });
  }

  async detalhar(contratoId: string, id: string) {
    return this.dataSource.transaction('REPEATABLE READ', async m => {
      const o = await m.getRepository(Ocorrencia).findOneBy({ id, contratoId });
      if (!o) throw new NotFoundException('Ocorrência não encontrada');
      const atividades = await m.createQueryBuilder(AtividadeEntity, 'atividade')
        .select(['atividade.id', 'atividade.titulo', 'atividade.status', 'atividade.excluidaEm', 'atividade.dataHora'])
        .where('atividade.contratoId = :contratoId', { contratoId })
        .andWhere(`(atividade.ocorrenciaId = :id OR EXISTS (
          SELECT 1 FROM "atividade_ocorrencias" ao WHERE ao."atividadeId"=atividade.id AND ao."ocorrenciaId"=:id
        ))`, { id }).orderBy('atividade.dataHora', 'DESC').getMany();
      const resumo = await resumoMedicao(m,o);
      return Object.assign({}, o, resumo, indicadoresPrazo(o.dataPrevista ?? o.periodoFim, o.status, Boolean(o.substituidaEm), o.encerradaEm ? hojeCivil(o.encerradaEm) : o.dataRealizada ?? (o.concluidaEm ? hojeCivil(o.concluidaEm) : null)), { status:estadoOcorrenciaReconhecida(o,resumo), quantidadeExecutada: o.modoRegistro !== 'QUANTITATIVO' ? null : o.metaQuantidade == null ? medicaoLegadaReconhecida(o,resumo) : (resumo.quantidadeExecutadaExata ?? quantidadeDecimal(milesimos(resumo.quantidadeExecutada))), atividades: atividades.filter(a => !a.excluidaEm) });
    });
  }

  /** Início explícito: não envolve aprovação nem alteração quantitativa.
   *  Transição idempotente com política da ocorrência e auditoria transacional. */
  /** Ativação temporal explícita e idempotente; nunca altera revisão, pendências ou finais.
   * A visualização pública não executa UPDATE em GET. */
  async iniciarPrevistas(contratoId:string,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await exigirPermissaoTransacional(m,contratoId,ator,'editarOcorrencias');
      await this.bloquearContratoAberto(m,contratoId);
      const hoje=hojeCivil();
      const repo = m.getRepository(Ocorrencia);
      let iniciadas = 0;
      let deslocamento = 0;
      const etapasAbertas = new Map<string, boolean>();
      const entregaveis = new Map<string,Entregavel|null>();
      const hierarquiasIniciadas = new Set<string>();
      // Avançar sobre TODOS os candidatos. Os iniciados desaparecem do filtro
      // NAO_INICIADO; por isso só os NÃO iniciados contam no próximo offset.
      // Sem esse ajuste, a paginação pularia linhas após cada lote.
      while (true) {
        const previstas = await repo.find({
          where: [
            { contratoId, status: StatusOcorrencia.NAO_INICIADO, substituidaEm: IsNull(), periodoInicio: LessThanOrEqual(hoje) },
            { contratoId, status: StatusOcorrencia.NAO_INICIADO, substituidaEm: IsNull(), periodoInicio: IsNull(), dataPrevista: LessThanOrEqual(hoje) },
          ],
          order: { periodoInicio: 'ASC', id: 'ASC' }, skip: deslocamento, take: 500,
          lock: { mode: 'pessimistic_write' },
        });
        let iniciadasNoLote = 0;
        for (const o of previstas) {
          const data = o.periodoInicio ?? o.dataPrevista;
          if (!data || data > hoje) continue;
          if (!entregaveis.has(o.entregavelId)) entregaveis.set(o.entregavelId,await m.findOneBy(Entregavel,{id:o.entregavelId,contratoId}));
          const e = entregaveis.get(o.entregavelId);
          if (!e || e.arquivadoEm || e.regularizacaoDocumentalSolicitada ||
              ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')) continue;
          let etapaAberta = etapasAbertas.get(e.etapaId);
          if (etapaAberta === undefined) {
            const etapa = await m.findOneBy(Etapa, { id: e.etapaId, contratoId });
            etapaAberta = Boolean(etapa && !etapa.arquivadoEm && !etapa.conclusaoSolicitadaEm &&
              !etapa.encerramentoSolicitadoEm &&
              !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(etapa.status));
            etapasAbertas.set(e.etapaId, etapaAberta);
          }
          if (!etapaAberta) continue;
          o.status = StatusOcorrencia.EM_ANDAMENTO;
          await m.save(Ocorrencia, o);
          await this.auditoria.registrarNaTransacao(m, ator, {
            acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: o.id,
            dadosAnteriores: { status: StatusOcorrencia.NAO_INICIADO },
            dadosPosteriores: { status: StatusOcorrencia.EM_ANDAMENTO, motivo: 'INICIO_AUTOMATICO_POR_DATA', data },
          });
          if (!hierarquiasIniciadas.has(o.entregavelId)) {
            await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,o.entregavelId);
            hierarquiasIniciadas.add(o.entregavelId);
          }
          iniciadas++;
          iniciadasNoLote++;
        }
        deslocamento += previstas.length - iniciadasNoLote;
        if (previstas.length < 500) break;
      }
      return { iniciadas, dataReferencia: hoje };
    });
  }
  async iniciar(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'editarOcorrencias');
      await this.bloquearContratoAberto(m, contratoId);
      const repo = m.getRepository(Ocorrencia);
      const o = await repo.findOne({ where: { id, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência indisponível');
      const entregavel = await m.getRepository(Entregavel).findOneBy({ id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado');
      await this.exigirEntregavelAberto(m, entregavel);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id);
      if (o.status === StatusOcorrencia.EM_ANDAMENTO) { await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,o.entregavelId); return o; } // sincroniza pai sem duplicar auditoria
      if (o.status !== StatusOcorrencia.NAO_INICIADO)
        throw new ConflictException('Somente uma ocorrência não iniciada pode ser colocada em andamento.');
      o.status = StatusOcorrencia.EM_ANDAMENTO;
      await repo.save(o);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO, entidadeTipo: 'OCORRENCIA', entidadeId: id,
        dadosAnteriores: { status: StatusOcorrencia.NAO_INICIADO }, dadosPosteriores: { status: StatusOcorrencia.EM_ANDAMENTO },
      });
      await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,o.entregavelId);
      return o;
    });
  }

  async atualizar(
    contratoId: string,
    id: string,
    dto: AtualizarOcorrenciaDto,
    ator: UsuarioAutenticado,
    escopo: 'GERAL' | 'EXIGENCIAS' | 'PESO' | 'META' = 'GERAL',
    justificativaMeta?: string,
  ) {
    return this.dataSource.transaction(async (m) => {
      if (escopo === 'GERAL') await exigirPermissaoTransacional(m,contratoId,ator,'editarOcorrencias');
      if (dto.quantidadeRealizada !== undefined || dto.dataRealizada !== undefined) await exigirPermissaoTransacional(m,contratoId,ator,'registrarExecucaoOcorrencia');
      if (escopo !== 'EXIGENCIAS' && chavesExigencias.some(chave => chavesDefinidas(dto).includes(chave)))
        await exigirPermissaoTransacional(m,contratoId,ator,'editarExigenciasOcorrencia');
      if (escopo !== 'PESO' && dto.pesoPeriodo !== undefined) await exigirPermissaoTransacional(m,contratoId,ator,'editarPesoOcorrencia');
      if (escopo !== 'GERAL') {
        const chavesPermitidas = escopo === 'PESO' ? ['pesoPeriodo'] : escopo === 'META' ? ['metaQuantidade'] : [
          'exigeAtividade','minimoAtividadesVerificadas','minimoEvidenciasVerificadas',
          'minimoFotos','minimoRelatorios','minimoEvidenciasLivres','evidenciaExigida','permiteEncerramentoExcepcional',
        ];
        if (chavesDefinidas(dto).some(chave => !chavesPermitidas.includes(chave)))
          throw new BadRequestException('Esta operação só pode alterar as propriedades autorizadas da ocorrência.');
        await exigirPermissaoTransacional(m, contratoId, ator, escopo === 'PESO' ? 'editarPesoOcorrencia' : escopo === 'META' ? 'editarMetaOcorrencia' : 'editarExigenciasOcorrencia');
      }
      const contrato = await this.bloquearContratoAberto(m, contratoId);
      const repo = m.getRepository(Ocorrencia);
      const o = await repo.findOne({
        where: { id, contratoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!o) throw new NotFoundException('Ocorrência não encontrada');
      if (o.substituidaEm) throw new ConflictException('Ocorrência histórica não pode ser editada');
      if ([StatusOcorrencia.PENDENTE_CONCLUSAO, StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL, StatusOcorrencia.CONCLUIDO, StatusOcorrencia.CONCLUIDO_PARCIALMENTE, StatusOcorrencia.PENDENTE_ENCERRAMENTO, StatusOcorrencia.ENCERRADA].includes(o.status)) throw new ConflictException('A ocorrência está pendente ou concluída; solicite reabertura autorizada antes de alterar');
      const entregavel = await m.getRepository(Entregavel).findOneBy({ id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável não encontrado neste contrato');
      await this.exigirEntregavelAberto(m, entregavel);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id);

      validarDadosOcorrencia(dto);
      if(entregavel.tipo==='CONTINUO'&&!(dto.dataPrevista===undefined?o.dataPrevista??o.periodoFim??o.periodoInicio:dto.dataPrevista??o.periodoFim??o.periodoInicio))throw new BadRequestException('A ocorrência contínua precisa manter uma data ou período.');
      if (dto.dataPrevista!==undefined && dto.dataPrevista!==o.dataPrevista) validarVigenciaOcorrencia([dto.dataPrevista],contrato,entregavel);
      // @IsOptional do class-validator aceita null; para mínimos, null não significa
      // "manter" nem "desativar": use zero explicitamente. Isso impede persistir
      // cotas nulas com um total calculado a partir do valor anterior.
      const minimos = ['minimoAtividadesVerificadas', 'minimoEvidenciasVerificadas',
        'minimoFotos', 'minimoRelatorios', 'minimoEvidenciasLivres'] as const;
      if (minimos.some(chave => dto[chave] === null))
        throw new BadRequestException('Mínimos não aceitam null; informe zero para retirar uma exigência.');
      if (dto.exigeAtividade === null || dto.evidenciaExigida === null || dto.permiteEncerramentoExcepcional === null)
        throw new BadRequestException('Exigências não aceitam null; informe um valor válido.');
      if (escopo !== 'META' && dto.metaQuantidade !== undefined)
        throw new BadRequestException('Para alterar a meta, utilize a operação específica de meta da ocorrência.');
      if (dto.pesoPeriodo !== undefined) {
        if (o.origem !== OrigemOcorrencia.RECORRENTE && dto.pesoPeriodo !== null) throw new BadRequestException('Peso de período é exclusivo da agenda recorrente.');
      }
      const novasCotas = {
        minimoFotos: dto.minimoFotos ?? o.minimoFotos,
        minimoRelatorios: dto.minimoRelatorios ?? o.minimoRelatorios,
        minimoEvidenciasLivres: dto.minimoEvidenciasLivres ?? o.minimoEvidenciasLivres,
      };
      const cotasAtivas = Object.values(novasCotas).some(v => v != null);
      const cotasAlteradas = ['minimoFotos','minimoRelatorios','minimoEvidenciasLivres'].some(
        chave => chavesDefinidas(dto).includes(chave));
      const totalDasCotas = (novasCotas.minimoFotos ?? 0) + (novasCotas.minimoRelatorios ?? 0) +
        (novasCotas.minimoEvidenciasLivres ?? 0);
      // O total não pode ficar desatualizado após um PATCH parcial de cota.
      // Se não for informado, deriva da soma das cotas já persistidas + alterações.
      const minimoEfetivo = dto.minimoEvidenciasVerificadas ??
        (cotasAtivas && (cotasAlteradas || dto.evidenciaExigida !== undefined) ? totalDasCotas :
         dto.evidenciaExigida !== undefined ?
           (dto.evidenciaExigida === 'AMBOS' ? 2 : dto.evidenciaExigida === 'NENHUMA' ? 0 : 1) :
           o.minimoEvidenciasVerificadas);
      validarRequisitosMinimos(minimoEfetivo, dto.evidenciaExigida ?? o.evidenciaExigida, novasCotas);
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
      if (escopo === 'META') {
        if (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null)
          throw new BadRequestException('Apenas uma ocorrência quantitativa com meta planejada pode ter a meta alterada.');
        if (typeof dto.metaQuantidade !== 'string' || !/^\d{1,15}(?:\.\d{1,3})?$/.test(dto.metaQuantidade) || milesimos(dto.metaQuantidade) <= 0n)
          throw new BadRequestException('Informe uma meta quantitativa positiva.');
        const resumo = await resumoMedicao(m, o);
        // Reduzir a meta não apaga o histórico da execução nem as medições já aprovadas.
        // Se abaixo do realizado, existe excedente; exige ciência explícita e justificativa auditável.
        if (milesimos(dto.metaQuantidade) < milesimos(resumo.quantidadeRegistradaExata ?? resumo.quantidadeRegistrada) &&
            (!justificativaMeta || justificativaMeta.trim().length < 15 || justificativaMeta.trim().length > 200))
          throw new ConflictException('A nova meta é inferior à execução registrada. Informe uma justificativa de 15 a 200 caracteres para preservar o excedente.');
        if(o.origem===OrigemOcorrencia.MANUAL_QUANTITATIVA&&!o.metaMarcoOrigemId&&milesimos(dto.metaQuantidade)>milesimos(o.metaQuantidade)){
          const [saldo]=await m.query(`SELECT (COALESCE(SUM(meta_quantidade),0)+$4::numeric <= $5::numeric) AS disponivel FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id<>$3 AND substituida_em IS NULL`,[contratoId,o.entregavelId,o.id,dto.metaQuantidade,entregavel.quantidadePrevista]);
          if(saldo?.disponivel===false)throw new ConflictException('A meta desta ocorrência ultrapassa a quantidade disponível no entregável.');
        }
        o.metaQuantidade = dto.metaQuantidade;
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
          o.minimoEvidenciasVerificadas = cotasAtivas ? totalDasCotas :
            dto.evidenciaExigida === 'AMBOS' ? 2 : dto.evidenciaExigida === 'NENHUMA' ? 0 : 1;
      }
      if (dto.minimoEvidenciasVerificadas !== undefined || (cotasAtivas && cotasAlteradas))
        o.minimoEvidenciasVerificadas = minimoEfetivo;
      if (dto.minimoFotos !== undefined) o.minimoFotos = dto.minimoFotos;
      if (dto.minimoRelatorios !== undefined) o.minimoRelatorios = dto.minimoRelatorios;
      if (dto.minimoEvidenciasLivres !== undefined) o.minimoEvidenciasLivres = dto.minimoEvidenciasLivres;
      if (dto.pesoPeriodo !== undefined) {
        if(o.origem===OrigemOcorrencia.RECORRENTE&&dto.pesoPeriodo!=null&&Number(dto.pesoPeriodo)>Number(o.pesoPeriodo??0)){
          const [saldo]=await m.query(`SELECT (COALESCE(SUM(peso_periodo),0)+$4::numeric <= 100) AS disponivel FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id<>$3 AND substituida_em IS NULL`,[contratoId,o.entregavelId,o.id,dto.pesoPeriodo]);
          if(saldo?.disponivel===false)throw new ConflictException('O peso ultrapassa o saldo disponível dos períodos.');
        }
        o.pesoPeriodo = dto.pesoPeriodo;
      }
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
          ...(escopo === 'META' ? { operacao: 'ALTERACAO_META_INDIVIDUAL', justificativa: justificativaMeta?.trim() ?? null } : {}),
        },
      });

      await this.recalcularEstado(m,salva,ator,false);
      if (antes.status === StatusOcorrencia.NAO_INICIADO && salva.status !== StatusOcorrencia.NAO_INICIADO)
        await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,salva.entregavelId);
      return salva;
    });
  }
  private validarDataLancamento(data: string) {
    const d = new Date(`${data}T00:00:00Z`);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==data || data>hojeCivil())
      throw new BadRequestException('Informe uma data de execução válida e não futura.');
  }
  private async exigirContextoLancamento(m:EntityManager,o:Ocorrencia) {
    await exigirRegistroMetaEditavel(m,o.contratoId,'OCORRENCIA',o.id);
    const c=await m.findOneBy(Contrato,{id:o.contratoId});
    if(!c||c.conclusaoSolicitadaEm)throw new ConflictException('O contrato aguarda decisão de conclusão.');
    const e=await m.findOneBy(Entregavel,{id:o.entregavelId,contratoId:o.contratoId});
    if(!e) throw new NotFoundException('Entregável não encontrado');
    await this.exigirEntregavelAberto(m,e);
  }
  async listarLancamentos(contratoId: string, id: string, offset = 0, limite?: number) {
    validarPaginacaoOcorrencia(offset, limite);
    const ocorrencia = await this.ocorrenciasRepo.findOneBy({ id, contratoId });
    if (!ocorrencia) throw new NotFoundException('Ocorrência não encontrada');
    return this.dataSource.query(`SELECT id,xmin::text AS versao,quantidade::text AS quantidade,justificativa,
      criado_em AS "criadoEm",criado_por AS "criadoPor",alterado_em AS "alteradoEm",alterado_por AS "alteradoPor",
      bloqueado_em AS "bloqueadoEm", bloqueado_por AS "bloqueadoPor",
      status_execucao AS "situacao", data_execucao::text AS "dataExecucao", observacao, decidido_por AS "decididoPor", decidido_em AS "decididoEm"
      FROM ocorrencia_lancamentos WHERE contrato_id=$1 AND ocorrencia_id=$2 AND excluido_em IS NULL
      ORDER BY criado_em,id LIMIT $3 OFFSET $4`,[contratoId,id,limite??null,offset]);
  }

  /** Cada POST recebe um UUID de operação. Reenvio idêntico não soma novamente. */
  async registrarLancamento(contratoId: string, id: string, operacaoId: string, quantidade: string,
    justificativa: string | undefined, ator: UsuarioAutenticado, data=hojeCivil(), observacao?:string) {
    this.validarDataLancamento(data);
    if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(quantidade) || milesimos(quantidade) <= 0n) throw new BadRequestException('Informe uma quantidade positiva com até três casas decimais.');
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'registrarExecucaoOcorrencia');
      const pedido = { quantidade: quantidadeDecimal(milesimos(quantidade)), justificativa: justificativa?.trim() || null, data, observacao: observacao?.trim() || null };
      const [existente] = await m.query(`SELECT quantidade::text,justificativa,excluido_em AS "excluidoEm",data_execucao::text AS data,observacao,criado_por AS autor,pedido_original AS pedido FROM ocorrencia_lancamentos WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3`,[operacaoId,id,contratoId]);
      if (existente) {
        const original = existente.pedido ?? {quantidade: quantidadeDecimal(milesimos(existente.quantidade)), justificativa: existente.justificativa, data: existente.data, observacao: existente.observacao};
        if (existente.autor===ator.id && Object.entries(pedido).every(([chave,valor])=>original[chave]===valor))
          return {id:operacaoId,repetido:true,excluido:Boolean(existente.excluidoEm)};
        throw new ConflictException('O identificador deste lançamento já foi utilizado com outros dados');
      }
      await m.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      // Uma requisição concorrente pode ter criado o UUID enquanto aguardávamos a raiz.
      const [repetido] = await m.query(`SELECT criado_por AS autor,pedido_original AS pedido,excluido_em AS "excluidoEm" FROM ocorrencia_lancamentos WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3`,[operacaoId,id,contratoId]);
      if (repetido) {
        if (repetido.autor===ator.id && repetido.pedido && Object.entries(pedido).every(([chave,valor])=>repetido.pedido[chave]===valor)) return {id:operacaoId,repetido:true,excluido:Boolean(repetido.excluidoEm)};
        throw new ConflictException('O identificador deste lançamento já foi utilizado com outros dados');
      }
      await this.bloquearContratoAberto(m,contratoId);
      const o = await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null)
        throw new BadRequestException('Somente ocorrências com meta quantitativa aceitam lançamentos');
      await this.exigirContextoLancamento(m,o);
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para lançar quantidade');
      const antes=await resumoMedicao(m,o);
      if (milesimos(antes.quantidadeRegistradaExata ?? antes.quantidadeRegistrada)+milesimos(quantidade)>milesimos(o.metaQuantidade)) throw new ConflictException('A quantidade excede o saldo disponível da ocorrência, incluindo registros pendentes.');
      // Permissão de aprovar não equivale a uma decisão de aprovação.
      const situacao='PENDENTE' as const;
      const inseridos = await m.query(`INSERT INTO ocorrencia_lancamentos(id,ocorrencia_id,contrato_id,quantidade,justificativa,criado_por,data_execucao,observacao,status_execucao,decidido_por,decidido_em,pedido_original)
        VALUES ($1::uuid,$2::uuid,$3::uuid,$4::numeric,$5::varchar,$6::uuid,$7::date,$8::varchar,$9::varchar,NULL,NULL,$10::jsonb) ON CONFLICT (id) DO NOTHING RETURNING id`,
        [operacaoId,id,contratoId,quantidade,justificativa?.trim()||null,ator.id,data,observacao?.trim()||null,situacao,JSON.stringify(pedido)]);
      if (!inseridos.length) throw new ConflictException('Identificador de lançamento já utilizado.');
      const depois=await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{quantidadeExecutada:antes.quantidadeExecutada},
        dadosPosteriores:{lancamentoId:operacaoId,quantidadeAdicionada:quantidade,quantidadeExecutada:depois.quantidadeExecutada,
          justificativa:justificativa?.trim()??null, situacao,data,observacao:observacao?.trim()??null},
      });
      return {id:operacaoId,situacao,quantidadeExecutada:depois.quantidadeExecutada,restante:depois.quantidadeDisponivel};
    });
  }

  async corrigirLancamento(contratoId: string,id: string,lancamentoId: string,
    quantidade:string,justificativa:string,ator:UsuarioAutenticado,data?:string,observacao?:string,versaoEsperada?:string) {
    if(data!==undefined)this.validarDataLancamento(data);
    if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(quantidade)) throw new BadRequestException('Informe uma quantidade não negativa com até três casas decimais.');
    if (justificativa.trim().length<15 || justificativa.trim().length>200)
      throw new BadRequestException('Explique a correção em 15 a 200 caracteres');
    return this.dataSource.transaction(async m => {
      await exigirPermissaoTransacional(m,contratoId,ator,'corrigirExecucaoOcorrencia');
      await this.bloquearContratoAberto(m,contratoId);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null) throw new ConflictException('A ocorrência não possui meta quantitativa vigente.');
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para corrigir um lançamento');
      await this.exigirContextoLancamento(m,o);
      const anteriores:Array<{quantidade:string;bloqueadoEm:string|null;situacao:string;data:string;observacao:string|null;versao?:string}> = await m.query(
        `SELECT xmin::text AS versao,quantidade::text AS quantidade,bloqueado_em AS "bloqueadoEm",status_execucao AS situacao,data_execucao::text AS data,observacao FROM ocorrencia_lancamentos WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3 AND excluido_em IS NULL FOR UPDATE`,
        [lancamentoId,id,contratoId]);
      if (!anteriores.length) throw new NotFoundException('Lançamento não encontrado');
      if (versaoEsperada!==undefined && anteriores[0].versao!==versaoEsperada) throw new ConflictException('O lançamento mudou. Atualize os dados antes de corrigir.');
      if (anteriores[0].bloqueadoEm) throw new ConflictException('Desbloqueie o lançamento antes de editar');
      if(anteriores[0].situacao==='APROVADO') {
        await exigirPermissaoTransacional(m,contratoId,ator,'corrigirExecucaoAprovada');
        await protegerReferenciaManual(m,contratoId,lancamentoId,'QUANTIDADE');
      }
      const antiga=anteriores[0].quantidade;
      const saldoAtual=await resumoMedicao(m,o);
      const reservada=['APROVADO','PENDENTE'].includes(anteriores[0].situacao)?milesimos(antiga):0n;
      const atual = milesimos(saldoAtual.quantidadeRegistradaExata ?? saldoAtual.quantidadeRegistrada);
      const novo = atual-reservada+milesimos(quantidade);
      if(o.metaQuantidade==null||!correcaoQuantidadePermitida(atual,novo,milesimos(o.metaQuantidade))) throw new ConflictException('A correção excede o saldo disponível da ocorrência.');
      await m.query(`UPDATE ocorrencia_lancamentos SET quantidade=$4,justificativa=$5,alterado_por=$6,alterado_em=now(),
        data_execucao=COALESCE($7::date,data_execucao),observacao=CASE WHEN $8::boolean THEN $9 ELSE observacao END,
        status_execucao='PENDENTE',decidido_por=NULL,decidido_em=NULL
        WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3`,[lancamentoId,id,contratoId,quantidade,justificativa.trim(),ator.id,data??null,observacao!==undefined,observacao?.trim()||null]);
      const depois=await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{lancamentoId,...anteriores[0]},
        dadosPosteriores:{lancamentoId,quantidade,justificativa:justificativa.trim(),quantidadeExecutada:depois.quantidadeExecutada,
          tipo:'CORRECAO_LANCAMENTO',situacao:'PENDENTE',data:data??anteriores[0].data,observacao:observacao??anteriores[0].observacao},
      });
      return {id:lancamentoId,quantidadeAnterior:antiga,quantidade,restante:depois.quantidadeDisponivel};
    });
  }

  async decidirLancamento(c:string,id:string,lid:string,decisao:'APROVADO'|'REJEITADO',motivo:string|undefined,ator:UsuarioAutenticado,versaoEsperada?:string) {
    if(!['APROVADO','REJEITADO'].includes(decisao)||decisao==='REJEITADO'&&!motivo?.trim())throw new BadRequestException('Informe a decisão e a justificativa da rejeição.');
    return this.dataSource.transaction(async m=>{
      await exigirPermissaoTransacional(m,c,ator,'aprovarExecucaoManual');
      await this.bloquearContratoAberto(m,c);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId:c},lock:{mode:'pessimistic_write'}});
      if(!o||o.substituidaEm)throw new NotFoundException('Ocorrência não encontrada');
      await this.exigirContextoLancamento(m,o);
      if(![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))throw new ConflictException('Reabra a ocorrência antes de decidir o lançamento.');
      const [anterior]=await m.query(`SELECT *,xmin::text AS versao FROM ocorrencia_lancamentos WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3 AND excluido_em IS NULL FOR UPDATE`,[lid,id,c]);
      if(!anterior)throw new NotFoundException('Lançamento não encontrado');
      if(versaoEsperada!==undefined && anterior.versao!==versaoEsperada)throw new ConflictException('O lançamento mudou. Atualize os dados antes de decidir.');
      if((anterior.status_execucao!=='PENDENTE'&&!(anterior.status_execucao==='REJEITADO'&&decisao==='APROVADO'))||anterior.bloqueado_em)throw new ConflictException('Somente lançamento pendente e desbloqueado pode ser decidido.');
      if (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null) throw new ConflictException('A ocorrência não possui meta quantitativa vigente.');
      if(decisao==='APROVADO') {
        const atual = await resumoMedicao(m,o);
        if (milesimos(atual.quantidadeRegistradaExata ?? atual.quantidadeRegistrada) + (anterior.status_execucao==='REJEITADO'?milesimos(anterior.quantidade):0n)>milesimos(o.metaQuantidade)) throw new ConflictException('A meta da ocorrência foi ultrapassada. Corrija os lançamentos antes de aprovar.');
      }
      await m.query(`UPDATE ocorrencia_lancamentos SET status_execucao=$4,decidido_por=$5,decidido_em=now() WHERE id=$1 AND ocorrencia_id=$2 AND contrato_id=$3`,[lid,id,c,decisao,ator.id]);
      const depois=await this.recalcularEstado(m,o,ator);
      if(decisao==='APROVADO' && o.metaQuantidade!=null && milesimos(depois.quantidadeRegistradaExata ?? depois.quantidadeRegistrada)>milesimos(o.metaQuantidade)) throw new ConflictException('A aprovação excede a meta da ocorrência. Corrija o lançamento.');
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,dadosAnteriores:{lancamentoId:lid,situacao:anterior.status_execucao,quantidade:anterior.quantidade},dadosPosteriores:{lancamentoId:lid,situacao:decisao,motivo:motivo?.trim(),quantidadeExecutada:depois.quantidadeExecutada}});
      if(decisao==='APROVADO')await iniciarHierarquiaOperacional(m,this.auditoria,ator,c,o.entregavelId);
      return {id:lid,situacao:decisao,quantidadeExecutada:depois.quantidadeExecutada};
    });
  }

  /** Operações com permissão independente, escopo de contrato e trilha persistida. */
  async alterarBloqueioLancamento(contratoId:string,id:string,lancamentoId:string,
    bloqueado:boolean,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await exigirPermissaoTransacional(m,contratoId,ator,'bloquearExecucaoOcorrencia');
      await this.bloquearContratoAberto(m,contratoId);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      await this.exigirContextoLancamento(m,o);
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência antes de alterar bloqueios');
      const registros:Array<{bloqueadoEm:string|null}>=await m.query(
        `SELECT bloqueado_em AS "bloqueadoEm" FROM ocorrencia_lancamentos
         WHERE id=$1 AND contrato_id=$2 AND ocorrencia_id=$3 AND excluido_em IS NULL FOR UPDATE`,
        [lancamentoId,contratoId,id]);
      if (!registros.length) throw new NotFoundException('Lançamento não encontrado');
      const anterior=Boolean(registros[0].bloqueadoEm);
      if (anterior===bloqueado) return {id:lancamentoId,bloqueado};
      await m.query(`UPDATE ocorrencia_lancamentos SET bloqueado_em=CASE WHEN $4 THEN now() ELSE NULL END,
        bloqueado_por=CASE WHEN $4 THEN $5::uuid ELSE NULL END
        WHERE id=$1 AND contrato_id=$2 AND ocorrencia_id=$3`,[lancamentoId,contratoId,id,bloqueado,ator.id]);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{lancamentoId,bloqueado:anterior},
        dadosPosteriores:{lancamentoId,bloqueado,tipo:'BLOQUEIO_LANCAMENTO'},
      });
      return {id:lancamentoId,bloqueado};
    });
  }

  async excluirLancamento(contratoId:string,id:string,lancamentoId:string,
    justificativa:string,ator:UsuarioAutenticado) {
    const motivo=justificativa.trim();
    if (motivo.length<15 || motivo.length>200)
      throw new BadRequestException('Informe uma justificativa de 15 a 200 caracteres');
    return this.dataSource.transaction(async m=>{
      await exigirPermissaoTransacional(m,contratoId,ator,'excluirExecucaoOcorrencia');
      await this.bloquearContratoAberto(m,contratoId);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))
        throw new ConflictException('Reabra a ocorrência antes de excluir lançamentos');
      await this.exigirContextoLancamento(m,o);
      const anteriores:Array<{quantidade:string;bloqueadoEm:string|null}>=await m.query(
        `SELECT quantidade::text AS quantidade,bloqueado_em AS "bloqueadoEm" FROM ocorrencia_lancamentos
         WHERE id=$1 AND contrato_id=$2 AND ocorrencia_id=$3 AND excluido_em IS NULL FOR UPDATE`,
        [lancamentoId,contratoId,id]);
      if (!anteriores.length) throw new NotFoundException('Lançamento não encontrado');
      if (anteriores[0].bloqueadoEm) throw new ConflictException('Desbloqueie o lançamento antes de excluir');
      await protegerReferenciaManual(m,contratoId,lancamentoId,'QUANTIDADE');
      const antes=await resumoMedicao(m,o);
      await m.query(`UPDATE ocorrencia_lancamentos SET excluido_em=now(),excluido_por=$4,
        justificativa_exclusao=$5 WHERE id=$1 AND contrato_id=$2 AND ocorrencia_id=$3`,
        [lancamentoId,contratoId,id,ator.id,motivo]);
      const depois=await this.recalcularEstado(m,o,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EXECUCAO_REGISTRADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{lancamentoId,quantidade:anteriores[0].quantidade,quantidadeExecutada:antes.quantidadeExecutada},
        dadosPosteriores:{lancamentoId,quantidadeExecutada:depois.quantidadeExecutada,
          justificativa:motivo,tipo:'EXCLUSAO_LANCAMENTO'},
      });
      return {id:lancamentoId,excluido:true,quantidadeExecutada:depois.quantidadeExecutada};
    });
  }

  async listarComprovantes(contratoId:string,id:string) {
    const o=await this.ocorrenciasRepo.findOneBy({id,contratoId});
    if (!o) throw new NotFoundException('Ocorrência não encontrada');
    const linhas:Array<{id:string;esperadaId:string;nomeOriginal:string;tipoEvidencia:string;vinculado:boolean;status:string;criadoEm:string}> =
      await this.dataSource.query(`SELECT c.id,c.evidencia_esperada_id AS "esperadaId",c.nome_original AS "nomeOriginal",ev.tipo_evidencia AS "tipoEvidencia",c.criado_em AS "criadoEm",
        c.status,(oc.ocorrencia_id IS NOT NULL) AS vinculado
        FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        LEFT JOIN ocorrencia_comprovantes oc ON oc.ocorrencia_id=$2 AND oc.comprovante_id=c.id AND oc.contrato_id=$1
        WHERE c.contrato_id=$1 AND c.entregavel_id=$3 AND
          (oc.ocorrencia_id IS NOT NULL OR (c.status IN ('PENDENTE_VERIFICACAO','VERIFICADA')
            AND ev.arquivado_em IS NULL
            AND ($4::boolean IS FALSE OR (c.origem_quantidade IS DISTINCT FROM 'NOVA_EXECUCAO' AND NOT EXISTS (SELECT 1 FROM execucoes_entregavel p WHERE p.origem='EVIDENCIA' AND p.origem_id=c.id AND p.centesimos>0)))
            AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia nova WHERE nova.evidencia_esperada_id=c.evidencia_esperada_id
              AND (nova.criado_em,nova.id) > (c.criado_em,c.id))))
        ORDER BY (oc.ocorrencia_id IS NOT NULL) DESC,c.criado_em DESC,c.id DESC`,[contratoId,id,o.entregavelId,o.status===StatusOcorrencia.CONCLUIDO_PARCIALMENTE]);
    return {vinculadas:linhas.filter(l=>l.vinculado),disponiveis:linhas.filter(l=>!l.vinculado)};
  }
  async vincularComprovante(contratoId:string,id:string,comprovanteId:string,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await exigirPermissaoTransacional(m,contratoId,ator,'vincularEvidenciasOcorrencia');
      const contrato = await this.bloquearContratoAberto(m,contratoId,true);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para alterar evidências vinculadas');
      const regularizacao = o.status === StatusOcorrencia.CONCLUIDO_PARCIALMENTE;
      if (o.regularizacaoDocumentalSolicitada || (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao))
        throw new ConflictException('Resolva a regularização pendente antes de vincular evidências');
      const entregavel = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!entregavel) throw new NotFoundException('Entregável indisponível');
      await this.exigirEntregavelAberto(m, entregavel, regularizacao);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id,regularizacao);
      const validos:Array<{id:string}>=await m.query(`SELECT c.id FROM comprovantes_evidencia c
        JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
        WHERE c.id=$1 AND c.contrato_id=$2 AND c.entregavel_id=$3 AND c.status IN ('PENDENTE_VERIFICACAO','VERIFICADA')
          AND ($4::boolean IS FALSE OR (c.origem_quantidade IS DISTINCT FROM 'NOVA_EXECUCAO' AND NOT EXISTS (SELECT 1 FROM execucoes_entregavel p WHERE p.origem='EVIDENCIA' AND p.origem_id=c.id AND p.centesimos>0)))
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id
            AND (n.criado_em,n.id) > (c.criado_em,c.id))`,[comprovanteId,contratoId,o.entregavelId,o.status===StatusOcorrencia.CONCLUIDO_PARCIALMENTE]);
      if (!validos.length) throw new ConflictException('Selecione um comprovante atual, pendente ou verificado, do mesmo entregável');
      const antesVinculo=o.metaQuantidade!=null?await resumoMedicao(m,o):null;
      const inseridos:Array<{comprovante_id:string}>=await m.query(`INSERT INTO ocorrencia_comprovantes
        (ocorrencia_id,comprovante_id,contrato_id,vinculado_por) VALUES ($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING comprovante_id`,[id,comprovanteId,contratoId,ator.id]);
      if (!inseridos.length) throw new ConflictException('Comprovante já vinculado');
      const r = await this.recalcularEstado(m,o,ator);
      if(antesVinculo && o.metaQuantidade!=null && milesimos(r.quantidadeRegistradaExata??r.quantidadeRegistrada)>milesimos(o.metaQuantidade) && milesimos(r.quantidadeRegistradaExata??r.quantidadeRegistrada)>milesimos(antesVinculo.quantidadeRegistradaExata??antesVinculo.quantidadeRegistrada))
        throw new ConflictException('O vínculo excederia o saldo de execução disponível.');
      if (r.evidenciasFoto + r.evidenciasRelatorio + r.evidenciasOutras > 0)
        await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,o.entregavelId);
      await this.auditoria.registrarNaTransacao(m,ator,{
        acao:AcaoAuditoria.OCORRENCIA_EDITADA,entidadeTipo:'OCORRENCIA',entidadeId:id,
        dadosAnteriores:{comprovanteId:null},dadosPosteriores:{comprovanteId,operacao:'VINCULAR_EVIDENCIA'},
      });
      return {vinculado:true};
    });
  }
  async desvincularComprovante(contratoId:string,id:string,comprovanteId:string,ator:UsuarioAutenticado) {
    return this.dataSource.transaction(async m=>{
      await exigirPermissaoTransacional(m,contratoId,ator,'vincularEvidenciasOcorrencia');
      const contrato = await this.bloquearContratoAberto(m,contratoId,true);
      const o=await m.findOne(Ocorrencia,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não encontrada');
      const e = await m.findOneBy(Entregavel, { id: o.entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado');
      const regularizacao = o.status === StatusOcorrencia.CONCLUIDO_PARCIALMENTE;
      if (o.regularizacaoDocumentalSolicitada || (contrato.status === 'CONCLUIDO_PARCIALMENTE' && !regularizacao)) throw new ConflictException('Resolva a regularização pendente antes de desvincular evidências');
      await this.exigirEntregavelAberto(m, e, regularizacao);
      await exigirRegistroMetaEditavel(m,contratoId,'OCORRENCIA',id);
      if (![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE].includes(o.status))
        throw new ConflictException('Reabra a ocorrência para alterar evidências vinculadas');
      const fisico=await m.query(`SELECT 1 FROM comprovantes_evidencia c WHERE c.id=$1 AND c.contrato_id=$2 AND (c.ocorrencia_quantidade_id=$3 AND c.origem_quantidade IS NOT NULL OR EXISTS(SELECT 1 FROM execucoes_entregavel p WHERE p.origem='EVIDENCIA' AND p.origem_id=c.id AND p.ocorrencia_id=$3 AND (p.centesimos>0 OR p.referencia_id IS NOT NULL))) LIMIT 1`,[comprovanteId,contratoId,id]);
      if (fisico.length) throw new ConflictException('Este vínculo identifica a execução física. Remova ou redirecione a contribuição antes de desvincular.');
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

  async historico(contratoId:string,id:string,ator:UsuarioAutenticado,offset=0,limite?:number) {
    validarPaginacaoOcorrencia(offset,limite);
    const o=await this.ocorrenciasRepo.findOneBy({id,contratoId});
    if (!o) throw new NotFoundException('Ocorrência não encontrada');
    if (ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
      const vinculo = await this.dataSource.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
      if (!vinculo || !permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas).editarOcorrencias)
        throw new ForbiddenException('Sem permissão para consultar a rastreabilidade da ocorrência');
    }
    // Apenas eventos dessa ocorrência, já associados ao contrato persistido.
    const eventos: {dadosAnteriores: Record<string, unknown> | null; dadosPosteriores: Record<string, unknown> | null}[] = await this.dataSource.query(`SELECT a.id, a.acao, a.registrado_em AS "registradoEm",
      u.id AS "ator", COALESCE(NULLIF(u.nome, ''), 'Usuário identificado') AS "autorNome",
      a.dados_anteriores AS "dadosAnteriores", a.dados_posteriores AS "dadosPosteriores"
      FROM eventos_auditoria a
      LEFT JOIN usuarios u ON u.supertokens_user_id = a.ator_supertokens_user_id
      WHERE a.contrato_id=$1 AND a.entidade_tipo='OCORRENCIA' AND a.entidade_id=$2
      ORDER BY a.registrado_em DESC,a.id DESC LIMIT $3 OFFSET $4`,[contratoId,id,limite??null,offset]);
    return eventos.map(e => ({ ...e, dadosAnteriores: projetarHistoricoOcorrencia(e.dadosAnteriores), dadosPosteriores: projetarHistoricoOcorrencia(e.dadosPosteriores) }));
  }

}

/** Projeção de negócio: não devolve identificadores de identidade, snapshots
 * de vínculos internos, credenciais ou dados arbitrários de versões antigas. */
export function correcaoQuantidadePermitida(atual:bigint, novo:bigint, meta:bigint) {
  return novo>=0n && (novo<=meta || (atual>meta && novo<atual));
}

function validarPaginacaoOcorrencia(offset:number,limite?:number) {
  if(!Number.isSafeInteger(offset)||offset<0||(limite!==undefined&&(!Number.isSafeInteger(limite)||limite<1||limite>500))) throw new BadRequestException('Paginação inválida');
}

function snapshotDecisaoOcorrencia(o:Ocorrencia) {
  return {status:o.status,quantidadeAprovada:o.quantidadeAprovada??null,origemMedicaoAprovada:o.origemMedicaoAprovada??null,regularizacaoDocumentalSolicitada:Boolean(o.regularizacaoDocumentalSolicitada),
    dataRealizada:o.dataRealizada??null,motivoEncerramento:o.motivoEncerramento??null,encerradaEm:o.encerradaEm??null,encerradaPor:o.encerradaPor??null,
    concluidaEm:o.concluidaEm??null,concluidaPor:o.concluidaPor??null};
}

export function projetarHistoricoOcorrencia(dados: Record<string, unknown> | null) {
  if (!dados) return null;
  const campos = new Set(['status','titulo','descricao','dataInicio','dataFim','prazo','quantidadePrevista','quantidadeExecutada','quantidade','percentual','peso','modoRegistro','operacao','motivo','justificativa','minimoEvidenciasVerificadas','minimoFotos','minimoRelatorios','minimoEvidenciasLivres','evidenciaExigida','dataExecucao','concluidoEm','encerradoEm','periodoInicio','periodoFim','origem','minimoAtividadesVerificadas','quantidadeRealizada','pesoPeriodo','quantidadeAprovada','regularizacaoDocumentalSolicitada','data','dataRealizada','dataPrevista','observacoes','metaQuantidade','exigeAtividade','permiteEncerramentoExcepcional','quantidadeAdicionada','situacao','observacao','tipo','bloqueado','lancamentoId','comprovanteId','motivoEncerramento','encerradaEm','concluidaEm','bloqueadoEm']);
  return Object.fromEntries(Object.entries(dados).filter(([chave, valor]) => campos.has(chave) && (valor === null || ['string','number','boolean'].includes(typeof valor))));
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

/** A quantidade de provas configurada deve ser idêntica na geração e no cadastro manual. */
export function minimoInicialEvidencias(r?: {minimoEvidenciasVerificadas?:number|null; evidenciaExigida?:string|null; minimoFotos?:number|null; minimoRelatorios?:number|null; minimoEvidenciasLivres?:number|null}): number {
  if (r?.minimoEvidenciasVerificadas != null) return r.minimoEvidenciasVerificadas;
  if ([r?.minimoFotos,r?.minimoRelatorios,r?.minimoEvidenciasLivres].some(v=>v!=null)) return (r?.minimoFotos??0)+(r?.minimoRelatorios??0)+(r?.minimoEvidenciasLivres??0);
  return r?.evidenciaExigida==='AMBOS'?2:r?.evidenciaExigida==='FOTO'||r?.evidenciaExigida==='RELATORIO'?1:0;
}

export function validarEncerramentoOcorrencia(o: Pick<Ocorrencia,'permiteEncerramentoExcepcional'>, r: ResumoMedicao, prazoLiberado:boolean) {
  if (!o.permiteEncerramentoExcepcional) throw new ConflictException('Encerramento excepcional desabilitado nesta ocorrência');
  if (r.registrosExecucaoPendentes || r.atividadesPendentes > 0) throw new ConflictException('Resolva as atividades e contribuições pendentes ou em revisão antes de encerrar.');
  if (r.metaAtingida && r.criteriosOperacionaisAtendidos && prazoLiberado) throw new ConflictException('Todos os requisitos estão atendidos; solicite conclusão em vez de encerramento.');
}
