import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, type EntityManager, type Repository } from 'typeorm';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from '../contratos/contrato.entity.js';
import type { AtualizarEtapaDto } from './dto/atualizar-etapa.dto.js';
import type { CriarEtapaDto } from './dto/criar-etapa.dto.js';
import type { ReordenarEtapasDto } from './dto/reordenar-etapas.dto.js';
import { Etapa } from './etapa.entity.js';
import { StatusEtapa } from './status-etapa.enum.js';

export type RespostaEtapa = Etapa & {
  vigenciaContrato: { inicioVigencia: string; terminoVigencia: string };
  avisoVigencia: boolean;
};

/** Sem mutação de datas: a vigência do contrato é um contexto informativo. */
function resposta(etapa: Etapa, contrato: Contrato): RespostaEtapa {
  return Object.assign({}, etapa, {
    vigenciaContrato: {
      inicioVigencia: contrato.inicioVigencia,
      terminoVigencia: contrato.terminoVigencia,
    },
    avisoVigencia: Boolean(
      (etapa.inicioPrevisto && (etapa.inicioPrevisto < contrato.inicioVigencia || etapa.inicioPrevisto > contrato.terminoVigencia)) ||
      (etapa.terminoPrevisto && (etapa.terminoPrevisto < contrato.inicioVigencia || etapa.terminoPrevisto > contrato.terminoVigencia))
    ),
  });
}

function calendarioValido(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

function verificarDados(etapa: Pick<Etapa, 'nome' | 'codigo' | 'inicioPrevisto' | 'terminoPrevisto'>): void {
  if (!etapa.nome.trim() || etapa.nome.length > 255) {
    throw new BadRequestException('Nome da etapa é obrigatório e deve ter até 255 caracteres');
  }
  if (etapa.codigo !== null && (!etapa.codigo.trim() || etapa.codigo.length > 50)) {
    throw new BadRequestException('Código da etapa inválido');
  }
  for (const data of [etapa.inicioPrevisto, etapa.terminoPrevisto]) {
    if (data !== null && !calendarioValido(data)) {
      throw new BadRequestException('Data prevista inválida; use YYYY-MM-DD');
    }
  }
  if (etapa.inicioPrevisto && etapa.terminoPrevisto && etapa.inicioPrevisto > etapa.terminoPrevisto) {
    throw new BadRequestException('Término previsto anterior ao início previsto');
  }
}

function snapshot(etapa: Etapa): Record<string, unknown> {
  return {
    contratoId: etapa.contratoId, codigo: etapa.codigo, nome: etapa.nome,
    descricao: etapa.descricao, sequencia: etapa.sequencia,
    inicioPrevisto: etapa.inicioPrevisto, terminoPrevisto: etapa.terminoPrevisto,
    status: etapa.status, observacoes: etapa.observacoes,
  };
}

/** Retorna um erro HTTP consistente sem expor SQL, IDs privados ou registros alheios. */
function traduzirErro(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const driver = error.driverError as { code?: string };
    switch (driver.code) {
      case '23505': case '40P01': case '40001':
        throw new ConflictException('Alteração concorrente ou sequência já ocupada. Recarregue e tente novamente');
      case '23503':
        throw new NotFoundException('Contrato ou Etapa não encontrado');
      case '23514': case '22P02': case '22007': case '22008':
        throw new BadRequestException('Dados da etapa inválidos');
    }
  }
  throw error;
}

/**
 * RF-05 / RNF-01/02/05: CRUD sem DELETE, raiz contratual persistida,
 * serialização de escritas mediante SELECT FOR UPDATE do CONTRATO e auditoria
 * na mesma transação. A ordem é única e DEFERRABLE na migration HU06-01.
 */
