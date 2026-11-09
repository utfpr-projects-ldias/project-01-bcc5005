import {
  BadRequestException, Injectable, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type EntityManager, type Repository } from 'typeorm';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
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
    const encontrados = await manager.find(Entregavel, { where: { id: In(ids), contratoId } });
    if (encontrados.length !== ids.length || encontrados.some(e => e.arquivadoEm !== null)) {
      throw new BadRequestException('Entregável inexistente, arquivado ou de outro contrato');
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
      .where('atividade.contratoId = :contratoId', { contratoId });
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
    const registro = await this.repo.findOne({ where: { id, contratoId }, relations: { entregaveis: true } });
    if (!registro) throw new NotFoundException('Atividade não encontrada');
    return registro;
  }

  async update(contratoId: string, id: string, dto: UpdateAtividadeDto, ator: UsuarioAutenticado) {
    return this.auditoria.executarComAuditoria(ator, async manager => {
      const registro = await manager.findOne(AtividadeEntity, {
        where: { id, contratoId }, relations: { entregaveis: true }, lock: { mode: 'pessimistic_write' },
      });
      if (!registro) throw new NotFoundException('Atividade não encontrada');
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
}
