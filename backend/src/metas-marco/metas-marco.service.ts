import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { ComprovanteEvidencia } from '../entregaveis/comprovante-evidencia.entity.js';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import type { CriarMetaMarcoDto, EditarMetaMarcoDto } from './metas-marco.dto.js';

type Operacao = 'metas-marco:listar' | 'metas-marco:criar' | 'metas-marco:editar' | 'metas-marco:vincular' | 'metas-marco:decidir';
const campos = (d: CriarMetaMarcoDto | EditarMetaMarcoDto) => ({
  ...(d.titulo !== undefined ? { titulo: d.titulo.trim() } : {}),
  ...(d.quantidadeExigida !== undefined ? { quantidadeExigida: d.quantidadeExigida } : {}),
  ...(d.dataPrevista !== undefined ? { dataPrevista: d.dataPrevista || null } : {}),
  ...(d.inicioPrevisto !== undefined ? { inicioPrevisto: d.inicioPrevisto || null } : {}),
  ...(d.terminoPrevisto !== undefined ? { terminoPrevisto: d.terminoPrevisto || null } : {}),
  ...(d.observacoes !== undefined ? { observacoes: d.observacoes?.trim() || null } : {}),
});

/** Metas são expectativas. Os registros vinculados permanecem originais e têm autorização pelo contrato. */
@Injectable()
export class MetasMarcoService {
  constructor(private readonly ds: DataSource, private readonly acesso: PoliticaAcessoService,
    private readonly auditoria: AuditoriaService) {}

