import {
  BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, type EntityManager, type Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { concluirEntregavelAposAtividade, concluirEtapaAposFilhos } from '../entregaveis/conclusao-documental.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { OrigemOcorrencia } from '../ocorrencias/origem-ocorrencia.enum.js';
import { StatusOcorrencia } from '../ocorrencias/status-ocorrencia.enum.js';
import { resumoMedicao, proximoStatusAutomatico } from '../ocorrencias/medicao-ocorrencia.js';
import type { MedicaoAtividadeDto } from './dto/medicao-atividade.dto.js';
import { AtividadeEntity } from './atividade.entity.js';
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
    titulo: a.titulo, dataHora: a.dataHora.toISOString(), tipo: a.tipo,
    descricao: a.descricao, responsavel: a.responsavel,
    ocorrenciaId: a.ocorrenciaId ?? null, ocorrenciaIds: (a.ocorrencias ?? []).map(o => o.id).sort(), quantidadeExecucao: a.quantidadeExecucao ?? null,
    entregavelIds: a.entregaveis.map(e => e.id).sort(),
    status: a.status, verificadaEm: a.verificadaEm?.toISOString() ?? null, arquivadaEm: a.arquivadaEm?.toISOString() ?? null, excluidaEm: a.excluidaEm?.toISOString() ?? null,
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

  private async verificarEntregaveis(manager: EntityManager, contratoId: string, ids: string[]): Promise<Entregavel[]> {
    if (!ids.length || new Set(ids.map(i => i.toLowerCase())).size !== ids.length) {
      throw new BadRequestException('Selecione entregáveis distintos do contrato');
    }
    // O lock do contrato serializa cadastro de atividade com conclusão/arquivamento
    // de contratos, etapas e entregáveis; não confiar apenas nos botões do frontend.
    const contrato = await manager.findOne(Contrato, {
      where: { id: contratoId }, lock: { mode: 'pessimistic_write' },
    });
    if (!contrato || contrato.arquivadoEm ||
      !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status)) {
      throw new ConflictException('Reabra ou retome o contrato antes de registrar atividades');
    }
    const encontrados = await manager.find(Entregavel, { where: { id: In(ids), contratoId } });
    if (encontrados.length !== ids.length || encontrados.some(e => e.arquivadoEm !== null || ['CONCLUIDO','FINALIZADO','PENDENTE_ENCERRAMENTO','PENDENTE_CONCLUSAO'].includes(e.statusExecucao ?? ''))) {
      throw new ConflictException('É necessário vincular apenas entregáveis abertos do mesmo contrato');
    }
    const idsEtapas = [...new Set(encontrados.map(e => e.etapaId))];
    const etapas = await manager.find(Etapa, { where: { id: In(idsEtapas), contratoId } });
    if (etapas.length !== idsEtapas.length || etapas.some(e =>
      e.arquivadoEm || e.conclusaoSolicitadaEm || e.encerramentoSolicitadoEm || e.status === 'CONCLUIDA' || e.status === 'ENCERRADA')) {
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
    if ([StatusOcorrencia.PENDENTE_CONCLUSAO, StatusOcorrencia.CONCLUIDO, StatusOcorrencia.PENDENTE_ENCERRAMENTO, StatusOcorrencia.ENCERRADA].includes(o.status)) {
      throw new ConflictException('Ocorrência pendente ou concluída: somente após reabertura autorizada é permitido alterar atividades vinculadas');
    }
    if (quantidade != null && (o.modoRegistro !== 'QUANTITATIVO' || o.metaQuantidade == null)) {
      throw new BadRequestException('Quantidade só pode ser informada para ocorrência com meta quantitativa');
    }
  }

  /** Confere todos os vínculos; uma associação não amplia a autorização do usuário.
   * A quantidade física só pertence à ocorrência primária, nunca é duplicada nas demais. */
  private async verificarOcorrencias(manager: EntityManager, contratoId: string, ids: string[],
    entregaveis: Entregavel[], primaria: string | null | undefined, quantidade: string | null | undefined): Promise<Ocorrencia[]> {
    if (new Set(ids.map(id => id.toLowerCase())).size !== ids.length || ids.some(id => !uuidValido(id)))
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
    await manager.query(`DELETE FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2`,
      [atividadeId,contratoId]);
    for (const item of medicoes) await manager.query(`INSERT INTO atividade_ocorrencia_medicoes
      (atividade_id,ocorrencia_id,contrato_id,quantidade) VALUES ($1,$2,$3,$4)`,
      [atividadeId,item.ocorrenciaId,contratoId,item.quantidade]);
  }

  private async recalcularOcorrencia(manager: EntityManager,id: string | null | undefined,ator:UsuarioAutenticado) {
    if (!id) return;
    const o = await manager.findOne(Ocorrencia,{where:{id},lock:{mode:'pessimistic_write'}});
    if (!o || o.substituidaEm) return;
    if ([StatusOcorrencia.PENDENTE_CONCLUSAO,StatusOcorrencia.CONCLUIDO,StatusOcorrencia.PENDENTE_ENCERRAMENTO,
      StatusOcorrencia.ENCERRADA].includes(o.status)) throw new ConflictException('Ocorrência bloqueada até reabertura');
    const r = await resumoMedicao(manager,o);
    if (o.metaQuantidade != null && r.quantidadeRegistrada > Number(o.metaQuantidade))
      throw new ConflictException(`Quantidade registrada (${r.quantidadeRegistrada}) excede a meta desta ocorrência (${o.metaQuantidade})`);
    const novo = proximoStatusAutomatico(o,r) as StatusOcorrencia;
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

  async create(contratoId: string, dto: CreateAtividadeDto, ator: UsuarioAutenticado) {
    if (dto.contratoId !== contratoId) throw new BadRequestException('Contrato da atividade divergente da URL');
    const dataHora = instante(dto.dataHora);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const entregaveis = await this.verificarEntregaveis(manager, contratoId, dto.entregavelIds);
      await this.validarOcorrencia(manager, contratoId, dto.ocorrenciaId, entregaveis, dto.quantidadeExecucao);
      const idsOcorrencias = dto.ocorrenciaIds ?? (dto.ocorrenciaId ? [dto.ocorrenciaId] : []);
      const ocorrencias = await this.verificarOcorrencias(manager, contratoId, idsOcorrencias,
        entregaveis, dto.ocorrenciaId, dto.quantidadeExecucao);
      if (dto.medicoes) for (const item of dto.medicoes)
        await this.validarOcorrencia(manager, contratoId, item.ocorrenciaId, entregaveis, item.quantidade);
      if (dto.medicoes && dto.quantidadeExecucao != null)
        throw new BadRequestException('Não misture a medição única legada com quantidades por ocorrência');
      const registro = manager.create(AtividadeEntity, {
        contratoId, titulo: dto.titulo.trim(), dataHora, descricao: dto.descricao.trim(), tipo: dto.tipo.trim(),
        responsavelId: ator.id, responsavel: dto.responsavel?.trim() || ator.nome || ator.email,
        participantes: dto.participantes ?? [], local: dto.local?.trim() || null,
        duracao: dto.duracao?.trim() || null, observacoes: dto.observacoes?.trim() || null, entregaveis, ocorrencias, ocorrenciaId: dto.ocorrenciaId ?? null,
        quantidadeExecucao: dto.quantidadeExecucao ?? null,
      });
      const salvo = await manager.save(AtividadeEntity, registro);
      await this.salvarMedicoes(manager, contratoId, salvo.id, dto.medicoes, ocorrencias);
      for (const id of new Set([salvo.ocorrenciaId, ...ocorrencias.map(o => o.id)])) await this.recalcularOcorrencia(manager, id, ator);
      return { resultado: salvo, evento: {
        acao: AcaoAuditoria.ATIVIDADE_CRIADA, entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosPosteriores: resumo(salvo),
      } };
    });
  }

  async findAllPaginated(contratoId: string, filtros: Record<string, string>) {
    const [pagina, limite] = erroQuery(filtros.page, filtros.limit);
    const query = this.repo.createQueryBuilder('atividade')
      .leftJoinAndSelect('atividade.entregaveis', 'entregaveis')
      .leftJoinAndSelect('atividade.ocorrencias', 'ocorrencias')
      .where('atividade.contratoId = :contratoId', { contratoId })
      .andWhere('atividade.excluidaEm IS NULL');
    if (filtros.status) {
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
    if (filtros.dataInicio) {
      if (!validoDia(filtros.dataInicio)) throw new BadRequestException('Data inicial inválida');
      query.andWhere('atividade.dataHora >= :inicio', { inicio: `${filtros.dataInicio}T00:00:00Z` });
    }
    if (filtros.dataFim) {
      if (!validoDia(filtros.dataFim)) throw new BadRequestException('Data final inválida');
      const amanha = new Date(`${filtros.dataFim}T00:00:00Z`);
      amanha.setUTCDate(amanha.getUTCDate() + 1);
      query.andWhere('atividade.dataHora < :fimExclusivo', { fimExclusivo: amanha.toISOString() });
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
    const [data, total] = await query.orderBy('atividade.dataHora', 'DESC').addOrderBy('atividade.id', 'DESC')
      .skip((pagina - 1) * limite).take(limite).getManyAndCount();
    return { data, meta: { total, page: pagina, limit: limite, lastPage: Math.ceil(total / limite) || 1 } };
  }

  async findOne(contratoId: string, id: string) {
    const registro = await this.repo.findOne({ where: { id, contratoId, excluidaEm: IsNull() }, relations: { entregaveis: true, ocorrencias: true } });
    if (!registro) throw new NotFoundException('Atividade não encontrada');
    const medidas: Array<{ocorrenciaId:string;quantidade:string}> = await this.repo.manager.query(
      `SELECT ocorrencia_id AS "ocorrenciaId",quantidade::text AS quantidade
       FROM atividade_ocorrencia_medicoes WHERE atividade_id=$1 AND contrato_id=$2`,[id,contratoId]);
    const legado = registro.ocorrenciaId && registro.quantidadeExecucao != null &&
      !medidas.some(m=>m.ocorrenciaId===registro.ocorrenciaId)
      ? [{ocorrenciaId:registro.ocorrenciaId,quantidade:String(registro.quantidadeExecucao)}] : [];
    return { ...registro, medicoes:[...medidas,...legado] };
  }

  async update(contratoId: string, id: string, dto: UpdateAtividadeDto, ator: UsuarioAutenticado) {
    return this.auditoria.executarComAuditoria(ator, async manager => {
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
      if (registro.status !== 'REGISTRADA') {
        throw new ConflictException('Atividade verificada ou arquivada não pode ser editada; reabra antes.');
      }
      const antes = resumo(registro);
      const anteriores = registro.entregaveis.map(e => e.id).sort();
      const ocorrenciasAnteriores = (registro.ocorrencias ?? []).map(o => o.id);
      const idsSolicitados = dto.ocorrenciaIds ?? (dto.ocorrenciaId !== undefined
        ? dto.ocorrenciaId ? [dto.ocorrenciaId] : [] : ocorrenciasAnteriores);

      if (dto.entregavelIds !== undefined || dto.ocorrenciaId !== undefined || dto.ocorrenciaIds !== undefined) {
        registro.entregaveis = await this.verificarEntregaveis(manager, contratoId, dto.entregavelIds ?? anteriores);
        const ocorrenciaId = dto.ocorrenciaId === undefined ? registro.ocorrenciaId : dto.ocorrenciaId;
        await this.validarOcorrencia(manager, contratoId, ocorrenciaId, registro.entregaveis, dto.quantidadeExecucao === undefined ? registro.quantidadeExecucao : dto.quantidadeExecucao);
        if (dto.ocorrenciaId !== undefined) registro.ocorrenciaId = dto.ocorrenciaId;
      }
      registro.ocorrencias = await this.verificarOcorrencias(manager, contratoId, idsSolicitados,
        registro.entregaveis, registro.ocorrenciaId, dto.quantidadeExecucao === undefined ? registro.quantidadeExecucao : dto.quantidadeExecucao);
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
      if (dto.responsavel !== undefined) registro.responsavel = dto.responsavel.trim() || null;
      if (dto.participantes !== undefined) registro.participantes = dto.participantes;
      if (dto.local !== undefined) registro.local = dto.local.trim() || null;
      if (dto.duracao !== undefined) registro.duracao = dto.duracao.trim() || null;
      if (dto.observacoes !== undefined) registro.observacoes = dto.observacoes.trim() || null;
      const salvo = await manager.save(AtividadeEntity, registro);
      await this.salvarMedicoes(manager, contratoId, salvo.id, dto.medicoes, registro.ocorrencias ?? []);
      for (const ocorrenciaId of new Set([...ocorrenciasAnteriores, ...idsSolicitados, antes.ocorrenciaId, salvo.ocorrenciaId]))
        await this.recalcularOcorrencia(manager, ocorrenciaId, ator);
      const mudouVinculos = JSON.stringify(ocorrenciasAnteriores.slice().sort()) !== JSON.stringify(idsSolicitados.slice().sort()) || antes.ocorrenciaId !== (salvo.ocorrenciaId ?? null) || JSON.stringify(anteriores) !== JSON.stringify(salvo.entregaveis.map(e => e.id).sort());
      return { resultado: salvo, evento: {
        acao: mudouVinculos ? AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS : AcaoAuditoria.ATIVIDADE_EDITADA,
        entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: antes, dadosPosteriores: resumo(salvo),
      } };
    });
  }

  /** Operação atômica: transição + snapshot de auditoria no MESMO EntityManager. */
  private async transicionar(contratoId: string, id: string, ator: UsuarioAutenticado,
    origem: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA',
    destino: 'REGISTRADA' | 'PENDENTE_CONCLUSAO' | 'VERIFICADA' | 'ARQUIVADA',
    acao: AcaoAuditoria, justificativa: string) {
    const motivo = justificativa.trim();
    if ((![AcaoAuditoria.ATIVIDADE_VERIFICADA, AcaoAuditoria.ATIVIDADE_CONCLUSAO_SOLICITADA].includes(acao) && motivo.length < 15) || motivo.length > 200 || (motivo && motivo.length < 15)) throw new BadRequestException('Justificativa deve ter entre 15 e 200 caracteres; verificação dispensa motivo');
    return this.auditoria.executarComAuditoria(ator, async manager => {
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
      if (registro.status !== origem) throw new ConflictException(`Transição não permitida a partir de ${registro.status}`);
      // Reabrir uma atividade após concluir seus pais criaria uma pendência
      // invisível em objeto fechado. Exige reabertura prévia do contexto.
      if (acao === AcaoAuditoria.ATIVIDADE_REABERTA && registro.entregaveis.length > 0) {
        await this.verificarEntregaveis(manager, contratoId, registro.entregaveis.map(e => e.id));
      }
      const antes = resumo(registro);
      registro.status = destino;
      if (destino === 'REGISTRADA') registro.verificadaEm = null;
      if (destino === 'VERIFICADA' && origem === 'PENDENTE_CONCLUSAO') registro.verificadaEm = new Date();
      registro.arquivadaEm = destino === 'ARQUIVADA' ? new Date() : null;
      const salvo = await manager.save(AtividadeEntity, registro);
      if (acao !== AcaoAuditoria.ATIVIDADE_VERIFICADA) for (const id of new Set([salvo.ocorrenciaId, ...(salvo.ocorrencias ?? []).map(o => o.id)]))
        await this.recalcularOcorrencia(manager, id, ator);
      return { resultado: salvo, evento: {
        acao, entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: antes, dadosPosteriores: { ...resumo(salvo), ...(motivo ? { justificativa: motivo } : {}) },
      },
      // Audita primeiro a verificação e, na mesma transação, conclui os
      // entregáveis que ficaram sem pendências. O contrato nunca fecha sozinho.
      ...(acao === AcaoAuditoria.ATIVIDADE_VERIFICADA && registro.entregaveis.length > 0 ? {
        aposEvento: async (m: EntityManager) => {
          // A quantidade só passa a medir execução depois da verificação.
          // Mesmo contrato/transação, sem janela de duplicação entre aprovações.
          for (const ocorrenciaId of new Set([salvo.ocorrenciaId, ...(salvo.ocorrencias ?? []).map(o => o.id)]))
            await this.recalcularOcorrencia(m, ocorrenciaId, ator);
          const etapas = new Set<string>();
          for (const entregavelId of [...new Set(registro.entregaveis.map(e => e.id))].sort()) {
            const concluido = await concluirEntregavelAposAtividade(m, contratoId, entregavelId, async (e, anterior) => {
              await this.auditoria.registrarNaTransacao(m, ator, {
                acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
                entidadeTipo: 'ENTREGAVEL', entidadeId: e.id,
                dadosAnteriores: anterior,
                dadosPosteriores: { statusExecucao: e.statusExecucao, reabertoEm: null, motivo: 'ULTIMA_ATIVIDADE_VERIFICADA' },
              });
            });
            if (concluido) etapas.add(concluido.etapaId);
          }
          for (const etapaId of etapas) {
            await concluirEtapaAposFilhos(m, contratoId, etapaId, async (antesEtapa, depoisEtapa) => {
              await this.auditoria.registrarNaTransacao(m, ator, {
                acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO,
                entidadeTipo: 'ETAPA', entidadeId: etapaId,
                dadosAnteriores: antesEtapa,
                dadosPosteriores: { ...depoisEtapa, motivo: 'ULTIMA_ATIVIDADE_VERIFICADA' },
              });
            }, ator.id);
          }
        },
      } : {}),
      };
    });
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
