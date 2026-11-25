import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import type { EditarReferenciasAtividadeDto } from './dto/referencias-atividade.dto.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { milesimos } from '../common/quantidade-exata.js';
import { iniciarHierarquiaOperacional } from '../execucao/inicio-operacional.js';
import { snapshotParcela, snapshotMedicoesDiretas } from '../execucao/snapshot-parcela.js';
import { ExecucaoLancamento } from '../execucao/execucao-lancamento.entity.js';
import { exigirSaldoQuantidadeDireta, exigirSaldoQuantidadeOcorrencia, listarContribuicoesQuantitativas, listarExecucoesQuantitativas } from '../entregaveis/quantidade-evidencias.js';
import { criarParcela, parcelas, validarSaldoParcelas, exigirPermissaoParcela, exigirOcorrenciaParcela, centesimos } from '../execucao/parcelas-execucao.js';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, ILike, IsNull, type EntityManager, type Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas, type ChavePermissao } from '../autorizacao/permissoes-granulares.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { StatusOcorrencia } from '../ocorrencias/status-ocorrencia.enum.js';
import { resumoMedicao, proximoStatusAutomatico, conclusaoTemporalPermitida } from '../ocorrencias/medicao-ocorrencia.js';
import { inicioDiaCivilUtc, proximoDiaCivil, hojeCivil } from '../common/data-civil.js';
import type { MedicaoAtividadeDto } from './dto/medicao-atividade.dto.js';
import { AtividadeEntity } from './atividade.entity.js';
import { AtividadeCompartilhada } from './atividade-compartilhada.entity.js';
import type { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import type { UpdateAtividadeDto } from './dto/update-atividade.dto.js';

function validoDia(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function instante(s: string): Date {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)) throw new BadRequestException('Data/hora deve incluir fuso horário');
  const date = new Date(s);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Data/hora inválida');
  return date;
}
function resumo(a: AtividadeEntity) {
  return {
    participantes: a.participantes ?? [], local: a.local ?? null, duracao: a.duracao ?? null, observacoes: a.observacoes ?? null,
    titulo: a.titulo, dataHora: a.dataHora.toISOString(), tipo: a.tipo,
    descricao: a.descricao, responsavel: a.responsavel, responsavelId: a.responsavelId,
    ocorrenciaId: a.ocorrenciaId ?? null, ocorrenciaIds: (a.ocorrencias ?? []).map(o => o.id).sort(), quantidadeExecucao: a.quantidadeExecucao ?? null,
    entregavelIds: a.entregaveis.map(e => e.id).sort(),
    status: a.status, solicitadaEm:a.solicitadaEm?.toISOString()??null, solicitadaPor:a.solicitadaPor??null, verificadaPor:a.verificadaPor??null, verificadaEm: a.verificadaEm?.toISOString() ?? null, arquivadaEm: a.arquivadaEm?.toISOString() ?? null, excluidaEm: a.excluidaEm?.toISOString() ?? null,
  };
}
function erroQuery(pagina: string | undefined, limite: string | undefined): [number, number] {
  const p = pagina === undefined ? 1 : Number(pagina);
  const l = limite === undefined ? 20 : Number(limite);
  if (!Number.isInteger(p) || p < 1 || !Number.isInteger(l) || l < 1 || l > 100) {
    throw new BadRequestException('Paginação inválida');
  }
  return [p, l];
}

@Injectable()
export class AtividadesService implements OnModuleInit {
  constructor(
    @InjectRepository(AtividadeEntity) private readonly repo: Repository<AtividadeEntity>,
    private readonly auditoria: AuditoriaService,
    private readonly escopos: ResolverEscopoContratoService,
  ) {}

  onModuleInit() {
    this.escopos.registrarAdaptador('atividade', async id => {
      const registro = await this.repo.findOne({ where: { id }, select: { contratoId: true } });
      return registro?.contratoId ?? null;
    });
    this.auditoria.registrarResolvedorContexto('ATIVIDADE', async (manager, id) => {
      const registro = await manager.findOne(AtividadeEntity, { where: { id }, select: { contratoId: true } });
      return registro?.contratoId ?? null;
    });
  }

  private async autorizarMutacao(m: EntityManager, contratoId: string, ator: UsuarioAutenticado,
    chave: ChavePermissao, dto?: CreateAtividadeDto | UpdateAtividadeDto) {
    await exigirPermissaoTransacional(m, contratoId, ator, chave);
    if (!dto) return;
    const criacao = 'contratoId' in dto;
    if (criacao ? Boolean(dto.ocorrenciaId || dto.ocorrenciaIds?.length) : dto.ocorrenciaId !== undefined || dto.ocorrenciaIds !== undefined)
      await exigirPermissaoTransacional(m, contratoId, ator, 'vincularAtividadesOcorrencia');
    if (criacao ? Boolean(dto.medicoes?.length || dto.quantidadeExecucao != null) : dto.medicoes !== undefined || dto.quantidadeExecucao !== undefined)
      await exigirPermissaoTransacional(m, contratoId, ator, 'registrarExecucaoOcorrencia');
    if (criacao ? Boolean(dto.medicoesDiretas?.length || dto.parcelasPercentuais?.length || dto.percentualExecucao !== undefined)
      : dto.medicoesDiretas !== undefined || dto.parcelasPercentuais !== undefined)
      await exigirPermissaoTransacional(m, contratoId, ator, 'editarExecucaoFisica');
  }

