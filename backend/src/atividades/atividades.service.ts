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
    if (encontrados.length !== ids.length || encontrados.some(e => e.arquivadoEm !== null || e.statusExecucao === 'CONCLUIDO')) {
      throw new ConflictException('É necessário vincular apenas entregáveis abertos do mesmo contrato');
    }
    const idsEtapas = [...new Set(encontrados.map(e => e.etapaId))];
    const etapas = await manager.find(Etapa, { where: { id: In(idsEtapas), contratoId } });
    if (etapas.length !== idsEtapas.length || etapas.some(e =>
      e.arquivadoEm || e.status === 'CONCLUIDA' || e.status === 'ENCERRADA')) {
      throw new ConflictException('Reabra a etapa antes de vincular uma nova atividade');
    }
    return encontrados;
  }

  async create(contratoId: string, dto: CreateAtividadeDto, ator: UsuarioAutenticado) {
    if (dto.contratoId !== contratoId) throw new BadRequestException('Contrato da atividade divergente da URL');
    const dataHora = instante(dto.dataHora);
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const entregaveis = await this.verificarEntregaveis(manager, contratoId, dto.entregavelIds);
      const registro = manager.create(AtividadeEntity, {
        contratoId, titulo: dto.titulo.trim(), dataHora, descricao: dto.descricao.trim(), tipo: dto.tipo.trim(),
        responsavelId: ator.id, responsavel: dto.responsavel?.trim() || ator.nome || ator.email,
        participantes: dto.participantes ?? [], local: dto.local?.trim() || null,
        duracao: dto.duracao?.trim() || null, observacoes: dto.observacoes?.trim() || null, entregaveis,
      });
      const salvo = await manager.save(AtividadeEntity, registro);
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
      .where('atividade.contratoId = :contratoId', { contratoId })
      .andWhere('atividade.excluidaEm IS NULL');
    if (filtros.status) {
      // A visão "Registradas" do diário reúne os registros ativos, inclusive
      // os já verificados. O filtro interno REGISTRADA continua estrito para
      // os bloqueios de conclusão e a contagem de pendências do entregável.
      if (filtros.status === 'ATIVAS') {
        query.andWhere('atividade.status IN (:...statusAtivos)', { statusAtivos: ['REGISTRADA', 'VERIFICADA'] });
      } else {
        if (!['REGISTRADA', 'VERIFICADA', 'ARQUIVADA'].includes(filtros.status)) {
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
    const registro = await this.repo.findOne({ where: { id, contratoId, excluidaEm: IsNull() }, relations: { entregaveis: true } });
    if (!registro) throw new NotFoundException('Atividade não encontrada');
    return registro;
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
        where: { id, contratoId }, relations: { entregaveis: true },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
      if (registro.status !== 'REGISTRADA') {
        throw new ConflictException('Atividade verificada ou arquivada não pode ser editada; reabra antes.');
      }
      const antes = resumo(registro);
      const anteriores = registro.entregaveis.map(e => e.id).sort();
      if (dto.entregavelIds !== undefined) {
        registro.entregaveis = await this.verificarEntregaveis(manager, contratoId, dto.entregavelIds);
      }
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
      const mudouVinculos = JSON.stringify(anteriores) !== JSON.stringify(salvo.entregaveis.map(e => e.id).sort());
      return { resultado: salvo, evento: {
        acao: mudouVinculos ? AcaoAuditoria.ATIVIDADE_VINCULOS_ALTERADOS : AcaoAuditoria.ATIVIDADE_EDITADA,
        entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: antes, dadosPosteriores: resumo(salvo),
      } };
    });
  }

  /** Operação atômica: transição + snapshot de auditoria no MESMO EntityManager. */
  private async transicionar(contratoId: string, id: string, ator: UsuarioAutenticado,
    origem: 'REGISTRADA' | 'VERIFICADA' | 'ARQUIVADA',
    destino: 'REGISTRADA' | 'VERIFICADA' | 'ARQUIVADA',
    acao: AcaoAuditoria, justificativa: string) {
    const motivo = justificativa.trim();
    if ((acao !== AcaoAuditoria.ATIVIDADE_VERIFICADA && motivo.length < 15) || motivo.length > 200 || (motivo && motivo.length < 15)) throw new BadRequestException('Justificativa deve ter entre 15 e 200 caracteres; verificação dispensa motivo');
    return this.auditoria.executarComAuditoria(ator, async manager => {
      // PostgreSQL não permite FOR UPDATE sobre o lado opcional de LEFT JOIN.
      // Bloqueamos APENAS a atividade e lemos os vínculos na mesma transação.
      const bloqueada = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, lock: { mode: 'pessimistic_write' },
      });
      if (!bloqueada || bloqueada.excluidaEm) throw new NotFoundException('Atividade não encontrada');
      const registro = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, relations: { entregaveis: true },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
      if (registro.status !== origem) throw new ConflictException(`Transição não permitida a partir de ${registro.status}`);
      // Reabrir uma atividade após concluir seus pais criaria uma pendência
      // invisível em objeto fechado. Exige reabertura prévia do contexto.
      if (acao === AcaoAuditoria.ATIVIDADE_REABERTA && registro.entregaveis.length > 0) {
        await this.verificarEntregaveis(manager, contratoId, registro.entregaveis.map(e => e.id));
      }
      const antes = resumo(registro);
      registro.status = destino;
      if (destino === 'REGISTRADA') registro.verificadaEm = null;
      if (destino === 'VERIFICADA' && origem === 'REGISTRADA') registro.verificadaEm = new Date();
      registro.arquivadaEm = destino === 'ARQUIVADA' ? new Date() : null;
      const salvo = await manager.save(AtividadeEntity, registro);
      return { resultado: salvo, evento: {
        acao, entidadeTipo: 'ATIVIDADE' as const, entidadeId: salvo.id,
        dadosAnteriores: antes, dadosPosteriores: { ...resumo(salvo), ...(motivo ? { justificativa: motivo } : {}) },
      },
      // Audita primeiro a verificação e, na mesma transação, conclui os
      // entregáveis que ficaram sem pendências. O contrato nunca fecha sozinho.
      ...(acao === AcaoAuditoria.ATIVIDADE_VERIFICADA && registro.entregaveis.length > 0 ? {
        aposEvento: async (m: EntityManager) => {
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
            });
          }
        },
      } : {}),
      };
    });
  }
  verificar(contratoId: string, id: string, ator: UsuarioAutenticado, justificativa: string) {
    return this.transicionar(contratoId, id, ator, 'REGISTRADA', 'VERIFICADA', AcaoAuditoria.ATIVIDADE_VERIFICADA, justificativa);
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
        where: { id, contratoId }, relations: { entregaveis: true },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
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
