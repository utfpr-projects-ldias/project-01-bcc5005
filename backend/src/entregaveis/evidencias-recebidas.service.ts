import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';
import { normalizarNomeArquivo } from '../armazenamento/nome-arquivo.js';
import { createHash } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger,
  NotFoundException, PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { ARMAZENAMENTO_ARQUIVOS, type ArmazenamentoArquivos } from '../armazenamento/contrato-armazenamento.js';
import { ArmazenamentoIndisponivelError } from '../armazenamento/armazenamento-local.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError } from '../armazenamento/politica-arquivos.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { documentacaoVerificada, concluirEtapaAposFilhos, atividadesPendentesDeVerificacao } from './conclusao-documental.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { StatusEtapa } from '../etapas/status-etapa.enum.js';
import { StatusContrato } from '../contratos/status-contrato.enum.js';
import { StatusExecucaoEntregavel } from './status-execucao-entregavel.enum.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import type { EditarEvidenciaEsperadaDto, EnviarComprovanteDto } from './dto/evidencias-recebidas.dto.js';

export type ArquivoComprovante = { originalname: string; mimetype: string; buffer: Buffer; size: number };

function publico(c: ComprovanteEvidencia) {
  return { id: c.id, autorId: c.autorId, nomeOriginal: c.nomeOriginal, tipoMime: c.tipoMime,
    tamanho: c.tamanho, descricao: c.descricao, status: c.status, verificadoPor: c.verificadoPor,
    verificadoEm: c.verificadoEm, criadoEm: c.criadoEm };
}

/** Escopo sempre obtido das FKs do banco. Nenhuma decisão é baseada em IDs do corpo HTTP. */
@Injectable()
export class EvidenciasRecebidasService {
  private readonly logger = new Logger(EvidenciasRecebidasService.name);
  constructor(
    @InjectRepository(ComprovanteEvidencia) private readonly comprovantes: Repository<ComprovanteEvidencia>,
    private readonly db: DataSource,
    private readonly auditoria: AuditoriaService,
    @Inject(ARMAZENAMENTO_ARQUIVOS) private readonly armazenamento: ArmazenamentoArquivos,
  ) {}