  private async verificarEntregaveis(manager: EntityManager, contratoId: string, ids: string[]): Promise<Entregavel[]> {
    if (!ids.length || new Set(ids.map(i => i.toLowerCase())).size !== ids.length) {
      throw new BadRequestException('Selecione entregáveis distintos do contrato');
    }
    // O lock do contrato serializa cadastro de atividade com conclusão/arquivamento
    // de contratos, etapas e entregáveis; não confiar apenas nos botões do frontend.
    const contrato = await manager.findOne(Contrato, {
      where: { id: contratoId }, lock: { mode: 'pessimistic_write' },
    });
    if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado ||
      !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) {
      throw new ConflictException('Reabra ou retome o contrato antes de registrar atividades');
    }
    const encontrados = await manager.find(Entregavel, { where: { id: In(ids), contratoId } });
    if (encontrados.length !== ids.length || encontrados.some(e => e.arquivadoEm !== null || ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_ENCERRAMENTO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL'].includes(e.statusExecucao ?? ''))) {
      throw new ConflictException('É necessário vincular apenas entregáveis abertos do mesmo contrato');
    }
    const idsEtapas = [...new Set(encontrados.map(e => e.etapaId))];
    const etapas = await manager.find(Etapa, { where: { id: In(idsEtapas), contratoId } });
    if (etapas.length !== idsEtapas.length || etapas.some(e =>
      e.arquivadoEm || e.conclusaoSolicitadaEm || e.encerramentoSolicitadoEm || ['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(e.status))) {
      throw new ConflictException('Reabra a etapa antes de vincular uma nova atividade');
    }
    return encontrados;
  }

  private async validarOcorrencia(manager: EntityManager, contratoId: string, ocorrenciaId: string | null | undefined, entregaveis: Entregavel[], quantidade: string | null | undefined = null) {
    if (ocorrenciaId == null) {
      if (quantidade != null) throw new BadRequestException('Informe a ocorrência para registrar quantidade executada');
      return;
    }
    const o = await manager.findOne(Ocorrencia, { where: { id: ocorrenciaId, contratoId }, lock: { mode: 'pessimistic_write' } });
    if (!o || o.substituidaEm || !entregaveis.some(e => e.id === o.entregavelId)) {
      throw new ConflictException('A ocorrência precisa pertencer a um dos entregáveis vinculados do mesmo contrato e estar ativa');
    }
    if ([StatusOcorrencia.PENDENTE_CONCLUSAO, StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL, StatusOcorrencia.CONCLUIDO, StatusOcorrencia.CONCLUIDO_PARCIALMENTE, StatusOcorrencia.PENDENTE_ENCERRAMENTO, StatusOcorrencia.ENCERRADA].includes(o.status)) {
      throw new ConflictException(`A ocorrência “${(o.titulo??o.id).slice(0,80)}” está em ${o.status.toLocaleLowerCase('pt-BR').replaceAll('_',' ')}. ${o.status.startsWith('PENDENTE_')?'Cancele a solicitação vigente':'Reabra a ocorrência'} antes de alterar ou reabrir a atividade. Esta proteção também se aplica ao administrador.`);
    }
    if (quantidade != null && (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null)) {
      throw new BadRequestException('Quantidade só pode ser informada para ocorrência com meta quantitativa');
    }
  }

  /** Confere todos os vínculos; uma associação não amplia a autorização do usuário.
   * A quantidade física só pertence à ocorrência primária, nunca é duplicada nas demais. */
  private async verificarOcorrencias(manager: EntityManager, contratoId: string, ids: string[],
    entregaveis: Entregavel[], primaria: string | null | undefined, quantidade: string | null | undefined): Promise<Ocorrencia[]> {
    // Valide ANTES de normalizar: mocks, legados e chamadas internas podem
    // fornecer valores inesperados e devem receber HTTP 400, nunca TypeError/500.
    if (ids.some(id => typeof id !== 'string' || !uuidValido(id)) ||
        new Set(ids.map(id => id.toLowerCase())).size !== ids.length)
      throw new BadRequestException('Informe ocorrências distintas e válidas.');
    if (primaria && !ids.includes(primaria)) throw new BadRequestException('A ocorrência de medição deve estar entre as ocorrências vinculadas.');
    if (quantidade != null && !primaria) throw new BadRequestException('Selecione uma ocorrência principal para informar quantidade.');
    const vinculadas: Ocorrencia[] = [];
    for (const id of [...ids].sort()) {
      await this.validarOcorrencia(manager, contratoId, id, entregaveis, id === primaria ? quantidade : null);
      const registro = await manager.findOne(Ocorrencia, { where: { id, contratoId } });
      if (!registro) throw new ConflictException('Ocorrência não encontrada no contrato.');
      vinculadas.push(registro);
    }
    return vinculadas;
  }

  private async exigirExecucaoSemDuplicidade(m: EntityManager, contratoId: string, atividadeId: string) {
    const [conflito] = await m.query(`SELECT EXISTS(SELECT 1 FROM atividade_comprovantes ac
      JOIN comprovantes_evidencia c ON c.id=ac.comprovante_id AND c.contrato_id=ac.contrato_id
      JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
      JOIN atividades a ON a.id=ac.atividade_id AND a."contratoId"=ac.contrato_id
      LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.contrato_id=a."contratoId" AND am.ocorrencia_id=c.ocorrencia_quantidade_id
      WHERE ac.contrato_id=$1 AND ac.atividade_id=$2 AND c.status IN ('PENDENTE_VERIFICACAO','VERIFICADA')
        AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)) AND (
          (c.origem_quantidade='NOVA_EXECUCAO' AND c.quantidade_declarada>0 AND COALESCE(am.quantidade,CASE WHEN a."ocorrenciaId"=c.ocorrencia_quantidade_id THEN a.quantidade_execucao ELSE 0 END)>0)
          OR (c.origem_quantidade='NOVA_EXECUCAO' AND c.ocorrencia_quantidade_id IS NULL AND c.quantidade_declarada>0 AND EXISTS(SELECT 1 FROM atividade_entregavel_medicoes dm WHERE dm.atividade_id=a.id AND dm.entregavel_id=c.entregavel_id AND dm.contrato_id=c.contrato_id AND dm.quantidade>0))
          OR EXISTS(SELECT 1 FROM execucoes_entregavel p JOIN execucoes_entregavel ep ON ep.contrato_id=p.contrato_id AND ep.entregavel_id=p.entregavel_id AND ep.ocorrencia_id IS NOT DISTINCT FROM p.ocorrencia_id WHERE p.origem='ATIVIDADE' AND p.origem_id=a.id AND p.centesimos>0 AND ep.origem='EVIDENCIA' AND ep.origem_id=c.id AND ep.centesimos>0))) AS duplicada`,[contratoId,atividadeId]);
    if (conflito?.duplicada) throw new ConflictException('A evidência vinculada já representa esta execução. Corrija o vínculo de contribuição antes de continuar.');
  }

  /** Referências de comprovação não somam execução e devem continuar válidas na decisão. */
  private async validarReferenciasNaDecisao(m: EntityManager, registro: AtividadeEntity) {
    if (!registro.entregaveis.length) return;
    const refs = await m.query(`SELECT ocorrencia_id AS "ocorrenciaId", referencia_execucao AS referencia
      FROM atividade_ocorrencia_medicoes WHERE contrato_id=$1 AND atividade_id=$2 AND referencia_execucao IS NOT NULL`,
      [registro.contratoId, registro.id]) as {ocorrenciaId:string;referencia:string}[];
    if (refs.length) {
      const fontes = await listarExecucoesQuantitativas(m, registro.contratoId, [...new Set(refs.map(r=>r.ocorrenciaId))]);
      if (refs.some(r=>!fontes.some(f=>f.ocorrenciaId===r.ocorrenciaId && f.referencia===r.referencia && milesimos(f.quantidade)>0n)))
        throw new ConflictException('Uma execução quantitativa referenciada não está mais reconhecida. Regularize a referência antes de verificar.');
    }
    for (const e of registro.entregaveis.filter(e=>e.execucoesIntegradas)) {
      const linhas = await parcelas(m,e);
      if (linhas.some(l=>l.origem==='ATIVIDADE' && l.origemId===registro.id && l.referenciaId &&
        !linhas.some(f=>f.id===l.referenciaId && f.reconhecido>0 && f.ocorrenciaId===l.ocorrenciaId)))
        throw new ConflictException('Uma execução percentual referenciada não está mais reconhecida. Regularize a referência antes de verificar.');
    }
  }

  /** Não invalida uma fonte reconhecida com comprovações vigentes silenciosamente. */
  private async protegerReferenciasDependentes(m: EntityManager, registro: AtividadeEntity) {
    if (!registro.entregaveis.length) return;
    const [r] = await m.query(`SELECT EXISTS(
      SELECT 1 FROM atividade_ocorrencia_medicoes am JOIN atividades a ON a.id=am.atividade_id AND a."contratoId"=am.contrato_id
      WHERE am.contrato_id=$1 AND am.referencia_execucao=$3 AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
      UNION ALL
      SELECT 1 FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
      WHERE c.contrato_id=$1 AND c.origem_quantidade='COMPROVACAO' AND c.referencia_execucao=$3 AND ev.arquivado_em IS NULL
        AND c.status='VERIFICADA' AND ev.reaberto_em IS NULL AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
      UNION ALL
      SELECT 1 FROM execucoes_entregavel fonte JOIN execucoes_entregavel ref ON ref.referencia_id=fonte.id AND ref.contrato_id=fonte.contrato_id
      WHERE fonte.contrato_id=$1 AND fonte.origem='ATIVIDADE' AND fonte.origem_id=$2
        AND ((ref.origem='ATIVIDADE' AND EXISTS(SELECT 1 FROM atividades a WHERE a.id=ref.origem_id AND a."contratoId"=$1 AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'))
          OR (ref.origem='EVIDENCIA' AND EXISTS(SELECT 1 FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id WHERE c.id=ref.origem_id AND ev.arquivado_em IS NULL AND c.status='VERIFICADA' AND ev.reaberto_em IS NULL AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)))))
      UNION ALL
      SELECT 1 FROM vinculos_metas_marco v JOIN metas_marco mm ON mm.id=v.meta_id AND mm.contrato_id=v.contrato_id
      WHERE v.contrato_id=$1 AND v.atividade_id=$2 AND v.status='APROVADO' AND mm.arquivado_em IS NULL
      ) AS dependente`, [registro.contratoId,registro.id,`atividade:${registro.id}`]) as {dependente:boolean}[];
    if (r?.dependente) throw new ConflictException('Esta execução possui comprovações referenciadas. Reabra primeiro as comprovações verificadas ou regularize os vínculos de metas aprovados que dependem desta execução.');
  }

  private async salvarMedicoes(manager: EntityManager, contratoId:string, atividadeId:string,
    medicoes: MedicaoAtividadeDto[] | undefined, ocorrencias: Ocorrencia[]) {
    if (medicoes === undefined) return;
    const ids = new Set(ocorrencias.map(o=>o.id));
    if (medicoes.some(m => !ids.has(m.ocorrenciaId)))
      throw new BadRequestException('A quantidade só pode ser registrada em ocorrência vinculada à atividade');
    if (new Set(medicoes.map(m=>m.ocorrenciaId)).size !== medicoes.length)
      throw new BadRequestException('Informe cada ocorrência no máximo uma vez');
    const porId = new Map(ocorrencias.map(o=>[o.id,o]));
    for (const m of medicoes) {
      const oc = porId.get(m.ocorrenciaId);
      if (!oc || oc.modoRegistro !== 'QUANTITATIVO' || oc.metaQuantidade == null)
        throw new BadRequestException('Medição exige uma ocorrência quantitativa com meta');
    }
    const referencias: {ocorrenciaId:string;referencia:string}[]=await manager.query(`SELECT ocorrencia_id AS "ocorrenciaId", referencia_execucao AS referencia FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 AND referencia_execucao IS NOT NULL`,[atividadeId,contratoId]);
    if(referencias.some(ref=>!ids.has(ref.ocorrenciaId)||medicoes.some(item=>item.ocorrenciaId===ref.ocorrenciaId&&milesimos(item.quantidade)!==0n)))throw new ConflictException('Uma atividade comprobatória não pode registrar novamente a execução referenciada.');
    await manager.query(`DELETE FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2`,
      [atividadeId,contratoId]);
    for (const item of medicoes) await manager.query(`INSERT INTO atividade_ocorrencia_medicoes
      (atividade_id,ocorrencia_id,contrato_id,quantidade) VALUES ($1,$2,$3,$4)`,
      [atividadeId,item.ocorrenciaId,contratoId,item.quantidade]);
    for(const ref of referencias)await manager.query(`INSERT INTO atividade_ocorrencia_medicoes(atividade_id,ocorrencia_id,contrato_id,quantidade,referencia_execucao) VALUES ($1,$2,$3,0,$4) ON CONFLICT (atividade_id,ocorrencia_id) DO UPDATE SET referencia_execucao=EXCLUDED.referencia_execucao`,[atividadeId,ref.ocorrenciaId,contratoId,ref.referencia]);
  }

  private async recalcularOcorrencia(manager: EntityManager,id: string | null | undefined,ator:UsuarioAutenticado) {
    if (!id) return;
    const o = await manager.findOne(Ocorrencia,{where:{id},lock:{mode:'pessimistic_write'}});
    if (!o || o.substituidaEm) return;
    if ([StatusOcorrencia.PENDENTE_CONCLUSAO,StatusOcorrencia.PENDENTE_CONCLUSAO_PARCIAL,StatusOcorrencia.CONCLUIDO,StatusOcorrencia.CONCLUIDO_PARCIALMENTE,StatusOcorrencia.PENDENTE_ENCERRAMENTO,
      StatusOcorrencia.ENCERRADA].includes(o.status)) throw new ConflictException('Ocorrência bloqueada até reabertura');
    const r = await resumoMedicao(manager,o);
    const entregavel = await manager.findOneBy(Entregavel, { id: o.entregavelId, contratoId: o.contratoId });
    if (!entregavel) throw new NotFoundException('Entregável da ocorrência indisponível');
    const novo = proximoStatusAutomatico(o,r,
      conclusaoTemporalPermitida(entregavel.tipo, entregavel.terminoPrevisto)) as StatusOcorrencia;
    if (o.status === novo) return;
    const anterior=o.status;o.status=novo;
    await manager.save(Ocorrencia,o);
    await this.auditoria.registrarNaTransacao(manager,ator,{
      acao:AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO,entidadeTipo:'OCORRENCIA',entidadeId:id,
      dadosAnteriores:{status:anterior},dadosPosteriores:{status:novo,quantidadeExecutada:r.quantidadeExecutada,
        quantidadeRegistrada:r.quantidadeRegistrada, situacaoComprovacao:r.situacaoComprovacao,
        motivo:novo===StatusOcorrencia.PENDENTE_CONCLUSAO?'PRONTA_AGUARDANDO_APROVACAO':'ATIVIDADES_RECALCULADAS'},
    });
  }

  private async idsResponsaveis(manager: EntityManager, contratoId: string, ator: UsuarioAutenticado): Promise<string[] | null> {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return null;
    const vinculos = await manager.find(PermissaoContrato, { where: { contratoId }, select: { usuarioId: true } });
    return [...new Set([ator.id, ...vinculos.map(v => v.usuarioId)])];
  }

  async consultarResponsaveis(contratoId: string, busca: string | undefined, ator: UsuarioAutenticado) {
    if (busca !== undefined && (typeof busca !== 'string' || busca.length > 100)) throw new BadRequestException('Busca inválida');
    if (ator.perfil!==PerfilUsuario.ADMINISTRADOR) {
      const v=await this.repo.manager.findOneBy(PermissaoContrato,{contratoId,usuarioId:ator.id});
      const p=v&&permissoesEfetivas(ator.perfil,v.podeEditar,v.permissoesDetalhadas);
      if(!p||!p.registrarAtividades&&!p.editarAtividades) throw new ForbiddenException('Sem permissão para selecionar responsáveis.');
    }
    const ids = await this.idsResponsaveis(this.repo.manager, contratoId, ator);
    const termo = (busca ?? '').trim().replace(/[%_\\]/g, c => '\\'+c);
    const [itens, total] = await this.repo.manager.getRepository(Usuario).findAndCount({
      where: termo ? [{ ativo:true, ...(ids ? { id: In(ids) } : {}), email: ILike(`%${termo}%`) }, { ativo:true, ...(ids ? { id: In(ids) } : {}), nome: ILike(`%${termo}%`) }] : { ativo:true, ...(ids ? { id: In(ids) } : {}) },
      select: { id:true, email:true, nome:true }, order:{ nome:'ASC', email:'ASC' }, take:30,
    });
    return { itens, total };
  }

  /** Mesma validação e vínculo local para criação simples ou criação atômica multicontrato. */
  async criarNaTransacao(manager: EntityManager, contratoId: string, dto: CreateAtividadeDto,
    ator: UsuarioAutenticado, grupoId: string | null = null) {
    if (dto.contratoId !== contratoId) throw new BadRequestException('Contrato da atividade divergente da URL');
    await this.autorizarMutacao(manager, contratoId, ator, 'registrarAtividades', dto);
    const dataHora = instante(dto.dataHora);
    const entregaveis = await this.verificarEntregaveis(manager, contratoId, dto.entregavelIds);
      await this.validarOcorrencia(manager, contratoId, dto.ocorrenciaId, entregaveis, dto.quantidadeExecucao);
      const idsOcorrencias = dto.ocorrenciaIds ?? (dto.ocorrenciaId ? [dto.ocorrenciaId] : []);
      const ocorrencias = await this.verificarOcorrencias(manager, contratoId, idsOcorrencias,
        entregaveis, dto.ocorrenciaId, dto.quantidadeExecucao);
      if (dto.medicoes) for (const item of dto.medicoes)
        await this.validarOcorrencia(manager, contratoId, item.ocorrenciaId, entregaveis, item.quantidade);
      if (dto.medicoes && dto.quantidadeExecucao != null)
        throw new BadRequestException('Não misture a medição única legada com quantidades por ocorrência');
      let responsavelSelecionado: Usuario | null = null;
      if (dto.responsavelId) {
        const ids = await this.idsResponsaveis(manager, contratoId, ator);
        if (ids && !ids.includes(dto.responsavelId)) throw new ForbiddenException('Responsável não pertence ao contexto autorizado do contrato');
        responsavelSelecionado = await manager.findOneBy(Usuario, { id:dto.responsavelId, ativo:true });
        if (!responsavelSelecionado) throw new BadRequestException('Responsável indisponível');
      }
      const registro = manager.create(AtividadeEntity, {
        contratoId, atividadeCompartilhadaId: grupoId, titulo: dto.titulo.trim(), dataHora, descricao: dto.descricao.trim(), tipo: dto.tipo.trim(),
        responsavelId: responsavelSelecionado?.id ?? (dto.responsavel?.trim() ? null : ator.id), responsavel: responsavelSelecionado ? (responsavelSelecionado.nome || responsavelSelecionado.email) : (dto.responsavel?.trim() || ator.nome || ator.email),
        participantes: dto.participantes ?? [], local: dto.local?.trim() || null,
        duracao: dto.duracao?.trim() || null, observacoes: dto.observacoes?.trim() || null, entregaveis, ocorrencias, ocorrenciaId: dto.ocorrenciaId ?? null,
        quantidadeExecucao: dto.quantidadeExecucao ?? null,
      });
      const salvo = await manager.save(AtividadeEntity, registro);
      await this.salvarMedicoes(manager, contratoId, salvo.id, dto.medicoes, ocorrencias);
      if(dto.referenciaQuantitativa||dto.ocorrenciaReferenciaId){
        const o=ocorrencias.find(oc=>oc.id===dto.ocorrenciaReferenciaId);
        if(!o||!dto.referenciaQuantitativa||grupoId||dto.quantidadeExecucao!=null||dto.percentualExecucao||dto.comprovaExecucaoId||dto.medicoes?.some(item=>item.ocorrenciaId===o.id&&milesimos(item.quantidade)>0n))throw new BadRequestException('Selecione uma execução quantitativa existente, sem acrescentar unidades.');
        const fontes=await listarExecucoesQuantitativas(manager,contratoId,[o.id]);
        if(!fontes.some(f=>f.referencia===dto.referenciaQuantitativa&&f.ocorrenciaId===o.id))throw new ConflictException('A execução referenciada não está reconhecida nesta ocorrência.');
        await manager.query(`INSERT INTO atividade_ocorrencia_medicoes(atividade_id,ocorrencia_id,contrato_id,quantidade,referencia_execucao) VALUES ($1,$2,$3,0,$4) ON CONFLICT (atividade_id,ocorrencia_id) DO UPDATE SET referencia_execucao=EXCLUDED.referencia_execucao`,[salvo.id,o.id,contratoId,dto.referenciaQuantitativa]);
      }
      if(dto.medicoesDiretas?.length){
        await exigirPermissaoParcela(manager,contratoId,ator);
        if(new Set(dto.medicoesDiretas.map(d=>d.entregavelId)).size!==dto.medicoesDiretas.length)throw new BadRequestException('Informe cada destino quantitativo uma vez.');
        for(const d of dto.medicoesDiretas){
          const e=entregaveis.find(e=>e.id===d.entregavelId);
          if(!e||e.tipo!=='QUANTITATIVO'||!e.unidadeMedida||!(milesimos(e.quantidadePrevista)>0n)||milesimos(e.quantidadeRealizada??0)!==0n||!/^\d{1,15}(?:\.\d{1,3})?$/.test(d.quantidade)||!(milesimos(d.quantidade)>0n))throw new BadRequestException('Informe uma quantidade positiva em entregável quantitativo vinculado, sem medição legada.');
          const existentes=await manager.query(`SELECT 1 FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND substituida_em IS NULL LIMIT 1`,[contratoId,e.id]);
          if(existentes.length)throw new ConflictException('Registre a quantidade nas ocorrências existentes.');
          await manager.query(`INSERT INTO atividade_entregavel_medicoes(atividade_id,entregavel_id,contrato_id,quantidade) VALUES($1,$2,$3,$4)`,[salvo.id,e.id,contratoId,d.quantidade]);
          if(!e.quantidadeDiretaIntegrada){await manager.update(Entregavel,{id:e.id,contratoId},{quantidadeDiretaIntegrada:true});e.quantidadeDiretaIntegrada=true;}
        }
      }
      for(const d of dto.medicoesDiretas??[]){const e=entregaveis.find(e=>e.id===d.entregavelId);if(e)await exigirSaldoQuantidadeDireta(manager,e);}
      for(const o of ocorrencias)if(dto.medicoes?.some(d=>d.ocorrenciaId===o.id)||salvo.ocorrenciaId===o.id&&dto.quantidadeExecucao!=null)await exigirSaldoQuantidadeOcorrencia(manager,o);
      const parcelasNovas=[];
      if(dto.parcelasPercentuais?.length){
        if(dto.percentualExecucao!==undefined||dto.entregavelExecucaoId||dto.comprovaExecucaoId||dto.referenciaQuantitativa||dto.quantidadeExecucao!=null)throw new BadRequestException('Não misture modalidades de declaração.');
        if(new Set(dto.parcelasPercentuais.map(p=>p.entregavelId)).size!==dto.parcelasPercentuais.length)throw new BadRequestException('Informe cada destino percentual uma vez.');
        for(const p of dto.parcelasPercentuais){
          const alvo=entregaveis.find(e=>e.id===p.entregavelId);
          if(!alvo||(p.ocorrenciaId&&!ocorrencias.some(o=>o.id===p.ocorrenciaId))||dto.medicoes?.some(m=>m.ocorrenciaId===p.ocorrenciaId&&milesimos(m.quantidade)>0n))throw new BadRequestException('Vincule o entregável e a ocorrência antes de declarar sua parcela.');
          parcelasNovas.push(await criarParcela(manager,alvo,ator,{origem:'ATIVIDADE',origemId:salvo.id,ocorrenciaId:p.ocorrenciaId,valor:p.percentual,data:hojeCivil(dataHora),observacao:dto.observacoes}));
        }
      }
      let parcela = null;
      if(dto.percentualExecucao!==undefined||dto.comprovaExecucaoId||dto.entregavelExecucaoId){
        const alvo=entregaveis.find(e=>e.id===dto.entregavelExecucaoId);
        if(!alvo||(grupoId&&dto.comprovaExecucaoId)||dto.quantidadeExecucao!=null||dto.medicoes?.some(m=>m.ocorrenciaId===dto.ocorrenciaExecucaoId&&milesimos(m.quantidade)>0n)||(dto.ocorrenciaExecucaoId&&!ocorrencias.some(o=>o.id===dto.ocorrenciaExecucaoId)&&salvo.ocorrenciaId!==dto.ocorrenciaExecucaoId))throw new BadRequestException('Selecione uma única fonte percentual e o entregável correspondente.');
        parcela=await criarParcela(manager,alvo,ator,{origem:'ATIVIDADE',origemId:salvo.id,ocorrenciaId:dto.ocorrenciaExecucaoId,valor:dto.percentualExecucao,referenciaId:dto.comprovaExecucaoId,data:hojeCivil(dataHora),observacao:dto.observacoes});
      }
      for (const id of new Set([salvo.ocorrenciaId, ...ocorrencias.map(o => o.id)])) await this.recalcularOcorrencia(manager, id, ator);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.ATIVIDADE_CRIADA, entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosPosteriores: { ...resumo(salvo), ...(dto.medicoes!==undefined?{medicoes:dto.medicoes.map(m=>({ocorrenciaId:m.ocorrenciaId,quantidade:m.quantidade}))}:{}), ...(parcela?{parcelaExecucao:snapshotParcela(parcela)}:{}), ...(parcelasNovas.length?{parcelasPercentuais:parcelasNovas.map(snapshotParcela)}:{}), ...(dto.medicoesDiretas?.length?{medicoesDiretas:snapshotMedicoesDiretas(dto.medicoesDiretas)}:{}), ...(dto.referenciaQuantitativa?{referenciaQuantitativa:dto.referenciaQuantitativa,ocorrenciaReferenciaId:dto.ocorrenciaReferenciaId}:{}) },
      } };
  }