@Injectable()
export class EtapasService {
  constructor(
    @InjectRepository(Etapa) private readonly etapas: Repository<Etapa>,
    @InjectRepository(Contrato) private readonly contratos: Repository<Contrato>,
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async contratoExistente(id: string): Promise<Contrato> {
    const contrato = await this.contratos.findOneBy({ id });
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    return contrato;
  }

  /** Serializa criação, reordenação e edição sem expor bloqueios ao navegador. */
  private async bloquearContrato(manager: EntityManager, id: string): Promise<Contrato> {
    const contrato = await manager.getRepository(Contrato)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.id = :id', { id })
      .getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    return contrato;
  }

  async listar(contratoId: string): Promise<RespostaEtapa[]> {
    const contrato = await this.contratoExistente(contratoId);
    const registros = await this.etapas.find({
      where: { contratoId }, order: { sequencia: 'ASC', id: 'ASC' },
    });
    return registros.map((etapa) => resposta(etapa, contrato));
  }

  async detalhar(contratoId: string, etapaId: string): Promise<RespostaEtapa> {
    const etapa = await this.etapas.findOneBy({ contratoId, id: etapaId });
    if (!etapa) throw new NotFoundException('Etapa não encontrada');
    const contrato = await this.contratoExistente(contratoId);
    return resposta(etapa, contrato);
  }

  async criar(contratoId: string, dto: CriarEtapaDto, ator: UsuarioAutenticado): Promise<RespostaEtapa> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contrato = await this.bloquearContrato(manager, contratoId);
        const repo = manager.getRepository(Etapa);
        const ultima = await repo.findOne({ where: { contratoId }, order: { sequencia: 'DESC' } });
        const etapa = repo.create({
          contratoId, nome: dto.nome.trim(), codigo: dto.codigo == null ? null : dto.codigo.trim(),
          descricao: dto.descricao ?? null, sequencia: (ultima?.sequencia ?? 0) + 1,
          inicioPrevisto: dto.inicioPrevisto ?? null,
          terminoPrevisto: dto.terminoPrevisto ?? null,
          status: dto.status ?? StatusEtapa.PLANEJADA,
          observacoes: dto.observacoes ?? null,
        });
        verificarDados(etapa);
        const salva = await repo.save(etapa);
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.ETAPA_CRIADA, entidadeTipo: 'ETAPA', entidadeId: salva.id,
          dadosPosteriores: snapshot(salva),
        });
        return resposta(salva, contrato);
      });
    } catch (error: unknown) { return traduzirErro(error); }
  }

  async editar(contratoId: string, etapaId: string, dto: AtualizarEtapaDto, ator: UsuarioAutenticado): Promise<RespostaEtapa> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Informe ao menos um campo para editar');
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contrato = await this.bloquearContrato(manager, contratoId);
        const repo = manager.getRepository(Etapa);
        const etapa = await repo.findOneBy({ contratoId, id: etapaId });
        if (!etapa) throw new NotFoundException('Etapa não encontrada');
        const anterior = snapshot(etapa);
        const datasAnteriores = { inicioPrevisto: etapa.inicioPrevisto, terminoPrevisto: etapa.terminoPrevisto };
        const statusAnterior = etapa.status;
        if (dto.nome !== undefined) etapa.nome = dto.nome.trim();
        if (dto.codigo !== undefined) etapa.codigo = dto.codigo === null ? null : dto.codigo.trim();
        if (dto.descricao !== undefined) etapa.descricao = dto.descricao;
        if (dto.inicioPrevisto !== undefined) etapa.inicioPrevisto = dto.inicioPrevisto;
        if (dto.terminoPrevisto !== undefined) etapa.terminoPrevisto = dto.terminoPrevisto;
        if (dto.status !== undefined) etapa.status = dto.status;
        if (dto.observacoes !== undefined) etapa.observacoes = dto.observacoes;
        verificarDados(etapa);
        const salva = await repo.save(etapa);
        if (salva.status !== statusAnterior) {
          await this.auditoria.registrarNaTransacao(manager, ator, {
            acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
            dadosAnteriores: { status: statusAnterior }, dadosPosteriores: { status: salva.status },
          });
        }
        if (salva.inicioPrevisto !== datasAnteriores.inicioPrevisto || salva.terminoPrevisto !== datasAnteriores.terminoPrevisto) {
          await this.auditoria.registrarNaTransacao(manager, ator, {
            acao: AcaoAuditoria.ETAPA_PRAZO_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: etapaId,
            dadosAnteriores: datasAnteriores,
            dadosPosteriores: { inicioPrevisto: salva.inicioPrevisto, terminoPrevisto: salva.terminoPrevisto },
          });
        }
        await this.auditoria.registrarNaTransacao(manager, ator, {
          acao: AcaoAuditoria.ETAPA_EDITADA, entidadeTipo: 'ETAPA', entidadeId: etapaId,
          dadosAnteriores: anterior, dadosPosteriores: snapshot(salva),
        });
        return resposta(salva, contrato);
      });
    } catch (error: unknown) { return traduzirErro(error); }
  }

  async reordenar(contratoId: string, dto: ReordenarEtapasDto, ator: UsuarioAutenticado): Promise<RespostaEtapa[]> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const contrato = await this.bloquearContrato(manager, contratoId);
        const repo = manager.getRepository(Etapa);
        const atuais = await repo.find({ where: { contratoId }, order: { sequencia: 'ASC', id: 'ASC' } });
        const idsAtuais = atuais.map((etapa) => etapa.id);
        const iguais = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
        const mesmosIds = dto.idsOrdemNova.length === idsAtuais.length &&
          dto.idsOrdemNova.every((id) => idsAtuais.includes(id));
        if (!iguais(idsAtuais, dto.idsOrdemAtual) || !mesmosIds) {
          throw new ConflictException('Ordem desatualizada ou IDs não pertencentes ao contrato; recarregue as etapas');
        }
        if (iguais(idsAtuais, dto.idsOrdemNova)) return atuais.map((etapa) => resposta(etapa, contrato));
        // Já existe na HU06-01: UNIQUE(contrato_id, sequencia) DEFERRABLE.
        // Todo UPDATE e todo evento de auditoria ocorre nesta mesma transação.
        await manager.query('SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED');
        const porId = new Map(atuais.map((etapa) => [etapa.id, etapa]));
        const resultado: Etapa[] = [];
        for (const [indice, id] of dto.idsOrdemNova.entries()) {
          const etapa = porId.get(id)!;
          const novaSequencia = indice + 1;
          if (etapa.sequencia !== novaSequencia) {
            const antiga = etapa.sequencia;
            await repo.update({ id, contratoId }, { sequencia: novaSequencia });
            etapa.sequencia = novaSequencia;
            await this.auditoria.registrarNaTransacao(manager, ator, {
              acao: AcaoAuditoria.ETAPA_REORDENADA, entidadeTipo: 'ETAPA', entidadeId: id,
              dadosAnteriores: { sequencia: antiga }, dadosPosteriores: { sequencia: novaSequencia },
            });
          }
          resultado.push(etapa);
        }
        return resultado.map((etapa) => resposta(etapa, contrato));
      });
    } catch (error: unknown) { return traduzirErro(error); }
  }
}