  private async autorizar(ator: UsuarioAutenticado, contratoId: string, acao: Operacao) {
    const permitido = await this.acesso.permitido(ator, { acao,
      escopoOperacional: { tipo: 'contrato', parametro: 'contratoId' } }, contratoId);
    if (!permitido) throw new ForbiddenException('Sem autorização nesta operação de metas do Marco');
  }
  private async entregar(m: EntityManager, contratoId: string, entregavelId: string,
    alterar = false): Promise<Entregavel> {
    const e = await m.findOne(Entregavel, { where: { id: entregavelId, contratoId },
      ...(alterar ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!e || e.arquivadoEm || e.tipo !== 'MARCO') throw new NotFoundException('Marco indisponível');
    if (alterar && ['CONCLUIDO', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))
      throw new ConflictException('Reabra o Marco ou devolva a solicitação antes de alterar suas metas');
    return e;
  }
  private async meta(m: EntityManager, contratoId: string, entregavelId: string, metaId: string,
    alterar = false): Promise<MetaMarco> {
    const meta = await m.findOne(MetaMarco, { where: { id: metaId, contratoId, entregavelId, arquivadoEm: IsNull() },
      ...(alterar ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!meta) throw new NotFoundException('Meta não encontrada neste Marco');
    return meta;
  }
  private validarDatas(meta: Pick<MetaMarco, 'dataPrevista' | 'inicioPrevisto' | 'terminoPrevisto' | 'titulo'>) {
    if (!meta.titulo.trim()) throw new BadRequestException('Informe o título da meta');
    if (meta.inicioPrevisto && meta.terminoPrevisto && meta.inicioPrevisto > meta.terminoPrevisto)
      throw new BadRequestException('O término previsto não pode anteceder o início');
    if (meta.dataPrevista && (meta.inicioPrevisto || meta.terminoPrevisto))
      throw new BadRequestException('Use data única ou intervalo, não os dois');
  }
  /** Revalida o objeto real em toda consulta para não contabilizar uma aprovação revogada. */
  private async elegivel(m: EntityManager, meta: MetaMarco, vinculo: VinculoMetaMarco): Promise<boolean> {
    if (meta.tipo === 'OCORRENCIA' && vinculo.ocorrenciaId) {
      const o = await m.findOne(Ocorrencia, { where: { id: vinculo.ocorrenciaId, contratoId: meta.contratoId } });
      return Boolean(o && !o.substituidaEm && o.status === 'CONCLUIDO');
    }
    if (meta.tipo === 'ATIVIDADE' && vinculo.atividadeId) {
      const a = await m.findOne(AtividadeEntity, { where: { id: vinculo.atividadeId, contratoId: meta.contratoId } });
      return Boolean(a && !a.excluidaEm && !a.arquivadaEm && a.status === 'VERIFICADA');
    }
    if (meta.tipo === 'EVIDENCIA' && vinculo.comprovanteId) {
      const c = await m.findOne(ComprovanteEvidencia, { where: { id: vinculo.comprovanteId, contratoId: meta.contratoId } });
      return Boolean(c && c.status === 'VERIFICADA' && c.verificadoEm);
    }
    return false;
  }
  private async montar(m: EntityManager, meta: MetaMarco) {
    const vinculos = await m.find(VinculoMetaMarco, { where: { metaId: meta.id, contratoId: meta.contratoId }, order: { solicitadoEm: 'ASC' } });
    const ativos = vinculos.filter(v => v.status !== 'REJEITADO');
    const conferencias = await Promise.all(ativos.map(async v => ({ id: v.id, elegivel: v.status === 'APROVADO' && await this.elegivel(m, meta, v) })));
    const aprovados = conferencias.filter(v => v.elegivel).length;
    return { ...meta, quantidadeAprovada: aprovados, percentualPreparacao: Math.min(100, aprovados / meta.quantidadeExigida * 100),
      pronto: aprovados >= meta.quantidadeExigida,
      vinculos: ativos.map(v => ({...v, elegivel: conferencias.find(x => x.id === v.id)?.elegivel ?? false })) };
  }
  async listar(contratoId: string, entregavelId: string, ator: UsuarioAutenticado) {
    await this.autorizar(ator, contratoId, 'metas-marco:listar');
    return this.ds.transaction(async m => {
      await this.entregar(m, contratoId, entregavelId);
      const metas = await m.find(MetaMarco, { where: { contratoId, entregavelId, arquivadoEm: IsNull() }, order: { criadoEm: 'ASC' } });
      const itens = await Promise.all(metas.map(meta => this.montar(m, meta)));
      const total = itens.length;
      const concluidas = itens.filter(item => item.pronto).length;
      return { entregavelId, metas: itens, total, concluidas,
        percentualPreparacao: total ? Math.round(itens.reduce((n, x) => n + x.percentualPreparacao, 0) / total * 100) / 100 : 0,
        aptoPelasMetas: total > 0 && concluidas === total };
    });
  }
  async criar(contratoId: string, entregavelId: string, dto: CriarMetaMarcoDto, ator: UsuarioAutenticado) {
    await this.autorizar(ator, contratoId, 'metas-marco:criar');
    return this.ds.transaction(async m => {
      await this.entregar(m, contratoId, entregavelId, true);
      const meta = m.create(MetaMarco, { ...campos(dto), tipo: dto.tipo, contratoId, entregavelId, criadoPor: ator.id });
      this.validarDatas(meta);
      const salvo = await m.save(MetaMarco, meta);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.META_MARCO_CRIADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId, dadosPosteriores: { metaId: salvo.id, tipo: salvo.tipo, titulo: salvo.titulo, quantidadeExigida: salvo.quantidadeExigida } });
      return this.montar(m, salvo);
    });
  }
  async editar(contratoId: string, entregavelId: string, metaId: string, dto: EditarMetaMarcoDto, ator: UsuarioAutenticado) {
    await this.autorizar(ator, contratoId, 'metas-marco:editar');
    return this.ds.transaction(async m => {
      await this.entregar(m, contratoId, entregavelId, true);
      const meta = await this.meta(m, contratoId, entregavelId, metaId, true);
      const antes = { titulo: meta.titulo, quantidadeExigida: meta.quantidadeExigida, dataPrevista: meta.dataPrevista, inicioPrevisto: meta.inicioPrevisto, terminoPrevisto: meta.terminoPrevisto };
      Object.assign(meta, campos(dto)); this.validarDatas(meta);
      const salvo = await m.save(MetaMarco, meta);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.META_MARCO_EDITADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId, dadosAnteriores: { metaId, ...antes },
        dadosPosteriores: { metaId, titulo: salvo.titulo, quantidadeExigida: salvo.quantidadeExigida, dataPrevista: salvo.dataPrevista, inicioPrevisto: salvo.inicioPrevisto, terminoPrevisto: salvo.terminoPrevisto } });
      return this.montar(m, salvo);
    });
  }
  private async verificarRegistro(m: EntityManager, meta: MetaMarco, registroId: string) {
    if (meta.tipo === 'OCORRENCIA') {
      const o = await m.findOne(Ocorrencia, { where: { id: registroId, contratoId: meta.contratoId } });
      if (!o || o.substituidaEm) throw new NotFoundException('Ocorrência não pertence ao contrato deste Marco');
      return { ocorrenciaId: registroId };
    }
    if (meta.tipo === 'ATIVIDADE') {
      const a = await m.findOne(AtividadeEntity, { where: { id: registroId, contratoId: meta.contratoId }, relations: { entregaveis: true } });
      if (!a || a.excluidaEm || a.arquivadaEm || !a.entregaveis.some(e => e.contratoId === meta.contratoId))
        throw new NotFoundException('Atividade não pertence ao contrato deste Marco');
      return { atividadeId: registroId };
    }
    const c = await m.findOne(ComprovanteEvidencia, { where: { id: registroId, contratoId: meta.contratoId } });
    if (!c) throw new NotFoundException('Comprovante não pertence ao contrato deste Marco');
    return { comprovanteId: registroId };
  }
  async candidatos(contratoId: string, entregavelId: string, metaId: string, ator: UsuarioAutenticado) {
    await this.autorizar(ator, contratoId, 'metas-marco:listar');
    return this.ds.transaction(async m => {
      await this.entregar(m, contratoId, entregavelId);
      const meta = await this.meta(m, contratoId, entregavelId, metaId);
      if (meta.tipo === 'OCORRENCIA') {
        const ocorrencias = await m.find(Ocorrencia, { where: { contratoId, status: 'CONCLUIDO' as Ocorrencia['status'] } });
        return ocorrencias.filter(o => !o.substituidaEm).map(o => ({ id: o.id, titulo: o.titulo }));
      }
      if (meta.tipo === 'ATIVIDADE') {
        const atividades = await m.find(AtividadeEntity, { where: { contratoId, status: 'VERIFICADA' }, relations: { entregaveis: true } });
        return atividades.filter(a => !a.excluidaEm && !a.arquivadaEm && a.entregaveis.some(e => e.contratoId === contratoId))
          .map(a => ({ id: a.id, titulo: a.titulo }));
      }
      const comprovantes = await m.find(ComprovanteEvidencia, { where: { contratoId, status: 'VERIFICADA' } });
      return comprovantes.filter(c => c.verificadoEm).map(c => ({ id: c.id, titulo: c.nomeOriginal }));
    });
  }
  async vincular(contratoId: string, entregavelId: string, metaId: string, registroId: string, ator: UsuarioAutenticado) {
    await this.autorizar(ator, contratoId, 'metas-marco:vincular');
    return this.ds.transaction(async m => {
      await this.entregar(m, contratoId, entregavelId, true);
      const meta = await this.meta(m, contratoId, entregavelId, metaId, true);
      const alvo = await this.verificarRegistro(m, meta, registroId);
      const ativos = await m.find(VinculoMetaMarco, { where: { metaId, contratoId } });
      if (ativos.some(v => v.status !== 'REJEITADO' && (v.ocorrenciaId === registroId || v.atividadeId === registroId || v.comprovanteId === registroId)))
        throw new ConflictException('Este registro já está vinculado ou aguarda aprovação');
      const vinculo = await m.save(VinculoMetaMarco, m.create(VinculoMetaMarco,
        { metaId, contratoId, ...alvo, status: 'PENDENTE', solicitadoPor: ator.id }));
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.META_MARCO_VINCULO_SOLICITADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId, dadosPosteriores: { metaId, vinculoId: vinculo.id, registroId } });
      return this.montar(m, meta);
    });
  }
  async decidir(contratoId: string, entregavelId: string, metaId: string, vinculoId: string,
    aprovar: boolean, justificativa: string | undefined, ator: UsuarioAutenticado) {
    await this.autorizar(ator, contratoId, 'metas-marco:decidir');
    return this.ds.transaction(async m => {
      await this.entregar(m, contratoId, entregavelId, true);
      const meta = await this.meta(m, contratoId, entregavelId, metaId, true);
      const v = await m.findOne(VinculoMetaMarco, { where: { id: vinculoId, metaId, contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!v) throw new NotFoundException('Vínculo inexistente');
      if (v.status !== 'PENDENTE') throw new ConflictException('O vínculo já foi decidido');
      if (aprovar && !await this.elegivel(m, meta, v))
        throw new ConflictException('O registro precisa estar concluído ou verificado para sustentar a meta');
      v.status = aprovar ? 'APROVADO' : 'REJEITADO'; v.decididoPor = ator.id; v.decididoEm = new Date(); v.justificativa = justificativa?.trim() || null;
      await m.save(VinculoMetaMarco, v);
      await this.auditoria.registrarNaTransacao(m, ator, { acao: AcaoAuditoria.META_MARCO_VINCULO_DECIDIDO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId, dadosAnteriores: { metaId, vinculoId, status: 'PENDENTE' },
        dadosPosteriores: { metaId, vinculoId, status: v.status, justificativa: v.justificativa } });
      return this.montar(m, meta);
    });
  }
}