  async create(contratoId: string, dto: CreateAtividadeDto, ator: UsuarioAutenticado) {
    if (dto.contratoId !== contratoId) throw new BadRequestException('Contrato da atividade divergente da URL');
    return this.auditoria.executarComAuditoria(ator,
      manager => this.criarNaTransacao(manager, contratoId, dto, ator));
  }

  async findAllPaginated(contratoId: string, filtros: Record<string, string>) {
    if(filtros.diario==='1') return this.repo.manager.transaction('REPEATABLE READ',m=>this.consultarPaginado(m.getRepository(AtividadeEntity),contratoId,filtros));
    return this.consultarPaginado(this.repo,contratoId,filtros);
  }

  private async consultarPaginado(repo:Repository<AtividadeEntity>,contratoId:string,filtros:Record<string,string>) {
    if (Object.values(filtros).some(v=>typeof v!=='string')) throw new BadRequestException('Filtro inválido');
    const [pagina, limite] = erroQuery(filtros.page, filtros.limit);
    const query = repo.createQueryBuilder('atividade')
      .leftJoinAndSelect('atividade.entregaveis', 'entregaveis')
      .leftJoinAndSelect('atividade.ocorrencias', 'ocorrencias')
      .where('atividade.contratoId = :contratoId', { contratoId })
      .andWhere('atividade.excluidaEm IS NULL');
    const busca = filtros.busca?.trim();
    if (busca) {
      if (busca.length > 120) throw new BadRequestException('Pesquisa limitada a 120 caracteres');
      // Busca literal, parametrizada e anterior à paginação. Não interpretar % ou _ como curingas.
      query.andWhere(`(strpos(lower(atividade.titulo), lower(:busca)) > 0 OR strpos(lower(atividade.descricao), lower(:busca)) > 0 OR strpos(lower(COALESCE(atividade.responsavel,'')), lower(:busca)) > 0)`, { busca });
    }
    if (filtros.tipo) query.andWhere('atividade.tipo = :tipo', { tipo: filtros.tipo });
    if (filtros.dataInicio) {
      if (!validoDia(filtros.dataInicio)) throw new BadRequestException('Data inicial inválida');
      query.andWhere('atividade.dataHora >= :inicio', { inicio: inicioDiaCivilUtc(filtros.dataInicio).toISOString() });
    }
    if (filtros.dataFim) {
      if (!validoDia(filtros.dataFim)) throw new BadRequestException('Data final inválida');
      query.andWhere('atividade.dataHora < :fimExclusivo', { fimExclusivo: inicioDiaCivilUtc(proximoDiaCivil(filtros.dataFim)).toISOString() });
    }
    if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) {
      throw new BadRequestException('Intervalo invertido');
    }
    if (filtros.responsavelId) {
      if (!uuidValido(filtros.responsavelId)) throw new BadRequestException('Responsável inválido');
      query.andWhere('atividade.responsavelId = :responsavelId', { responsavelId: filtros.responsavelId });
    }
    if (filtros.etapaId) {
      if (!uuidValido(filtros.etapaId)) throw new BadRequestException('Etapa inválida');
      // Vinculo por etapa sem remover os demais entregaveis N:N da atividade.
      query.andWhere(`EXISTS (
        SELECT 1 FROM "atividade_entregaveis" vinculo_etapa
        JOIN "entregaveis" entregavel_etapa ON entregavel_etapa.id = vinculo_etapa."entregavelId"
        WHERE vinculo_etapa."atividadeId" = atividade.id
          AND entregavel_etapa."etapa_id" = :etapaId
          AND entregavel_etapa."contrato_id" = :contratoId
      )`, { etapaId: filtros.etapaId });
    }
    if (filtros.ocorrenciaId) {
      if (!uuidValido(filtros.ocorrenciaId)) throw new BadRequestException('Ocorrência inválida');
      query.andWhere(`(atividade.ocorrenciaId = :ocorrenciaId OR EXISTS (
        SELECT 1 FROM "atividade_ocorrencias" ao WHERE ao."atividadeId"=atividade.id AND ao."ocorrenciaId"=:ocorrenciaId
      ))`, { ocorrenciaId: filtros.ocorrenciaId });
    }
    if (filtros.entregavelId) {
      if (!uuidValido(filtros.entregavelId)) throw new BadRequestException('Entregável inválido');
      // EXISTS filtra a atividade sem reduzir os demais vínculos carregados pelo leftJoinAndSelect.
      query.andWhere(`EXISTS (SELECT 1 FROM "atividade_entregaveis" vinculo
        WHERE vinculo."atividadeId" = atividade.id AND vinculo."entregavelId" = :entregavelId)`,
      { entregavelId: filtros.entregavelId });
    }
    const responsavel = filtros.responsavel?.trim();
    if (responsavel) {
      if (responsavel.length > 254) throw new BadRequestException('Responsável limitado a 254 caracteres');
      query.andWhere(`strpos(lower(COALESCE(atividade.responsavel,'')),lower(:responsavel)) > 0`, { responsavel });
    }
    // Existência de vínculos/contribuições, não estado de reconhecimento físico.
    // Consultar antes de paginar e não multiplicar atividades com joins 1:N.
    const evidencias = `EXISTS (SELECT 1 FROM atividade_comprovantes ac JOIN comprovantes_evidencia c ON c.id=ac.comprovante_id AND c.contrato_id=ac.contrato_id JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
      WHERE ac.atividade_id=atividade.id AND ac.contrato_id=:contratoId AND ev.arquivado_em IS NULL
      AND EXISTS(SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=atividade.id AND ae."entregavelId"=c.entregavel_id)
      AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)))`;
    const execucao = `(EXISTS (SELECT 1 FROM execucoes_entregavel ex
      WHERE ex.origem='ATIVIDADE' AND ex.origem_id=atividade.id AND ex.contrato_id=:contratoId
        AND ex.referencia_id IS NULL AND ex.centesimos>0)
      OR EXISTS (SELECT 1 FROM atividade_entregavel_medicoes dm WHERE dm.atividade_id=atividade.id AND dm.contrato_id=:contratoId)
      OR EXISTS (SELECT 1 FROM atividade_ocorrencia_medicoes am
        WHERE am.atividade_id=atividade.id AND am.contrato_id=:contratoId
          AND am.referencia_execucao IS NULL AND am.quantidade>0)
      OR (atividade.quantidadeExecucao>0 AND atividade.ocorrenciaId IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM atividade_ocorrencia_medicoes am
          WHERE am.atividade_id=atividade.id AND am.contrato_id=:contratoId
            AND am.ocorrencia_id=atividade.ocorrenciaId)))`;
    for (const [valor, expressao] of [[filtros.comEvidencias,evidencias],[filtros.comExecucao,execucao]]) {
      if (!valor) continue;
      if (valor !== 'sim' && valor !== 'nao') throw new BadRequestException('Filtro de presença inválido');
      query.andWhere(valor === 'sim' ? expressao : `NOT (${expressao})`);
    }
    const consultaContagens = filtros.diario === '1' ? query.clone() : null;
    if (filtros.status === 'TODAS_ATUAIS') query.andWhere('atividade.status != :arquivada', { arquivada: 'ARQUIVADA' });
    else if (filtros.status) {
      // Ativas reúne apenas atividades ainda em execução. Solicitações pendentes
      // possuem aba própria e não são atividades verificadas.
      if (filtros.status === 'ATIVAS') {
        query.andWhere('atividade.status = :statusAtivo', { statusAtivo: 'REGISTRADA' });
      } else {
        if (!['REGISTRADA', 'PENDENTE_CONCLUSAO', 'VERIFICADA', 'ARQUIVADA'].includes(filtros.status)) {
          throw new BadRequestException('Status inválido');
        }
        query.andWhere('atividade.status = :status', { status: filtros.status });
      }
    }
    const ordem = filtros.ordem || 'recentes';
    if (!['recentes','antigas','duracao-desc','duracao-asc'].includes(ordem)) throw new BadRequestException('Ordenação inválida');
    if (ordem.startsWith('duracao-')) {
      // A duração legada é texto livre. Somente formatos inequívocos em horas/minutos entram na ordenação;
      // valores ausentes ou não interpretáveis ficam por último, sem converter o dado armazenado.
      const duracao = `lower(trim(COALESCE(atividade.duracao,'')))`;
      const horas = `[0-9]{1,8}[[:space:]]*(h|hora|horas)`;
      const minutos = `[0-9]{1,8}[[:space:]]*(m|min|minuto|minutos)`;
      const expressao = `CASE WHEN ${duracao} ~ '^(${horas})([[:space:]]*${minutos})?$|^${minutos}$' THEN COALESCE(substring(${duracao} from '([0-9]{1,8})[[:space:]]*h')::numeric,0)*60 + COALESCE(substring(${duracao} from '([0-9]{1,8})[[:space:]]*m')::numeric,0) END`;
      query.addSelect(expressao, 'duracao_minutos').orderBy('duracao_minutos', ordem === 'duracao-desc' ? 'DESC' : 'ASC', 'NULLS LAST').addOrderBy('atividade.dataHora', 'DESC');
    } else query.orderBy('atividade.dataHora', ordem === 'antigas' ? 'ASC' : 'DESC');
    const [data, total] = await query.addOrderBy('atividade.id', 'DESC').skip((pagina - 1) * limite).take(limite).getManyAndCount();
    const meta = { total, page: pagina, limit: limite, lastPage: Math.ceil(total / limite) || 1 };
    if (filtros.diario !== '1') return { data, meta };
    // O diário usa a mesma fonte de reconhecimento dos lançamentos, sem somar unidades de destinos diferentes.
    const ids = data.map(a => a.id);
    const contagens: {status:string; total:number}[] = consultaContagens ? await consultaContagens
      .select('atividade.status','status').addSelect('COUNT(DISTINCT atividade.id)::int','total')
      .groupBy('atividade.status').getRawMany() : [];
    const comprovantes: {atividadeId:string;total:number;historicos:number}[] = ids.length ? await repo.manager.query(`SELECT ac.atividade_id AS "atividadeId",count(DISTINCT ac.comprovante_id)::int AS historicos,
      count(DISTINCT ac.comprovante_id) FILTER(WHERE ev.arquivado_em IS NULL AND EXISTS(SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=ac.atividade_id AND ae."entregavelId"=c.entregavel_id) AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)))::int AS total
      FROM atividade_comprovantes ac JOIN comprovantes_evidencia c ON c.id=ac.comprovante_id AND c.contrato_id=ac.contrato_id JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
      WHERE ac.contrato_id=$1 AND ac.atividade_id=ANY($2::uuid[]) GROUP BY ac.atividade_id`, [contratoId, ids]) : [];
    const entregaveis = [...new Map(data.flatMap(a => a.entregaveis).map(e => [e.id,e])).values()];
    const ocorrencias = [...new Map(data.flatMap(a => a.ocorrencias ?? []).map(o => [o.id,o])).values()];
    const faltantes = [...new Set(data.flatMap(a=>a.ocorrenciaId&&!ocorrencias.some(o=>o.id===a.ocorrenciaId)?[a.ocorrenciaId]:[]))];
    if(faltantes.length) ocorrencias.push(...await repo.manager.findBy(Ocorrencia,{contratoId,id:In(faltantes)}));
    // Também preservar o vínculo quantitativo legado anterior à tabela N:N.
    const idsOcorrencias = [...new Set([...ocorrencias.map(o=>o.id), ...data.flatMap(a=>a.ocorrenciaId?[a.ocorrenciaId]:[])])];
    const [medicoes, reconhecidas, percentuais] = await Promise.all([
      listarContribuicoesQuantitativas(repo.manager,contratoId,idsOcorrencias),
      listarExecucoesQuantitativas(repo.manager,contratoId,idsOcorrencias),
      Promise.all(entregaveis.filter(e=>e.execucoesIntegradas).map(async e=>({e,linhas:await parcelas(repo.manager,e,ids)}))),
    ]);
    const diretas: {atividadeId:string;entregavelId:string;quantidade:string}[]=entregaveis.some(e=>e.quantidadeDiretaIntegrada)&&ids.length?await repo.manager.query(`SELECT atividade_id AS "atividadeId",entregavel_id AS "entregavelId",quantidade::text FROM atividade_entregavel_medicoes WHERE contrato_id=$1 AND atividade_id=ANY($2::uuid[])`,[contratoId,ids]):[];
    const oPorId = new Map(ocorrencias.map(o=>[o.id,o]));
    const ePorId = new Map(entregaveis.map(e=>[e.id,e]));
    type MedicaoDiario = {id:string;origem:string;ocorrenciaId:string;quantidade:string|null;referenciaExecucao:string|null;situacao:string};
    return { data: data.map(a=>({ ...a,
      ocorrencias:[...new Map([...(a.ocorrencias??[]),...ocorrencias.filter(o=>o.id===a.ocorrenciaId)].map(o=>[o.id,o])).values()],
      comprovantesVinculados:comprovantes.find(c=>c.atividadeId===a.id)?.total??0,
      comprovantesHistoricos:(comprovantes.find(c=>c.atividadeId===a.id)?.historicos??0)-(comprovantes.find(c=>c.atividadeId===a.id)?.total??0),
      contribuicoesDiario:[
        ...diretas.filter(d=>d.atividadeId===a.id).map(d=>({destino:ePorId.get(d.entregavelId)?.nome??'Entregável',entregavelId:d.entregavelId,ocorrenciaId:null,valor:Number(d.quantidade),valorExato:d.quantidade,unidade:ePorId.get(d.entregavelId)?.unidadeMedida??'unidades',situacao:a.status==='VERIFICADA'?'APROVADO':a.status==='ARQUIVADA'?'INATIVO':'PENDENTE',reconhecida:a.status==='VERIFICADA'})),
        ...percentuais.flatMap(({e,linhas})=>linhas.filter(l=>l.origem==='ATIVIDADE'&&l.origemId===a.id&&!l.referenciaId&&l.centesimos>0).map(l=>({destino:e.nome,entregavelId:e.id,ocorrenciaId:l.ocorrenciaId,valor:l.centesimos/100,unidade:'%',situacao:l.situacao,reconhecida:l.reconhecido>0}))),
        ...(medicoes as MedicaoDiario[]).filter(l=>l.origem==='ATIVIDADE'&&l.id===a.id&&!l.referenciaExecucao&&milesimos(l.quantidade)>0n).map(l=>{const o=oPorId.get(l.ocorrenciaId);const e=ePorId.get(o?.entregavelId??'');return {destino:e?.nome??'Ocorrência vinculada',entregavelId:e?.id??null,ocorrenciaId:l.ocorrenciaId,valor:Number(l.quantidade),valorExato:l.quantidade,unidade:e?.unidadeMedida??'unidades',situacao:o?.substituidaEm?'INATIVO':l.situacao,reconhecida:Boolean(o&&!o.substituidaEm)&&reconhecidas.some(r=>r.ocorrenciaId===l.ocorrenciaId&&r.referencia===`atividade:${a.id}`)};})
      ]})), meta: {...meta, contagens} };
  }

  async findOne(contratoId: string, id: string) {
    const registro = await this.repo.findOne({ where: { id, contratoId, excluidaEm: IsNull() }, relations: { entregaveis: true, ocorrencias: true } });
    if (!registro) throw new NotFoundException('Atividade não encontrada');
    const medidas: Array<{ocorrenciaId:string;quantidade:string;referenciaExecucao?:string|null}> = await this.repo.manager.query(
      `SELECT ocorrencia_id AS "ocorrenciaId",quantidade::text AS quantidade, referencia_execucao AS "referenciaExecucao"
       FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2`,[id,contratoId]);
    const legado = registro.ocorrenciaId && registro.quantidadeExecucao != null &&
      !medidas.some(m=>m.ocorrenciaId===registro.ocorrenciaId)
      ? [{ocorrenciaId:registro.ocorrenciaId,quantidade:String(registro.quantidadeExecucao)}] : [];
    const medicoesDiretas=registro.entregaveis.some(e=>e.quantidadeDiretaIntegrada)?await this.repo.manager.query(`SELECT entregavel_id AS "entregavelId",quantidade::text FROM atividade_entregavel_medicoes WHERE contrato_id=$1 AND atividade_id=$2`,[contratoId,id]):[];
    const parcelasAtividade=registro.entregaveis.some(e=>e.execucoesIntegradas)?await this.repo.manager.findBy(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id}):[];
    const parcelasPercentuais=parcelasAtividade.filter(p=>!p.referenciaId).map(p=>({entregavelId:p.entregavelId,ocorrenciaId:p.ocorrenciaId??undefined,percentual:(p.centesimos/100).toFixed(2)}));
    return Object.assign({}, registro, { medicoes:[...medidas.map(({ocorrenciaId,quantidade})=>({ocorrenciaId,quantidade})),...legado],medicoesDiretas,parcelasPercentuais,
      referenciasQuantitativas:medidas.filter(m=>m.referenciaExecucao).map(m=>({ocorrenciaId:m.ocorrenciaId,referencia:m.referenciaExecucao})),
      referenciasPercentuais:parcelasAtividade.filter(p=>p.referenciaId).map(p=>({id:p.id,entregavelId:p.entregavelId,ocorrenciaId:p.ocorrenciaId,referenciaId:p.referenciaId})) });
  }

  async editarReferencias(contratoId:string,id:string,dto:EditarReferenciasAtividadeDto,ator:UsuarioAutenticado) {
    return this.auditoria.executarComAuditoria(ator, async m=>{
      await this.autorizarMutacao(m,contratoId,ator,'editarAtividades');
      if(dto.quantitativas!==undefined) await exigirPermissaoTransacional(m,contratoId,ator,'vincularAtividadesOcorrencia');
      if(dto.percentuais!==undefined) await exigirPermissaoTransacional(m,contratoId,ator,'editarExecucaoFisica');
      if(dto.quantitativas===undefined&&dto.percentuais===undefined)throw new BadRequestException('Informe as referências que deseja alterar.');
      await m.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      const bloqueada=await m.findOne(AtividadeEntity,{where:{id,contratoId},lock:{mode:'pessimistic_write'}});
      if(!bloqueada||bloqueada.excluidaEm)throw new NotFoundException('Atividade não encontrada');
      const a=await m.findOne(AtividadeEntity,{where:{id,contratoId},relations:{entregaveis:true,ocorrencias:true}});
      if(!a||a.status!=='REGISTRADA')throw new ConflictException('Reabra a atividade antes de corrigir suas referências.');
      if(a.atividadeCompartilhadaId&&(dto.quantitativas?.length||dto.percentuais?.length))throw new ConflictException('Referências de comprovação devem ser declaradas em uma atividade local.');
      await this.verificarEntregaveis(m,contratoId,a.entregaveis.map(e=>e.id));
      const ids=[...new Set([...(a.ocorrencias??[]).map(o=>o.id),...(a.ocorrenciaId?[a.ocorrenciaId]:[])])];
      await this.verificarOcorrencias(m,contratoId,ids,a.entregaveis,a.ocorrenciaId,a.quantidadeExecucao);
      const medidas=await m.query(`SELECT ocorrencia_id AS "ocorrenciaId", quantidade::text AS quantidade, referencia_execucao AS referencia FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 ORDER BY ocorrencia_id FOR UPDATE`,[id,contratoId]) as {ocorrenciaId:string;quantidade:string;referencia:string|null}[];
      const ps=await m.findBy(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id});
      const antes={quantitativas:medidas.filter(v=>v.referencia),percentuais:ps.filter(p=>p.referenciaId).map(snapshotParcela)};
      if(dto.quantitativas!==undefined){
        const fontes=await listarExecucoesQuantitativas(m,contratoId,[...new Set(dto.quantitativas.map(v=>v.ocorrenciaId))]);
        for(const v of dto.quantitativas){
          if(!ids.includes(v.ocorrenciaId)||v.referencia===`atividade:${id}`||!fontes.some(f=>f.ocorrenciaId===v.ocorrenciaId&&f.referencia===v.referencia&&milesimos(f.quantidade)>0n))throw new ConflictException('Selecione uma execução quantitativa reconhecida de uma ocorrência vinculada.');
          if(a.ocorrenciaId===v.ocorrenciaId&&milesimos(a.quantidadeExecucao)>0n||medidas.some(d=>d.ocorrenciaId===v.ocorrenciaId&&milesimos(d.quantidade)>0n)||ps.some(p=>p.ocorrenciaId===v.ocorrenciaId&&p.centesimos>0))throw new ConflictException('Não acumule comprovação referenciada e nova execução na mesma ocorrência.');
        }
        for(const anterior of medidas.filter(v=>v.referencia))if(!dto.quantitativas.some(v=>v.ocorrenciaId===anterior.ocorrenciaId&&v.referencia===anterior.referencia))await m.query(`DELETE FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 AND ocorrencia_id=$3 AND referencia_execucao IS NOT NULL`,[id,contratoId,anterior.ocorrenciaId]);
        for(const v of dto.quantitativas)if(!medidas.some(d=>d.ocorrenciaId===v.ocorrenciaId&&d.referencia===v.referencia))await m.query(`INSERT INTO atividade_ocorrencia_medicoes(atividade_id,ocorrencia_id,contrato_id,quantidade,referencia_execucao) VALUES($1,$2,$3,0,$4) ON CONFLICT (atividade_id,ocorrencia_id) DO UPDATE SET referencia_execucao=EXCLUDED.referencia_execucao`,[id,v.ocorrenciaId,contratoId,v.referencia]);
      }
      if(dto.percentuais!==undefined){
        for(const p of ps.filter(p=>p.referenciaId))if(!dto.percentuais.some(v=>v.entregavelId===p.entregavelId&&(v.ocorrenciaId??null)===p.ocorrenciaId&&v.referenciaId===p.referenciaId)){
          if(await m.count(ExecucaoLancamento,{where:{referenciaId:p.id}}))throw new ConflictException('Regularize as comprovações dependentes antes de retirar a referência.');
          await m.delete(ExecucaoLancamento,{id:p.id,contratoId});
        }
        for(const v of dto.percentuais){
          const e=a.entregaveis.find(x=>x.id===v.entregavelId);
          if(!e||v.ocorrenciaId&&!ids.includes(v.ocorrenciaId)||ps.some(p=>p.entregavelId===v.entregavelId&&p.centesimos>0))throw new ConflictException('Vincule o destino sem adicionar execução duplicada.');
          const ocorrencia=await exigirOcorrenciaParcela(m,e,v.ocorrenciaId);
          if((ocorrencia?.id??null)!==(v.ocorrenciaId??null))throw new ConflictException('O destino percentual não corresponde à configuração vigente.');
          if(!ps.some(p=>p.entregavelId===v.entregavelId&&(v.ocorrenciaId??null)===p.ocorrenciaId&&p.referenciaId===v.referenciaId))await criarParcela(m,e,ator,{origem:'ATIVIDADE',origemId:id,referenciaId:v.referenciaId,ocorrenciaId:v.ocorrenciaId,data:hojeCivil(a.dataHora)});
        }
      }
      await this.validarReferenciasNaDecisao(m,a);
      await this.exigirExecucaoSemDuplicidade(m,contratoId,id);
      for(const oid of ids)await this.recalcularOcorrencia(m,oid,ator);
      const posteriores=await m.query(`SELECT ocorrencia_id AS "ocorrenciaId", quantidade::text AS quantidade, referencia_execucao AS referencia FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 AND referencia_execucao IS NOT NULL ORDER BY ocorrencia_id`,[id,contratoId]);
      const parcelasAtuais=(await m.findBy(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id})).filter(p=>p.referenciaId).map(snapshotParcela);
      return {resultado:{atualizada:true},evento:{acao:AcaoAuditoria.ATIVIDADE_EDITADA,entidadeTipo:'ATIVIDADE' as const,entidadeId:id,dadosAnteriores:antes,dadosPosteriores:{quantitativas:posteriores,percentuais:parcelasAtuais}}};
    });
  }

  async update(contratoId: string, id: string, dto: UpdateAtividadeDto, ator: UsuarioAutenticado) {
    return this.auditoria.executarComAuditoria(ator, manager => this.editarNaTransacao(manager,contratoId,id,dto,ator));
  }

  async editarNaTransacao(manager:EntityManager,contratoId:string,id:string,dto:UpdateAtividadeDto,ator:UsuarioAutenticado){
      await this.autorizarMutacao(manager, contratoId, ator, 'editarAtividades', dto);
      const contrato = await manager.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) throw new ConflictException('Reabra ou retome o contrato antes de alterar atividades');
      // PostgreSQL não permite FOR UPDATE sobre o lado opcional de LEFT JOIN.
      // Bloqueamos APENAS a atividade e lemos os vínculos na mesma transação.
      const bloqueada = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, lock: { mode: 'pessimistic_write' },
      });
      if (!bloqueada || bloqueada.excluidaEm) throw new NotFoundException('Atividade não encontrada');
      const registro = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, relations: { entregaveis: true, ocorrencias: true },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
      await this.validarOcorrencia(manager, contratoId, registro.ocorrenciaId, registro.entregaveis, registro.quantidadeExecucao);
      for (const secundaria of registro.ocorrencias ?? []) if (secundaria.id !== registro.ocorrenciaId)
        await this.validarOcorrencia(manager, contratoId, secundaria.id, registro.entregaveis);
      if (dto.dataHora !== undefined && instante(dto.dataHora).getTime() !== registro.dataHora.getTime() && registro.entregaveis.some(e=>e.execucoesIntegradas)) {
        if (await manager.count(ExecucaoLancamento, {where:{contratoId,origem:'ATIVIDADE',origemId:id}}))
          await exigirPermissaoParcela(manager,contratoId,ator);
      }
      if (registro.status !== 'REGISTRADA') {
        throw new ConflictException('Atividade verificada ou arquivada não pode ser editada; reabra antes.');
      }
      await this.verificarEntregaveis(manager, contratoId, registro.entregaveis.map(e => e.id));
      const antes = resumo(registro);
      const anteriores = registro.entregaveis.map(e => e.id).sort();
      if(dto.entregavelIds && registro.entregaveis.some(e=>e.quantidadeDiretaIntegrada)){
        const diretas=await manager.query(`SELECT entregavel_id AS "entregavelId" FROM atividade_entregavel_medicoes WHERE atividade_id=$1 AND contrato_id=$2`,[id,contratoId]) as {entregavelId:string}[];
        if(diretas.some(d=>!dto.entregavelIds!.includes(d.entregavelId) && (dto.medicoesDiretas===undefined || dto.medicoesDiretas.some(n=>n.entregavelId===d.entregavelId))))throw new ConflictException('Preserve os vínculos das medições diretas desta atividade.');
      }
      if (dto.entregavelIds && anteriores.some(e=>!dto.entregavelIds!.includes(e))) {
        const vinculados = await manager.query(`SELECT 1 FROM atividade_comprovantes ac JOIN comprovantes_evidencia c ON c.id=ac.comprovante_id AND c.contrato_id=ac.contrato_id JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
          WHERE ac.atividade_id=$1 AND ac.contrato_id=$2 AND NOT(c.entregavel_id=ANY($3::uuid[])) AND ev.arquivado_em IS NULL AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)) LIMIT 1`,[id,contratoId,dto.entregavelIds]);
        if (vinculados.length) throw new ConflictException('Desvincule os comprovantes vigentes dos entregáveis removidos antes de salvar.');
      }
      const ocorrenciasAnteriores = (registro.ocorrencias ?? []).map(o => o.id);
      const primariaAnterior = registro.ocorrenciaId;
      const idsAnteriores = [...new Set([...ocorrenciasAnteriores, ...(primariaAnterior ? [primariaAnterior] : [])])];
      const idsSolicitados = dto.ocorrenciaIds ?? (dto.ocorrenciaId !== undefined ? [...new Set([...idsAnteriores.filter(id => id !== primariaAnterior), ...(dto.ocorrenciaId ? [dto.ocorrenciaId] : [])])] : idsAnteriores);
      if(registro.entregaveis.some(e=>e.execucoesIntegradas)) {
        const parcelasAtividade=await manager.findBy(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id});
        if(parcelasAtividade.some(parcela=>(dto.parcelasPercentuais===undefined || parcela.referenciaId!=null)&&((parcela.ocorrenciaId && !idsSolicitados.includes(parcela.ocorrenciaId)) || (dto.entregavelIds && !dto.entregavelIds.includes(parcela.entregavelId)) || dto.quantidadeExecucao!=null || dto.medicoes?.some(m=>m.ocorrenciaId===parcela.ocorrenciaId&&milesimos(m.quantidade)>0n)))) throw new ConflictException('Preserve o vínculo e a modalidade da execução integrada desta atividade.');
      }
      const alteraMedicaoOuVinculo = dto.ocorrenciaIds !== undefined || dto.ocorrenciaId !== undefined ||
        dto.medicoes !== undefined || dto.quantidadeExecucao !== undefined;
      // Bloqueio das linhas dentro da mesma transação: nenhuma medição pode ficar órfã
      // depois de retirar uma associação N:N. O cliente pode substituir explicitamente
      // o conjunto de medições, mas nunca removê-lo de forma implícita.
      const medicoesAnteriores: Array<{ ocorrenciaId: string; quantidade: string }> = alteraMedicaoOuVinculo
        ? await manager.query(`SELECT ocorrencia_id AS "ocorrenciaId", quantidade::text AS quantidade, referencia_execucao AS "referenciaExecucao"
            FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2
            ORDER BY ocorrencia_id FOR UPDATE`, [id, contratoId]) : [];
      const idsNovos = new Set(idsSolicitados);
      if (dto.medicoes === undefined && medicoesAnteriores.some(m => !idsNovos.has(m.ocorrenciaId)))
        throw new ConflictException('Há medições em ocorrências removidas. Atualize explicitamente as medições antes de desvincular.');
      if (dto.ocorrenciaId !== undefined && dto.ocorrenciaId !== primariaAnterior &&
          registro.quantidadeExecucao != null && dto.quantidadeExecucao === undefined && dto.medicoes === undefined)
        throw new ConflictException('Alterar a ocorrência principal transferiria quantidade sem autorização explícita. Informe quantidadeExecucao ou medicoes.');

      // Se há substituição explícita por medições individuais, a quantidade legada
      // será limpa na mesma transação; valide o estado FINAL, não o antigo.
      if(dto.quantidadeExecucao!=null){
        if(medicoesAnteriores.length)throw new ConflictException('A atividade já possui medições individuais; atualize essas medições em vez da quantidade legada.');
      }
      const quantidadeFinal = dto.medicoes !== undefined ? null :
        (dto.quantidadeExecucao === undefined ? registro.quantidadeExecucao : dto.quantidadeExecucao);
      if (dto.entregavelIds !== undefined || dto.ocorrenciaId !== undefined || dto.ocorrenciaIds !== undefined) {
        registro.entregaveis = await this.verificarEntregaveis(manager, contratoId, dto.entregavelIds ?? anteriores);
        const ocorrenciaId = dto.ocorrenciaId === undefined ? registro.ocorrenciaId : dto.ocorrenciaId;
        await this.validarOcorrencia(manager, contratoId, ocorrenciaId, registro.entregaveis, quantidadeFinal);
        if (dto.ocorrenciaId !== undefined) registro.ocorrenciaId = dto.ocorrenciaId;
      }
      registro.ocorrencias = await this.verificarOcorrencias(manager, contratoId, idsSolicitados,
        registro.entregaveis, registro.ocorrenciaId, quantidadeFinal);
      if (dto.medicoes && dto.quantidadeExecucao != null)
        throw new BadRequestException('Não misture a medição legada com quantidades por ocorrência');
      if (dto.quantidadeExecucao !== undefined) registro.quantidadeExecucao = dto.quantidadeExecucao;
      if (dto.medicoes !== undefined) {
        for (const item of dto.medicoes)
          await this.validarOcorrencia(manager, contratoId, item.ocorrenciaId, registro.entregaveis, item.quantidade);
        registro.quantidadeExecucao = null;
      }
      if (!registro.ocorrenciaId && registro.quantidadeExecucao != null) throw new BadRequestException('Quantidade de execução exige ocorrência vinculada');
      await this.validarOcorrencia(manager, contratoId, registro.ocorrenciaId, registro.entregaveis, registro.quantidadeExecucao);
      for (const secundaria of registro.ocorrencias ?? []) if (secundaria.id !== registro.ocorrenciaId)
        await this.validarOcorrencia(manager, contratoId, secundaria.id, registro.entregaveis);
      if (dto.titulo !== undefined) registro.titulo = dto.titulo.trim();
      if (dto.dataHora !== undefined) registro.dataHora = instante(dto.dataHora);
      if (dto.descricao !== undefined) registro.descricao = dto.descricao.trim();
      if (dto.tipo !== undefined) registro.tipo = dto.tipo.trim();
      if (dto.responsavelId !== undefined) {
        if (dto.responsavelId === null) { registro.responsavelId=null; registro.responsavel=dto.responsavel?.trim() || null; }
        else if (dto.responsavelId !== registro.responsavelId) {
          const ids = await this.idsResponsaveis(manager, contratoId, ator);
          if (ids && !ids.includes(dto.responsavelId)) throw new ForbiddenException('Responsável não pertence ao contexto autorizado do contrato');
          const selecionado = await manager.findOneBy(Usuario,{id:dto.responsavelId,ativo:true});
          if (!selecionado) throw new BadRequestException('Responsável indisponível');
          registro.responsavelId=selecionado.id; registro.responsavel=selecionado.nome || selecionado.email;
        }
      } else if (dto.responsavel !== undefined && dto.responsavel.trim() !== (registro.responsavel ?? '')) {
        // Texto livre não identifica uma conta; não conservar o ID de outro responsável.
        registro.responsavel = dto.responsavel.trim() || null;
        registro.responsavelId = null;
      }
      if (dto.participantes !== undefined) registro.participantes = dto.participantes;
      if (dto.local !== undefined) registro.local = dto.local.trim() || null;
      if (dto.duracao !== undefined) registro.duracao = dto.duracao.trim() || null;
      if (dto.observacoes !== undefined) registro.observacoes = dto.observacoes.trim() || null;
      const salvo = await manager.save(AtividadeEntity, registro);
      let parcelasAnteriores:ExecucaoLancamento[]|undefined;
      let diretasAnteriores:{entregavelId:string;quantidade:string}[]|undefined;
      if(dto.parcelasPercentuais!==undefined||dto.medicoesDiretas!==undefined){
        await exigirPermissaoParcela(manager,contratoId,ator);
        await this.verificarEntregaveis(manager,contratoId,registro.entregaveis.map(e=>e.id));
      }
      if(dto.parcelasPercentuais!==undefined){
        if(registro.quantidadeExecucao!=null && dto.parcelasPercentuais.length) throw new BadRequestException('Não misture a quantidade legada com parcelas percentuais.');
        const medidasVigentes = dto.medicoes ?? (await manager.query(`SELECT ocorrencia_id AS "ocorrenciaId", quantidade::text AS quantidade FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2`,[id,contratoId]) as MedicaoAtividadeDto[]);
        if(dto.parcelasPercentuais.some(p=>medidasVigentes.some(m=>m.ocorrenciaId===p.ocorrenciaId&&milesimos(m.quantidade)>0n))) throw new BadRequestException('Não misture quantidade e percentual na mesma ocorrência.');
        parcelasAnteriores=await manager.findBy(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id});
        if(parcelasAnteriores.some(p=>p.referenciaId && dto.parcelasPercentuais!.some(n=>n.entregavelId===p.entregavelId)))throw new ConflictException('Uma comprovação referenciada não pode receber nova contribuição no mesmo destino.');
        if(new Set(dto.parcelasPercentuais.map(p=>p.entregavelId)).size!==dto.parcelasPercentuais.length)throw new BadRequestException('Informe cada destino percentual uma vez.');
        for(const nova of dto.parcelasPercentuais){
          centesimos(nova.percentual);
          if(dto.medicoes?.some(m=>m.ocorrenciaId===nova.ocorrenciaId&&milesimos(m.quantidade)>0n)||dto.quantidadeExecucao!=null) throw new BadRequestException('Não misture modalidades de declaração.');
        }
        for(const antiga of parcelasAnteriores){
          if(antiga.referenciaId) continue;
          const nova=dto.parcelasPercentuais.find(p=>p.entregavelId===antiga.entregavelId);
          if(nova&&Math.round(Number(nova.percentual)*100)===antiga.centesimos&&(nova.ocorrenciaId??null)===antiga.ocorrenciaId)continue;
          if(await manager.count(ExecucaoLancamento,{where:{referenciaId:antiga.id}}))throw new ConflictException('Esta execução possui comprovantes referenciados. Regularize os vínculos antes de corrigir.');
          if (nova && (nova.ocorrenciaId??null)===antiga.ocorrenciaId) {
            const alvo=registro.entregaveis.find(e=>e.id===nova.entregavelId);
            if(!alvo || (nova.ocorrenciaId&&!registro.ocorrencias?.some(o=>o.id===nova.ocorrenciaId))) throw new BadRequestException('Vincule o destino da contribuição.');
            const o=await exigirOcorrenciaParcela(manager,alvo,nova.ocorrenciaId);
            if((o?.id??null)!==(nova.ocorrenciaId??null))throw new ConflictException('O destino percentual não corresponde à configuração vigente.');
            await manager.update(ExecucaoLancamento,{id:antiga.id,contratoId},{centesimos:centesimos(nova.percentual),centesimosAprovados:null,decididoPor:null,decididoEm:null,status:'PENDENTE'});
          } else await manager.delete(ExecucaoLancamento,{id:antiga.id,contratoId});
        }
        for(const nova of dto.parcelasPercentuais){
          if(parcelasAnteriores.some(p=>p.entregavelId===nova.entregavelId&&(nova.ocorrenciaId??null)===p.ocorrenciaId))continue;
          const alvo=registro.entregaveis.find(e=>e.id===nova.entregavelId);
          if(!alvo||(nova.ocorrenciaId&&!registro.ocorrencias?.some(o=>o.id===nova.ocorrenciaId)))throw new BadRequestException('Vincule o destino da contribuição.');
          await criarParcela(manager,alvo,ator,{origem:'ATIVIDADE',origemId:id,ocorrenciaId:nova.ocorrenciaId,valor:nova.percentual,data:hojeCivil(registro.dataHora),observacao:registro.observacoes});
        }
      }
      if(dto.medicoesDiretas!==undefined){
        diretasAnteriores=await manager.query(`SELECT entregavel_id AS "entregavelId",quantidade::text FROM atividade_entregavel_medicoes WHERE contrato_id=$1 AND atividade_id=$2`,[contratoId,id]);
        if(new Set(dto.medicoesDiretas.map(p=>p.entregavelId)).size!==dto.medicoesDiretas.length)throw new BadRequestException('Informe cada destino quantitativo uma vez.');
        for(const d of dto.medicoesDiretas){
          const e=registro.entregaveis.find(e=>e.id===d.entregavelId);
          if(!e||e.tipo!=='QUANTITATIVO'||!e.unidadeMedida||!(milesimos(e.quantidadePrevista)>0n)||milesimos(e.quantidadeRealizada??0)!==0n||!/^\d{1,15}(?:\.\d{1,3})?$/.test(d.quantidade)||!(milesimos(d.quantidade)>0n))throw new BadRequestException('Informe quantidade válida em entregável quantitativo vinculado.');
          if(await manager.count(Ocorrencia,{where:{contratoId,entregavelId:e.id,substituidaEm:IsNull()}}))throw new ConflictException('Registre a quantidade nas ocorrências existentes.');
          if(!e.quantidadeDiretaIntegrada){await manager.update(Entregavel,{id:e.id,contratoId},{quantidadeDiretaIntegrada:true});e.quantidadeDiretaIntegrada=true;}
        }
        await manager.query(`DELETE FROM atividade_entregavel_medicoes WHERE contrato_id=$1 AND atividade_id=$2`,[contratoId,id]);
        for(const d of dto.medicoesDiretas)await manager.query(`INSERT INTO atividade_entregavel_medicoes(atividade_id,entregavel_id,contrato_id,quantidade) VALUES($1,$2,$3,$4)`,[id,d.entregavelId,contratoId,d.quantidade]);
      }
      if(dto.dataHora!==undefined && registro.dataHora.toISOString()!==antes.dataHora && registro.entregaveis.some(e=>e.execucoesIntegradas)) {
        await manager.update(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id},{dataExecucao:hojeCivil(registro.dataHora)});
      }
      for(const ent of registro.entregaveis) await validarSaldoParcelas(manager,ent);
      await this.salvarMedicoes(manager, contratoId, salvo.id, dto.medicoes, registro.ocorrencias ?? []);
      for(const d of dto.medicoesDiretas??[]){const e=registro.entregaveis.find(e=>e.id===d.entregavelId);if(e)await exigirSaldoQuantidadeDireta(manager,e);}
      for(const o of registro.ocorrencias??[])if(dto.medicoes?.some(d=>d.ocorrenciaId===o.id)||salvo.ocorrenciaId===o.id&&dto.quantidadeExecucao!=null)await exigirSaldoQuantidadeOcorrencia(manager,o);
      if (alteraMedicaoOuVinculo||dto.parcelasPercentuais!==undefined||dto.medicoesDiretas!==undefined) await this.exigirExecucaoSemDuplicidade(manager,contratoId,salvo.id);
      for (const ocorrenciaId of new Set([...idsAnteriores, ...idsSolicitados, antes.ocorrenciaId, salvo.ocorrenciaId,
        ...medicoesAnteriores.map(m => m.ocorrenciaId)]))
        await this.recalcularOcorrencia(manager, ocorrenciaId, ator);
      const mudouVinculos = JSON.stringify(idsAnteriores.slice().sort()) !== JSON.stringify(idsSolicitados.slice().sort()) || antes.ocorrenciaId !== (salvo.ocorrenciaId ?? null) || JSON.stringify(anteriores) !== JSON.stringify(salvo.entregaveis.map(e => e.id).sort());
      const medicoesPosteriores: Array<{ ocorrenciaId: string; quantidade: string }> = alteraMedicaoOuVinculo
        ? await manager.query(`SELECT ocorrencia_id AS "ocorrenciaId", quantidade::text AS quantidade, referencia_execucao AS "referenciaExecucao"
            FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 ORDER BY ocorrencia_id`,
            [id, contratoId]) : [];
      return { resultado: salvo, evento: {
        acao: mudouVinculos ? AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS : AcaoAuditoria.ATIVIDADE_EDITADA,
        entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: { ...antes, ...(alteraMedicaoOuVinculo ? { medicoes: medicoesAnteriores } : {}), ...(parcelasAnteriores?{parcelasPercentuais:parcelasAnteriores.map(snapshotParcela)}:{}), ...(diretasAnteriores?{medicoesDiretas:diretasAnteriores}:{}) },
        dadosPosteriores: { ...resumo(salvo), ...(alteraMedicaoOuVinculo ? { medicoes: medicoesPosteriores } : {}), ...(dto.parcelasPercentuais!==undefined?{parcelasPercentuais:(await manager.findBy(ExecucaoLancamento,{contratoId,origem:'ATIVIDADE',origemId:id})).map(snapshotParcela)}:{}), ...(dto.medicoesDiretas!==undefined?{medicoesDiretas:snapshotMedicoesDiretas(dto.medicoesDiretas)}:{}) },
      } };
  }

  /** Operação atômica: transição + snapshot de auditoria no MESMO EntityManager. */
  private async transicionarNaTransacao(manager: EntityManager, contratoId: string, id: string, ator: UsuarioAutenticado,
    origem: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA',
    destino: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA',
    acao: AcaoAuditoria, justificativa: string, grupoAutorizado?: string) {
    const motivo = justificativa.trim();
    const permissoes: Partial<Record<AcaoAuditoria, ChavePermissao>> = {
      [AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA]:'editarAtividades',
      [AcaoAuditoria.ATIVIDADE_SOLICITACAO_CANCELADA]:'editarAtividades',
      [AcaoAuditoria.ATIVIDADE_VERIFICADA]:'verificarAtividades',
      [AcaoAuditoria.ATIVIDADE_REABERTA]:'reabrirAtividades',
      [AcaoAuditoria.ATIVIDADE_ARQUIVADA]:'arquivarAtividades',
      [AcaoAuditoria.ATIVIDADE_REATIVADA]:'reativarAtividades',
    };
    const permissao = permissoes[acao];
    if (!permissao) throw new ForbiddenException('Transição de atividade não autorizada');
    if ((![AcaoAuditoria.ATIVIDADE_VERIFICADA, AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA].includes(acao) && motivo.length < 15) || motivo.length > 200 || (motivo && motivo.length < 15)) throw new BadRequestException('Justificativa deve ter entre 15 e 200 caracteres; verificação dispensa motivo');
      if (grupoAutorizado && ![AcaoAuditoria.ATIVIDADE_VERIFICADA,AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA].includes(acao)) throw new ForbiddenException('Decisão compartilhada inválida');
      if (!grupoAutorizado) await this.autorizarMutacao(manager, contratoId, ator, permissao);
      const contrato = await manager.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) throw new ConflictException('Reabra ou retome o contrato antes de alterar atividades');
      // PostgreSQL não permite FOR UPDATE sobre o lado opcional de LEFT JOIN.
      // Bloqueamos APENAS a atividade e lemos os vínculos na mesma transação.
      const bloqueada = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, lock: { mode: 'pessimistic_write' },
      });
      if (!bloqueada || bloqueada.excluidaEm) throw new NotFoundException('Atividade não encontrada');
      const registro = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, relations: { entregaveis: true, ocorrencias: true },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
      if (grupoAutorizado && registro.atividadeCompartilhadaId !== grupoAutorizado) throw new ConflictException('O vínculo compartilhado mudou.');
      await this.validarOcorrencia(manager, contratoId, registro.ocorrenciaId, registro.entregaveis, registro.quantidadeExecucao);
      for (const secundaria of registro.ocorrencias ?? []) if (secundaria.id !== registro.ocorrenciaId)
        await this.validarOcorrencia(manager, contratoId, secundaria.id, registro.entregaveis);
      if (registro.status !== origem) throw new ConflictException(`Transição não permitida a partir de ${registro.status}`);
      // Reabrir uma atividade após concluir seus pais criaria uma pendência
      // invisível em objeto fechado. Exige reabertura prévia do contexto.
      if (registro.entregaveis.length > 0) {
        await this.verificarEntregaveis(manager, contratoId, registro.entregaveis.map(e => e.id));
        if (destino === 'VERIFICADA' || destino === 'PENDENTE_CONCLUSAO') await this.validarReferenciasNaDecisao(manager,registro);
        if (origem === 'VERIFICADA' && destino !== 'VERIFICADA') await this.protegerReferenciasDependentes(manager,registro);
      }
      if (destino==='VERIFICADA' && registro.entregaveis.length) await this.exigirExecucaoSemDuplicidade(manager,contratoId,id);
      const antes = resumo(registro);
      registro.status = destino;
      if (destino === 'PENDENTE_CONCLUSAO') { registro.solicitadaEm=new Date(); registro.solicitadaPor=ator.id; }
      else { registro.solicitadaEm=null; registro.solicitadaPor=null; }
      if (destino === 'REGISTRADA') { registro.verificadaEm = null; registro.verificadaPor=null; }
      if (destino === 'VERIFICADA' && (origem === 'PENDENTE_CONCLUSAO' || Boolean(grupoAutorizado))) { registro.verificadaEm = new Date(); registro.verificadaPor=ator.id; }
      registro.arquivadaEm = destino === 'ARQUIVADA' ? new Date() : null;
      const salvo = await manager.save(AtividadeEntity, registro);
      for(const ent of registro.entregaveis) await validarSaldoParcelas(manager,ent);
      if(destino==='VERIFICADA' && registro.entregaveis.length){const medidas=await manager.query('SELECT ocorrencia_id AS id FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2 AND quantidade>0',[salvo.id,contratoId]) as {id:string}[];const diretas=await manager.query('SELECT entregavel_id AS id FROM atividade_entregavel_medicoes WHERE atividade_id=$1 AND contrato_id=$2 AND quantidade>0',[salvo.id,contratoId]) as {id:string}[];for(const ent of registro.entregaveis)if(diretas.some(d=>d.id===ent.id))await exigirSaldoQuantidadeDireta(manager,ent);for(const o of registro.ocorrencias??[])if(medidas.some(d=>d.id===o.id)||salvo.ocorrenciaId===o.id&&milesimos(salvo.quantidadeExecucao)>0n)await exigirSaldoQuantidadeOcorrencia(manager,o);
        if(salvo.ocorrenciaId&&milesimos(salvo.quantidadeExecucao)>0n&&!(registro.ocorrencias??[]).some(o=>o.id===salvo.ocorrenciaId)){const o=await manager.findOneBy(Ocorrencia,{id:salvo.ocorrenciaId,contratoId});if(o)await exigirSaldoQuantidadeOcorrencia(manager,o);}
      }
      if (destino !== 'VERIFICADA') for (const id of new Set([salvo.ocorrenciaId, ...(salvo.ocorrencias ?? []).map(o => o.id)]))
        await this.recalcularOcorrencia(manager, id, ator);
      return { resultado: salvo, evento: {
        acao, entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: antes, dadosPosteriores: { ...resumo(salvo), ...(grupoAutorizado ? {atividadeCompartilhadaId:grupoAutorizado,decisaoCompartilhada:true} : {}), ...(motivo ? { justificativa: motivo } : {}) },
      },
      // Audita primeiro a verificação e, na mesma transação, conclui os
      // entregáveis que ficaram sem pendências. O contrato nunca fecha sozinho.
      ...(destino === 'VERIFICADA' && registro.entregaveis.length > 0 ? {
        aposEvento: async (m: EntityManager) => {
          // A quantidade só passa a medir execução depois da verificação.
          // Mesmo contrato/transação, sem janela de duplicação entre aprovações.
          for (const ocorrenciaId of new Set([salvo.ocorrenciaId, ...(salvo.ocorrencias ?? []).map(o => o.id)]))
            await this.recalcularOcorrencia(m, ocorrenciaId, ator);
          for(const entrega of salvo.entregaveis)await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,entrega.id);
          // Verificação da atividade inicia o contexto, mas a decisão de
          // conclusão do entregável e da etapa exige solicitação e aprovação.

        },
      } : {}),
      };
  }
  private async prepararDecisaoCompartilhada(manager: EntityManager, contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string, acao: AcaoAuditoria.ATIVIDADE_VERIFICADA|AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA) {
    const aprovando=acao===AcaoAuditoria.ATIVIDADE_VERIFICADA;
    const estadoOrigem=aprovando?'PENDENTE_CONCLUSAO':'REGISTRADA';
    const destino=aprovando?'VERIFICADA':'PENDENTE_CONCLUSAO';
    const origem=await manager.findOne(AtividadeEntity,{where:{id,contratoId}});
    const grupoId=origem?.atividadeCompartilhadaId;
    if(!grupoId) return this.transicionarNaTransacao(manager,contratoId,id,ator,estadoOrigem,destino,acao,justificativa);
    await this.autorizarMutacao(manager,contratoId,ator,aprovando?'verificarAtividades':'editarAtividades');
    const grupo=await manager.findOne(AtividadeCompartilhada,{where:{id:grupoId},lock:{mode:'pessimistic_write'}});
    if(!grupo)throw new ConflictException('Vínculo compartilhado indisponível.');
    const membros=await manager.find(AtividadeEntity,{where:{atividadeCompartilhadaId:grupoId,excluidaEm:IsNull()},order:{contratoId:'ASC',id:'ASC'}});
    if(!membros.some(a=>a.id===id&&a.contratoId===contratoId))throw new ConflictException('O vínculo compartilhado mudou.');
    const ativos=membros.filter(a=>a.status!=='ARQUIVADA');
    await manager.query('SELECT id FROM contratos WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',[[...new Set(ativos.map(a=>a.contratoId))]]);
    const operacao=await this.transicionarNaTransacao(manager,contratoId,id,ator,estadoOrigem,destino,acao,justificativa,grupoId);
    return {...operacao,aposEvento:async(m:EntityManager)=>{
      if(operacao.aposEvento)await operacao.aposEvento(m);
      for(const a of ativos){
        if(a.id===id||a.status==='VERIFICADA'||(!aprovando&&a.status==='PENDENTE_CONCLUSAO'))continue;
        if(a.status!=='REGISTRADA'&&a.status!=='PENDENTE_CONCLUSAO')throw new ConflictException('Um vínculo compartilhado não permite esta operação.');
        try {
          const op=await this.transicionarNaTransacao(m,a.contratoId,a.id,ator,a.status,destino,acao,'',grupoId);
          await this.auditoria.registrarNaTransacao(m,ator,op.evento);
          if(op.aposEvento)await op.aposEvento(m);
        }catch(e){if(e instanceof ConflictException||e instanceof BadRequestException||e instanceof NotFoundException||e instanceof ForbiddenException)throw new ConflictException('Não foi possível atualizar todos os vínculos. Confira a situação e as contribuições da atividade.');throw e;}
      }
    }};
  }
  private async transicionar(contratoId: string, id: string, ator: UsuarioAutenticado,
    origem: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA',
    destino: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA',
    acao: AcaoAuditoria, justificativa: string) {
    return this.auditoria.executarComAuditoria(ator, manager =>
      (acao === AcaoAuditoria.ATIVIDADE_VERIFICADA || acao === AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA)
        ? this.prepararDecisaoCompartilhada(manager,contratoId,id,ator,justificativa,acao)
        : this.transicionarNaTransacao(manager, contratoId, id, ator, origem, destino, acao, justificativa));
  }

  /** Uma solicitação para todos os vínculos vigentes. */
  async solicitarNaTransacao(manager: EntityManager, contratoId: string, id: string, ator: UsuarioAutenticado) {
    const acao = await this.prepararDecisaoCompartilhada(manager,contratoId,id,ator,'',AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA);
    await this.auditoria.registrarNaTransacao(manager, ator, acao.evento);
    if (acao.aposEvento) await acao.aposEvento(manager);
    return acao.resultado;
  }

  /** Aprovação compartilhada, na transação única do grupo; reaproveita regras e auditoria HU08. */
  async verificarNaTransacao(manager: EntityManager, contratoId: string, id: string, ator: UsuarioAutenticado) {
    const acao = await this.prepararDecisaoCompartilhada(manager,contratoId,id,ator,'',AcaoAuditoria.ATIVIDADE_VERIFICADA);
    await this.auditoria.registrarNaTransacao(manager, ator, acao.evento);
    if (acao.aposEvento) await acao.aposEvento(manager);
    return acao.resultado;
  }

  solicitarConclusao(contratoId: string, id: string, ator: UsuarioAutenticado) {
    return this.transicionar(contratoId, id, ator, 'REGISTRADA', 'PENDENTE_CONCLUSAO',
      AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA, '');
  }
  cancelarSolicitacao(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    return this.transicionar(contratoId, id, ator, 'PENDENTE_CONCLUSAO', 'REGISTRADA',
      AcaoAuditoria.ATIVIDADE_SOLICITACAO_CANCELADA, justificativa);
  }
  /** Aprovação separada: a rota /verificar antiga não pode mais pular a solicitação. */
  verificar(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    return this.transicionar(contratoId, id, ator, 'PENDENTE_CONCLUSAO', 'VERIFICADA',
      AcaoAuditoria.ATIVIDADE_VERIFICADA, justificativa);
  }
  reabrir(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    return this.transicionar(contratoId, id, ator, 'VERIFICADA', 'REGISTRADA', AcaoAuditoria.ATIVIDADE_REABERTA, justificativa);
  }
  arquivar(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    return this.transicionar(contratoId, id, ator, 'VERIFICADA', 'ARQUIVADA', AcaoAuditoria.ATIVIDADE_ARQUIVADA, justificativa);
  }
  reativar(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    return this.transicionar(contratoId, id, ator, 'ARQUIVADA', 'VERIFICADA', AcaoAuditoria.ATIVIDADE_REATIVADA, justificativa);
  }
  /** Exclusão lógica somente de arquivadas, mantendo N:N e a trilha de auditoria. */
  excluir(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    const motivo = justificativa.trim();
    if (motivo.length < 15 || motivo.length > 200) throw new BadRequestException('Informe o motivo da exclusão (15 a 200 caracteres)');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      await this.autorizarMutacao(manager, contratoId, ator, 'excluirAtividadesArquivadas');
      const contrato = await manager.findOne(Contrato,{where:{id:contratoId},lock:{mode:'pessimistic_write'}});
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || contrato.encerramentoSolicitado || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) throw new ConflictException('Reabra ou retome o contrato antes de alterar atividades');
      // PostgreSQL não permite FOR UPDATE sobre o lado opcional de LEFT JOIN.
      // Bloqueamos APENAS a atividade e lemos os vínculos na mesma transação.
      const bloqueada = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, lock: { mode: 'pessimistic_write' },
      });
      if (!bloqueada || bloqueada.excluidaEm) throw new NotFoundException('Atividade não encontrada');
      const registro = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, relations: { entregaveis: true, ocorrencias: true },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
      await this.validarOcorrencia(manager, contratoId, registro.ocorrenciaId, registro.entregaveis, registro.quantidadeExecucao);
      for (const secundaria of registro.ocorrencias ?? []) if (secundaria.id !== registro.ocorrenciaId)
        await this.validarOcorrencia(manager, contratoId, secundaria.id, registro.entregaveis);
      if (registro.status !== 'ARQUIVADA') throw new ConflictException('Apenas atividades arquivadas podem ser excluídas');
      if (registro.entregaveis.length) await this.verificarEntregaveis(manager, contratoId, registro.entregaveis.map(e=>e.id));
      await this.protegerReferenciasDependentes(manager, registro);
      const antes = resumo(registro);
      registro.excluidaEm = new Date();
      const salvo = await manager.save(AtividadeEntity, registro);
      return { resultado: { excluida: true }, evento: {
        acao: AcaoAuditoria.ATIVIDADE_EXCLUIDA,
        entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: antes, dadosPosteriores: { ...resumo(salvo), justificativa: motivo },
      } };
    });
  }
}