  private async contexto(m: EntityManager, contratoId: string, entregavelId: string, esperadaId: string) {
    const entregavel = await m.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
    const esperada = await m.getRepository(EvidenciaEsperada).findOneBy({ id: esperadaId, entregavelId });
    if (!entregavel || !esperada) throw new NotFoundException('Evidência não encontrada neste entregável');
    return { entregavel, esperada };

  }
  private validarPlanejamentoAtivo(entregavel: Entregavel, esperada: EvidenciaEsperada): void {
    if (['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? '')) throw new ConflictException('Entregável concluído: reabra antes de alterar evidências');
    if (entregavel.arquivadoEm || esperada.arquivadoEm)
      throw new ConflictException('Item arquivado: reative-o antes de enviar, editar ou verificar comprovantes');
  }
  /** Arquivar uma etapa bloqueia operações em todos os seus descendentes.
   * Leitura histórica continua permitida; esta checagem é exclusiva de mutações. */
  private async etapaAtiva(m: EntityManager, entregavel: Entregavel): Promise<void> {
    if (!entregavel.etapaId) return; // fixtures legadas sem relacionamento
    const etapa = await m.getRepository(Etapa).findOneBy({ id: entregavel.etapaId, contratoId: entregavel.contratoId });
    if (!etapa) throw new NotFoundException('Etapa vinculada não encontrada');
    if (etapa.arquivadoEm) throw new ConflictException('Etapa arquivada: reative a etapa antes de alterar evidências');
    if ((etapa.status === 'CONCLUIDA' || etapa.status === 'ENCERRADA') && !etapa.reabertoEm)
      throw new ConflictException('Etapa concluída: reabra a etapa antes de alterar evidências');
  }
  private async contratoEditavel(m: EntityManager, contratoId: string) {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :id', { id: contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado: operação não permitida');
    // A documentação estar completa não é decisão formal de conclusão.
    // Evita bloquear comprovantes de novos entregáveis em contrato ainda aberto.
    if (['CONCLUIDO','ENCERRADO','FINALIZADO'].includes(contrato.status))
      throw new ConflictException('Contrato finalizado: reabra-o antes de alterar evidências');
  }
  private async leituraDeArquivoPermitida(ator: UsuarioAutenticado, entregavel: Entregavel): Promise<boolean> {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return true;
    const vinculo = await this.db.getRepository(PermissaoContrato).findOneBy({ contratoId: entregavel.contratoId, usuarioId: ator.id });
    return Boolean(vinculo && ator.perfil === PerfilUsuario.GESTOR && vinculo.podeEditar);
  }
  private async verificadorAutorizado(m: EntityManager, ator: UsuarioAutenticado, entregavel: Entregavel) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return true;
    const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId: entregavel.contratoId, usuarioId: ator.id });
    if (!vinculo) return false;
    const efetivas = permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas);
    return efetivas.verificarComprovantes &&
      ((ator.perfil === PerfilUsuario.GESTOR && vinculo.podeEditar) || entregavel.responsavelId === ator.id ||
        vinculo.permissoesDetalhadas?.verificarComprovantes === true);
  }
  private async versoes(m: EntityManager, esperadaId: string) {
    return m.getRepository(ComprovanteEvidencia).find({ where: { evidenciaEsperadaId: esperadaId },
      order: { criadoEm: 'DESC', id: 'DESC' } });
  }
  async detalhar(contratoId: string, entregavelId: string, esperadaId: string, ator: UsuarioAutenticado) {
    const { entregavel, esperada } = await this.contexto(this.db.manager, contratoId, entregavelId, esperadaId);
    if ((entregavel.arquivadoEm || esperada.arquivadoEm) && !await this.leituraDeArquivoPermitida(ator, entregavel))
      throw new NotFoundException('Evidência não encontrada');
    const versoes = await this.versoes(this.db.manager, esperadaId);
    const ultima = versoes[0];
    const contrato = await this.db.getRepository(Contrato).findOne({ where: { id: contratoId }, select: { arquivadoEm: true } });
    const etapaPai = entregavel.etapaId
      ? await this.db.getRepository(Etapa).findOneBy({ id: entregavel.etapaId, contratoId }) : null;
    // A trilha de auditoria já existe na base; filtrar também pelo ID do item
    // para não revelar operações de outras evidências do mesmo entregável.
    const eventos = await this.db.getRepository(EventoAuditoria).find({
      where: { contratoId, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId },
      order: { registradoEm: 'DESC' }, take: 300,
    });
    const relevantes = eventos.filter(ev => {
      const a = ev.dadosAnteriores ?? {}, d = ev.dadosPosteriores ?? {};
      return a['itemId'] === esperadaId || d['itemId'] === esperadaId ||
        a['evidenciaEsperadaId'] === esperadaId || d['evidenciaEsperadaId'] === esperadaId;
    });
    const ids = [...new Set(versoes.flatMap(v => [v.autorId, v.verificadoPor].filter((id): id is string => Boolean(id))))];
    const stIds = [...new Set(relevantes.map(ev => ev.atorSupertokensUserId))];
    const filtros = [
      ...(ids.length ? [{ id: In(ids) }] : []),
      ...(stIds.length ? [{ supertokensUserId: In(stIds) }] : []),
    ];
    const pessoas = filtros.length ? await this.db.getRepository(Usuario).find({
      where: filtros, select: { id: true, supertokensUserId: true, nome: true, email: true },
    }) : [];
    const arquivoPorId = new Map(versoes.map(v => [v.id, v.nomeOriginal]));
    const porId = new Map(pessoas.map(u => [u.id, u]));
    const porSt = new Map(pessoas.map(u => [u.supertokensUserId, u]));
    const pessoa = (u: Usuario | undefined) => u ? { nome: u.nome ?? 'Nome não informado', email: u.email } : null;
    const descricoes: Record<string, string> = {
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA]: 'Planejamento da evidência cadastrado ou atualizado',
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO]: 'Comprovante enviado',
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO]: 'Comprovante verificado',
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REABERTO]: 'Evidência reaberta para verificação',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA]: 'Evidência arquivada',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_REATIVADA]: 'Evidência reativada',
    };
    return {
      id: esperada.id, codigoPublico: esperada.codigoPublico, entregavelId, contratoId, tipoEvidencia: esperada.tipoEvidencia,
      descricao: esperada.descricao, obrigatoria: esperada.obrigatoria,
      arquivadoEm: esperada.arquivadoEm ?? null, reabertoEm: esperada.reabertoEm ?? null,
      entregavelArquivadoEm: entregavel.arquivadoEm ?? null,
      status: ultima?.status ?? 'SEM_ENVIO',
      versoes: versoes.map(v => ({ ...publico(v),
        enviadoPor: pessoa(porId.get(v.autorId)), verificadoPorUsuario: pessoa(porId.get(v.verificadoPor ?? '')) })),
      historico: relevantes.map(ev => ({ id: ev.id, acao: ev.acao,
        descricao: ev.acao === AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA && ev.dadosPosteriores?.['operacao'] === 'CRIAR_ITEM'
          ? 'Evidência cadastrada' : descricoes[ev.acao] ?? 'Alteração registrada',
        ocorridoEm: ev.registradoEm, ator: pessoa(porSt.get(ev.atorSupertokensUserId)),
        nomeAnterior: typeof ev.dadosAnteriores?.['tipoEvidencia'] === 'string' &&
          ev.dadosAnteriores['tipoEvidencia'] !== ev.dadosPosteriores?.['tipoEvidencia']
          ? ev.dadosAnteriores['tipoEvidencia'] : null,
        nomeAtual: typeof ev.dadosPosteriores?.['tipoEvidencia'] === 'string' &&
          ev.dadosAnteriores?.['tipoEvidencia'] !== ev.dadosPosteriores['tipoEvidencia']
          ? ev.dadosPosteriores['tipoEvidencia'] : null,
        justificativa: typeof ev.dadosPosteriores?.['justificativa'] === 'string' ? ev.dadosPosteriores['justificativa'].slice(0, 200) : null,
        nomeArquivo: (() => {
          const dados = ev.dadosPosteriores ?? {};
          const anteriores = ev.dadosAnteriores ?? {};
          // Nome original registrado na auditoria representa a versão da época;
          // não exigir que o arquivo antigo ainda esteja na tabela de versões.
          if (typeof dados['nomeOriginal'] === 'string') return dados['nomeOriginal'];
          if (typeof anteriores['nomeOriginal'] === 'string') return anteriores['nomeOriginal'];
          const id = dados['comprovanteId'] ?? anteriores['comprovanteId'];
          return typeof id === 'string' ? arquivoPorId.get(id) ?? null : null;
        })(),
      })),
      podeVerificar: Boolean(!contrato?.arquivadoEm && !etapaPai?.arquivadoEm &&
        etapaPai?.status !== StatusEtapa.CONCLUIDA && etapaPai?.status !== StatusEtapa.ENCERRADA && !entregavel.arquivadoEm &&
        entregavel.statusExecucao !== StatusExecucaoEntregavel.CONCLUIDO && !esperada.arquivadoEm && ultima && ultima.status === 'PENDENTE_VERIFICACAO' &&
        await this.verificadorAutorizado(this.db.manager, ator, entregavel)),
    };
  }
  /** Somente ADMIN ou delegação nominal permite tornar uma evidência opcional. */
  private async alterarObrigatoriedadePermitido(m: EntityManager, contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return true;
    const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
    return Boolean(vinculo?.permissoesDetalhadas?.alterarObrigatoriedade);
  }
  /** Um novo requisito por chamada: não substitui o checklist já cadastrado. */
  async criarEsperada(contratoId: string, entregavelId: string, dto: EditarEvidenciaEsperadaDto, ator: UsuarioAutenticado) {
    const tipoEvidencia = dto.tipoEvidencia?.trim();
    if (!tipoEvidencia)
      throw new BadRequestException('Informe o tipo da evidência');
    return this.db.transaction(async m => {
      await this.contratoEditavel(m, contratoId);
      const e = await m.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      if (e.arquivadoEm) throw new ConflictException('Entregável arquivado');
      await this.etapaAtiva(m, e);
      // Evidências previamente verificadas não fecham automaticamente o planejamento.
      // Apenas o estado explícito CONCLUIDO/FINALIZADO bloqueia uma nova exigência.
      if (['CONCLUIDO', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Entregável fechado ou aguardando aprovação: reabra antes de cadastrar outra evidência');
      if (dto.obrigatoria === false && !await this.alterarObrigatoriedadePermitido(m, contratoId, ator))
        throw new ForbiddenException('Somente Administrador ou usuário delegado pode cadastrar evidência opcional');
      const repo = m.getRepository(EvidenciaEsperada);
      const total = await repo.count({ where: { entregavelId } });
      if (total >= 10) throw new ConflictException('Limite de dez evidências por entregável, incluindo arquivadas');
      const criado = await repo.save(repo.create({ entregavelId, tipoEvidencia,
        descricao: dto.descricao?.trim() || null, obrigatoria: dto.obrigatoria !== false }));
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosPosteriores: { operacao: 'CRIAR_ITEM', itemId: criado.id,
          tipoEvidencia: criado.tipoEvidencia, obrigatoria: criado.obrigatoria },
      });
      return { id: criado.id, tipoEvidencia: criado.tipoEvidencia,
        descricao: criado.descricao, obrigatoria: criado.obrigatoria };
    });
  }
  /** Modifica apenas UM item. Os demais itens do checklist e seus comprovantes são preservados. */
  async editarEsperada(contratoId: string, entregavelId: string, esperadaId: string,
    dto: EditarEvidenciaEsperadaDto, ator: UsuarioAutenticado) {
    if (!Object.keys(dto).length) throw new BadRequestException('Informe ao menos um campo');
    return this.db.transaction(async m => {
      await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      // Um documento já verificado não pode ter seus critérios alterados sem reabertura explícita.
      const ultima = await m.getRepository(ComprovanteEvidencia).findOne({
        where: { evidenciaEsperadaId: esperadaId }, order: { criadoEm: 'DESC', id: 'DESC' },
      });
      if (ultima?.status === 'VERIFICADA') throw new ConflictException('Evidência verificada: reabra antes de editar');
      const anterior = { itemId: esperada.id, tipoEvidencia: esperada.tipoEvidencia, descricao: esperada.descricao, obrigatoria: esperada.obrigatoria };
      if (dto.tipoEvidencia !== undefined) esperada.tipoEvidencia = dto.tipoEvidencia.trim();
      if (dto.descricao !== undefined) esperada.descricao = dto.descricao?.trim() || null;
      if (dto.obrigatoria !== undefined && dto.obrigatoria !== esperada.obrigatoria) {
        if (!await this.alterarObrigatoriedadePermitido(m, contratoId, ator))
          throw new ForbiddenException('Alterar obrigatoriedade requer autorização específica');
        esperada.obrigatoria = dto.obrigatoria;
      }
      if (!esperada.tipoEvidencia || (esperada.descricao !== null && !esperada.descricao))
        throw new BadRequestException('Os dados da evidência não podem ser vazios');
      await m.getRepository(EvidenciaEsperada).save(esperada);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: anterior,
        dadosPosteriores: { operacao: 'EDITAR_ITEM', itemId: esperada.id,
          tipoEvidencia: esperada.tipoEvidencia, descricao: esperada.descricao, obrigatoria: esperada.obrigatoria },
      });
      return { id: esperada.id, tipoEvidencia: esperada.tipoEvidencia, descricao: esperada.descricao, obrigatoria: esperada.obrigatoria };
    });
  }
  async enviar(contratoId: string, entregavelId: string, esperadaId: string,
    arquivo: ArquivoComprovante | undefined, dto: EnviarComprovanteDto, ator: UsuarioAutenticado) {
    if (!arquivo || !Buffer.isBuffer(arquivo.buffer) || arquivo.size !== arquivo.buffer.length)
      throw new BadRequestException('Selecione um arquivo válido');
    // Verificar escopo antes de criar blob; repetir sob lock na transação.
    const antes = await this.contexto(this.db.manager, contratoId, entregavelId, esperadaId);
    this.validarPlanejamentoAtivo(antes.entregavel, antes.esperada);
    await this.etapaAtiva(this.db.manager, antes.entregavel);
    const nomeRecebido = normalizarNomeArquivo(arquivo.originalname);
    const validarTipo = (tipo: string) => {
      const categoria = tipo.trim().toLocaleLowerCase('pt-BR');
      if (categoria !== 'foto' && categoria !== 'relatório') return; // checklist legado
      const extensao = /\.[^.]+$/.exec(nomeRecebido)?.[0]?.toLowerCase();
      const permitidas = categoria === 'foto'
        ? ['.png', '.jpg', '.jpeg', '.webp'] : ['.pdf', '.doc', '.docx', '.txt'];
      if (!extensao || !permitidas.includes(extensao))
        throw new BadRequestException('O formato do arquivo não corresponde ao tipo da evidência');
    };
    validarTipo(antes.esperada.tipoEvidencia);
    let pendente: Awaited<ReturnType<ArmazenamentoArquivos['salvar']>>;
    try {
      pendente = await this.armazenamento.salvar({ nomeOriginal: nomeRecebido,
        mimeDeclarado: arquivo.mimetype, conteudo: arquivo.buffer });
    } catch (e) {
      if (e instanceof ArquivoInvalidoError) throw new BadRequestException('Formato do arquivo inválido ou não permitido');
      if (e instanceof LimiteArmazenamentoError) throw new PayloadTooLargeException('Arquivo acima do limite permitido');
      throw new ServiceUnavailableException('Não foi possível receber o arquivo');
    }
    let salvo: ComprovanteEvidencia;
    try {
      salvo = await this.db.transaction(async m => {
        await this.contratoEditavel(m, contratoId);
        const atual = await this.contexto(m, contratoId, entregavelId, esperadaId);
        this.validarPlanejamentoAtivo(atual.entregavel, atual.esperada);
        await this.etapaAtiva(m, atual.entregavel);
        validarTipo(atual.esperada.tipoEvidencia);
        const repo = m.getRepository(ComprovanteEvidencia);
        // Depois da verificação, o comprovante fica encerrado. Nunca aceitar
        // troca silenciosa do documento verificado, nem em corrida entre envios.
        const ultima = await repo.createQueryBuilder('c').setLock('pessimistic_write')
          .where('c.evidenciaEsperadaId = :esperadaId', { esperadaId })
          .orderBy('c.criadoEm', 'DESC').addOrderBy('c.id', 'DESC').getOne();
        if (ultima?.status === 'VERIFICADA')
          throw new ConflictException('Comprovante verificado. Solicite a reabertura da evidência antes de substituir o arquivo.');
        const novo = repo.create({ contratoId, entregavelId, evidenciaEsperadaId: esperadaId,
          autorId: ator.id, nomeOriginal: pendente.nomeOriginal, tipoMime: pendente.mimeEfetivo,
          tamanho: pendente.tamanho, sha256: pendente.sha256, storageKey: pendente.chave,
          descricao: dto.descricao?.trim() || null, status: 'PENDENTE_VERIFICACAO',
          verificadoPor: null, verificadoEm: null });
        const criado = await repo.save(novo);
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO,
          entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
          dadosPosteriores: { comprovanteId: criado.id, evidenciaEsperadaId: esperadaId,
            nomeOriginal: criado.nomeOriginal, tamanho: criado.tamanho, status: criado.status },
        });
        return criado;
      });
    } catch (e) {
      try { await this.armazenamento.removerOrfao(pendente); }
      catch { this.logger.error('Falha ao reconciliar blob após rollback de comprovante');
        throw new ServiceUnavailableException('Armazenamento requer reconciliação'); }
      if (e instanceof ConflictException || e instanceof NotFoundException || e instanceof BadRequestException) throw e;
      this.logger.error('Falha no registro de comprovante');
      throw new ServiceUnavailableException('Falha ao registrar o comprovante');
    }
    try { this.armazenamento.confirmarPersistencia(pendente); }
    catch { this.logger.error('Comprovante persistido com confirmação local pendente');
      throw new ServiceUnavailableException('Comprovante registrado, confirme o armazenamento'); }
    return publico(salvo);
  }
  /** A confirmação de todas as provas é um gatilho de conclusão solicitado pelo cliente.
   * Mantém explicitamente execução e comprovação como dados distintos, mas registra
   * uma transição operacional auditável (nunca apenas uma cor/etiqueta na interface).
   * Chamado dentro da mesma transação e com a linha do contrato bloqueada. */
  private async concluirHierarquiaSeComprovada(m: EntityManager, ator: UsuarioAutenticado,
    contratoId: string, entregavel: Entregavel): Promise<string[]> {
    const conclusoes: string[] = [];
    const repoEntregavel = m.getRepository(Entregavel);
    // Uma NOVA verificação completa encerra também uma revisão do entregável.
    // Reabrir sem verificar nada não dispara esta função: exige Concluir explícito.
    if (!entregavel.arquivadoEm &&
        (entregavel.statusExecucao !== StatusExecucaoEntregavel.CONCLUIDO || entregavel.reabertoEm) &&
        await documentacaoVerificada(m, contratoId, entregavel.etapaId, entregavel.id) &&
        !await atividadesPendentesDeVerificacao(m, contratoId, null, entregavel.id) &&
        (await aptidaoFisicaParaConclusao(m, entregavel)).apto) {
      const anterior = entregavel.statusExecucao;
      const reabertoAntes = entregavel.reabertoEm ?? null;
      entregavel.statusExecucao = StatusExecucaoEntregavel.CONCLUIDO;
      entregavel.reabertoEm = null;
      await repoEntregavel.save(entregavel);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavel.id,
        dadosAnteriores: { statusExecucao: anterior, reabertoEm: reabertoAntes },
        dadosPosteriores: { statusExecucao: entregavel.statusExecucao, reabertoEm: null, motivo: 'COMPROVACAO_COMPLETA' },
      });
      conclusoes.push('entregável');
    }
    // A etapa pode ter sido explicitamente reaberta. Só se fecha quando
    // TODOS os entregáveis estiverem novamente concluídos e sem revisão.
    if (await concluirEtapaAposFilhos(m, contratoId, entregavel.etapaId, async (antes, depois) => {
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ETAPA_STATUS_ALTERADO, entidadeTipo: 'ETAPA', entidadeId: entregavel.etapaId,
        dadosAnteriores: antes,
        dadosPosteriores: { ...depois, motivo: 'COMPROVACAO_COMPLETA' },
      });
    }, ator.id)) conclusoes.push('etapa');
    // Um contrato documentalmente completo aguarda conclusão operacional explícita.
    // A ação PATCH /contratos/:id/concluir verifica a permissão e registra auditoria.
    return conclusoes;
  }
  async verificar(contratoId: string, entregavelId: string, esperadaId: string, comprovanteId: string,
    ator: UsuarioAutenticado) {
    return this.db.transaction(async m => {
      await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      const repo = m.getRepository(ComprovanteEvidencia);
      const ultima = await repo.createQueryBuilder('c').setLock('pessimistic_write').where('c.evidenciaEsperadaId = :esperadaId', { esperadaId })
        .orderBy('c.criadoEm', 'DESC').addOrderBy('c.id', 'DESC').getOne();
      if (!ultima || ultima.id !== comprovanteId || ultima.contratoId !== contratoId || ultima.entregavelId !== entregavelId)
        throw new ConflictException('Só o envio mais recente pode ser verificado');
      if (ultima.status !== 'PENDENTE_VERIFICACAO') throw new ConflictException('Comprovante já verificado');
      if (!await this.verificadorAutorizado(m, ator, entregavel)) throw new ForbiddenException('Sem permissão para verificar esta evidência');
      ultima.status = 'VERIFICADA'; ultima.verificadoPor = ator.id; ultima.verificadoEm = new Date();
      if (esperada.reabertoEm) {
        await m.getRepository(EvidenciaEsperada).update({ id: esperadaId, entregavelId }, { reabertoEm: null });
      }
      const resultado = await repo.save(ultima);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { comprovanteId, evidenciaEsperadaId: esperadaId, status: 'PENDENTE_VERIFICACAO' },
        dadosPosteriores: { comprovanteId, evidenciaEsperadaId: esperadaId, status: resultado.status,
          verificadoPor: ator.id, verificadoEm: resultado.verificadoEm },
      });
      const conclusoes = await this.concluirHierarquiaSeComprovada(m, ator, contratoId, entregavel);
      return { ...publico(resultado), conclusoes };
    });
  }
  /** Retorna o comprovante mais recente à análise, mantendo o arquivo e a auditoria. */
  async reabrir(contratoId: string, entregavelId: string, esperadaId: string, ator: UsuarioAutenticado, motivo?: string) {
    return this.db.transaction(async m => {
      await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      // Checklist documental 100% não é, por si só, conclusão física do entregável.
      // Bloqueie apenas se a decisão de conclusão operacional realmente estiver vigente.
      if (!entregavel.reabertoEm && entregavel.statusExecucao === StatusExecucaoEntregavel.CONCLUIDO)
        throw new ConflictException('Reabra o entregável concluído antes de reabrir suas evidências');
      const repo = m.getRepository(ComprovanteEvidencia);
      const ultima = await repo.createQueryBuilder('c').setLock('pessimistic_write')
        .where('c.evidenciaEsperadaId = :esperadaId', { esperadaId })
        .orderBy('c.criadoEm', 'DESC').addOrderBy('c.id', 'DESC').getOne();
      if (!ultima || ultima.status !== 'VERIFICADA' || ultima.contratoId !== contratoId || ultima.entregavelId !== entregavelId)
        throw new ConflictException('Somente uma evidência verificada pode ser reaberta');
      const verificadoPor = ultima.verificadoPor;
      const verificadoEm = ultima.verificadoEm;
      ultima.status = 'PENDENTE_VERIFICACAO'; ultima.verificadoPor = null; ultima.verificadoEm = null;
      esperada.reabertoEm = new Date();
      await m.getRepository(EvidenciaEsperada).save(esperada);
      await repo.save(ultima);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REABERTO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { comprovanteId: ultima.id, evidenciaEsperadaId: esperadaId, status: 'VERIFICADA', verificadoPor, verificadoEm },
        dadosPosteriores: { comprovanteId: ultima.id, evidenciaEsperadaId: esperadaId, status: ultima.status, ...(motivo ? { justificativa: motivo } : {}) },
      });
      return publico(ultima);
    });
  }

  async baixar(contratoId: string, entregavelId: string, esperadaId: string, comprovanteId: string, ator: UsuarioAutenticado) {
    const contexto = await this.contexto(this.db.manager, contratoId, entregavelId, esperadaId);
    if ((contexto.entregavel.arquivadoEm || contexto.esperada.arquivadoEm) && !await this.leituraDeArquivoPermitida(ator, contexto.entregavel))
      throw new NotFoundException('Comprovante não encontrado');
    const item = await this.comprovantes.createQueryBuilder('c').addSelect('c.storageKey')
      .where('c.id = :comprovanteId AND c.contratoId = :contratoId AND c.entregavelId = :entregavelId AND c.evidenciaEsperadaId = :esperadaId',
        { comprovanteId, contratoId, entregavelId, esperadaId }).getOne();
    if (!item) throw new NotFoundException('Comprovante não encontrado');
    let bytes: Buffer;
    try { bytes = await this.armazenamento.ler(item.storageKey); }
    catch (e) {
      if (e instanceof ArmazenamentoIndisponivelError) this.logger.error('Blob do comprovante indisponível');
      throw new ServiceUnavailableException('Arquivo temporariamente indisponível');
    }
    if (bytes.length !== item.tamanho || createHash('sha256').update(bytes).digest('hex') !== item.sha256)
      throw new ServiceUnavailableException('Integridade do comprovante não confere');
    return { nomeOriginal: item.nomeOriginal, tipoMime: item.tipoMime, bytes };
  }
}
