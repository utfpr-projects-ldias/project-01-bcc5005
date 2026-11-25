import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { operacaoUpload, recuperarUpload, registrarUpload } from '../armazenamento/idempotencia-upload.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { lerArquivoIntegro } from '../armazenamento/integridade-arquivo.js';
import { milesimos } from '../common/quantidade-exata.js';
import { reconhecerExecucaoOcorrencia } from '../ocorrencias/reconhecer-execucao-ocorrencia.js';
import { protegerReferenciaManual } from '../execucao/proteger-referencia-execucao.js';
import { iniciarHierarquiaOperacional } from '../execucao/inicio-operacional.js';
import { snapshotParcela } from '../execucao/snapshot-parcela.js';
import { destinosEvidencia } from './evidencia-compartilhada.js';
import { idsVinculadosEnvio } from './vinculos-envio-evidencia.js';
import { criarParcela, centesimos, validarSaldoParcelas, exigirPermissaoParcela, aceitaParcelas, exigirOcorrenciaParcela, resumoParcelas } from '../execucao/parcelas-execucao.js';
import { ExecucaoLancamento } from '../execucao/execucao-lancamento.entity.js';
import { hojeCivil } from '../common/data-civil.js';
import { normalizarNomeArquivo } from '../armazenamento/nome-arquivo.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger,
  NotFoundException, PayloadTooLargeException, ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull, Raw, Repository } from 'typeorm';
import { ARMAZENAMENTO_ARQUIVOS, type ArmazenamentoArquivos } from '../armazenamento/contrato-armazenamento.js';
import { ArmazenamentoIndisponivelError } from '../armazenamento/armazenamento-local.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError } from '../armazenamento/politica-arquivos.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
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
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { resumoMedicao } from '../ocorrencias/medicao-ocorrencia.js';
import { normalizarVinculoQuantidade, validarOcorrenciaQuantidade, validarContribuicaoEvidencia, listarExecucoesQuantitativas, listarQuantidadeDireta, listarReferenciasDiretas } from './quantidade-evidencias.js';
import type { EditarVinculosEvidenciaDto, EditarContribuicaoEvidenciaDto, EditarEvidenciaEsperadaDto, EnviarComprovanteDto, VerificarComprovanteDto } from './dto/evidencias-recebidas.dto.js';

export type ArquivoComprovante = { originalname: string; mimetype: string; buffer: Buffer; size: number };

function resumoRascunho(dto: EnviarComprovanteDto) {
  return {quantidadeExecutada:dto.quantidadeExecutada??null,percentualExecucao:dto.percentualExecucao??null,
    ocorrenciaQuantidadeId:dto.ocorrenciaQuantidadeId??null,ocorrenciaExecucaoId:dto.ocorrenciaExecucaoId??null,
    origemQuantidade:dto.origemQuantidade??null,referenciaExecucao:dto.referenciaExecucao??null,
    comprovaExecucaoId:dto.comprovaExecucaoId??null,ocorrencias:idsVinculadosEnvio(dto.ocorrenciasVinculadas),
    atividades:idsVinculadosEnvio(dto.atividadesVinculadas),totalDestinos:destinosEvidencia(dto.destinosCompartilhados).length};
}

function publico(c: ComprovanteEvidencia) {
  return { id: c.id, grupoCompartilhadoId: c.grupoCompartilhadoId ?? null, autorId: c.autorId, nomeOriginal: c.nomeOriginal, tipoMime: c.tipoMime,
    tamanho: c.tamanho, descricao: c.descricao, status: c.status, verificadoPor: c.verificadoPor,
    verificadoEm: c.verificadoEm, criadoEm: c.criadoEm,
    quantidadeDeclarada: c.quantidadeDeclarada ?? null, quantidadeAprovada: c.quantidadeAprovada ?? null, ocorrenciaQuantidadeId: c.ocorrenciaQuantidadeId ?? null, origemQuantidade: c.origemQuantidade ?? null, referenciaExecucao: c.referenciaExecucao ?? null };
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

  /** A ACL do contrato de origem nunca concede acesso aos demais destinos. */
  private async permissaoDestino(m: EntityManager, contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return { enviar: true, criarOpcional: true, compartilhar: true };
    const v = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
    if (!v) return { enviar: false, criarOpcional: false, compartilhar: false };
    const p = permissoesEfetivas(ator.perfil, v.podeEditar, v.permissoesDetalhadas);
    return { enviar: p.enviarComprovantes, criarOpcional: p.criarEvidencias && p.alterarObrigatoriedade, compartilhar: p.compartilharEvidencias };
  }
  async listarDestinos(contratoId: string, entregavelId: string, ator: UsuarioAutenticado) {
    if (!await this.db.manager.findOneBy(Entregavel,{id:entregavelId,contratoId})) throw new NotFoundException('Entregável não encontrado');
    const origem = await this.permissaoDestino(this.db.manager,contratoId,ator);
    if (!origem.enviar || !origem.compartilhar) return [];
    const linhas: {contratoId:string;contrato:string;entregavelId:string;entregavel:string;esperadaId:string|null;tipo:string|null;descricao:string|null}[] = await this.db.manager.query(`
      SELECT c.id AS "contratoId",c.numero_contrato AS contrato,e.id AS "entregavelId",e.nome AS entregavel,
        ev.id AS "esperadaId",ev.tipo_evidencia AS tipo,ev.descricao
      FROM entregaveis e JOIN contratos c ON c.id=e.contrato_id JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=c.id
      LEFT JOIN evidencias_esperadas ev ON ev.entregavel_id=e.id AND ev.arquivado_em IS NULL
        AND ev.rascunho_envio IS NULL
        AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia ce WHERE ce.evidencia_esperada_id=ev.id)
      WHERE e.id<>$1 AND c.arquivado_em IS NULL AND c.conclusao_solicitada_em IS NULL AND c.status IN ('PLANEJAMENTO','EM_EXECUCAO','EM_ENCERRAMENTO')
        AND et.arquivado_em IS NULL AND et.conclusao_solicitada_em IS NULL AND et.encerramento_solicitado_em IS NULL
        AND et.status NOT IN ('CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA')
        AND e.arquivado_em IS NULL AND COALESCE(e.status_execucao::text,'') NOT IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO')
        AND ($2::boolean OR EXISTS(SELECT 1 FROM permissoes_contrato pc WHERE pc.contrato_id=c.id AND pc.usuario_id=$3))
      ORDER BY c.numero_contrato,e.nome,ev.tipo_evidencia`,[entregavelId,ator.perfil===PerfilUsuario.ADMINISTRADOR,ator.id]);
    const permissoes = new Map<string,Awaited<ReturnType<EvidenciasRecebidasService['permissaoDestino']>>>();
    const saida: typeof linhas = [];
    const opcionais = new Set<string>();
    for (const linha of linhas) {
      if (!permissoes.has(linha.contratoId)) permissoes.set(linha.contratoId,await this.permissaoDestino(this.db.manager,linha.contratoId,ator));
      const p=permissoes.get(linha.contratoId)!;
      if (!p.enviar || !p.compartilhar) continue;
      if (linha.esperadaId) saida.push(linha);
      if (p.criarOpcional && !opcionais.has(linha.entregavelId)) { opcionais.add(linha.entregavelId); saida.push({...linha,esperadaId:null,tipo:null,descricao:null}); }
    }
    return saida;
  }
  private async vinculosCompartilhados(m: EntityManager, grupo: string, ator: UsuarioAutenticado) {
    const rows: {contratoId:string;contrato:string;entregavelId:string;entregavel:string;esperadaId:string;comprovanteId:string;status:string;vigente:boolean;somenteDocumento:boolean}[] = await m.query(`
      SELECT c.contrato_id AS "contratoId",ct.numero_contrato AS contrato,c.entregavel_id AS "entregavelId",e.nome AS entregavel,
        c.evidencia_esperada_id AS "esperadaId",c.id AS "comprovanteId",c.status,
        (ev.arquivado_em IS NULL AND e.arquivado_em IS NULL AND ct.arquivado_em IS NULL AND et.arquivado_em IS NULL AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))) AS vigente,
        (c.quantidade_declarada IS NULL AND NOT EXISTS(SELECT 1 FROM execucoes_entregavel l WHERE l.origem='EVIDENCIA' AND l.origem_id=c.id)) AS "somenteDocumento"
      FROM comprovantes_evidencia c JOIN contratos ct ON ct.id=c.contrato_id JOIN entregaveis e ON e.id=c.entregavel_id JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
      WHERE c.grupo_compartilhado_id=$1 AND ($2::boolean OR EXISTS(SELECT 1 FROM permissoes_contrato p WHERE p.contrato_id=c.contrato_id AND p.usuario_id=$3) OR ct.responsavel_interno_id=$3)
      ORDER BY ct.numero_contrato,e.nome,c.id`,[grupo,ator.perfil===PerfilUsuario.ADMINISTRADOR,ator.id]);
    return Promise.all(rows.map(async r=>{
      const e=await m.findOneBy(Entregavel,{id:r.entregavelId,contratoId:r.contratoId});
      const c=await m.findOneBy(Contrato,{id:r.contratoId});
      const etapa=e&&await m.findOneBy(Etapa,{id:e.etapaId,contratoId:r.contratoId});
      const podeVerificar=Boolean(r.vigente&&['PENDENTE_VERIFICACAO','REJEITADA'].includes(r.status)&&e&&c&&etapa&&!c.arquivadoEm&&!c.conclusaoSolicitadaEm&&FASES_OPERACIONAIS_CONTRATO.includes(c.status)&&!etapa.arquivadoEm&&!etapa.conclusaoSolicitadaEm&&!etapa.encerramentoSolicitadoEm&&['PLANEJADA','EM_ANDAMENTO'].includes(etapa.status)&&!e.regularizacaoDocumentalSolicitada&&!['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??'')&&await this.verificadorAutorizado(m,ator,e));
      return {...r,podeVerificar};
    }));
  }
  private async protegerDecisoesDeOcorrencia(m: EntityManager, contratoId: string, comprovanteId: string, invalidando: boolean) {
    const [resultado] = await m.query(`SELECT EXISTS(SELECT 1 FROM ocorrencias o WHERE o.contrato_id=$1 AND o.substituida_em IS NULL
      AND (EXISTS (SELECT 1 FROM vw_provas_ocorrencia_r41 v WHERE v.contrato_id=o.contrato_id AND v.ocorrencia_id=o.id AND v.comprovante_id=$2)
        OR EXISTS (SELECT 1 FROM comprovantes_evidencia c WHERE c.contrato_id=o.contrato_id AND c.id=$2 AND c.ocorrencia_quantidade_id=o.id)
        OR EXISTS (SELECT 1 FROM execucoes_entregavel l WHERE l.contrato_id=o.contrato_id AND l.origem='EVIDENCIA' AND l.origem_id=$2 AND l.ocorrencia_id=o.id)) AND (
        o.status IN ('CONCLUIDO','ENCERRADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO') OR
        (o.status='CONCLUIDO_PARCIALMENTE' AND (o.regularizacao_documental_solicitada IS TRUE OR $3::boolean)))) AS bloqueada`,[contratoId,comprovanteId,invalidando]);
    if (resultado?.bloqueada) throw new ConflictException('Existe uma decisão de ocorrência vigente. Reabra ou resolva a solicitação antes de alterar este comprovante.');
  }
  private async contexto(m: EntityManager, contratoId: string, entregavelId: string, esperadaId: string) {
    const entregavel = await m.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
    const esperada = await m.getRepository(EvidenciaEsperada).findOneBy({ id: esperadaId, entregavelId });
    if (!entregavel || !esperada) throw new NotFoundException('Evidência não encontrada neste entregável');
    return { entregavel, esperada };

  }
  private validarPlanejamentoAtivo(entregavel: Entregavel, esperada: EvidenciaEsperada): void {
    if (entregavel.regularizacaoDocumentalSolicitada || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? '')) throw new ConflictException('Entregável concluído: reabra antes de alterar evidências');
    if (entregavel.arquivadoEm || esperada.arquivadoEm)
      throw new ConflictException('Item arquivado: reative-o antes de enviar, editar ou verificar comprovantes');
  }
  /** Arquivar uma etapa bloqueia operações em todos os seus descendentes.
   * Leitura histórica continua permitida; esta checagem é exclusiva de mutações. */
  private async etapaAtiva(m: EntityManager, entregavel: Entregavel): Promise<void> {
    if (!entregavel.etapaId) return; // fixtures legadas sem relacionamento
    const etapa = await m.getRepository(Etapa).findOneBy({ id: entregavel.etapaId, contratoId: entregavel.contratoId });
    if (!etapa) throw new NotFoundException('Etapa vinculada não encontrada');
    if (etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm) throw new ConflictException('Resolva a solicitação da etapa antes de alterar evidências');
    if (etapa.arquivadoEm) throw new ConflictException('Etapa arquivada: reative a etapa antes de alterar evidências');
    if (etapa.status === StatusEtapa.CONCLUIDO_PARCIALMENTE && (etapa.conclusaoSolicitadaEm || entregavel.statusExecucao !== 'CONCLUIDO_PARCIALMENTE'))
      throw new ConflictException('A etapa permite apenas regularização documental de entregáveis parcialmente concluídos, sem decisão pendente');
    if ((['CONCLUIDA', 'ENCERRADA', 'FINALIZADA'].includes(etapa.status)) && !etapa.reabertoEm)
      throw new ConflictException('Etapa concluída: reabra a etapa antes de alterar evidências');
  }
  private async contratoEditavel(m: EntityManager, contratoId: string) {
    const contrato = await m.getRepository(Contrato).createQueryBuilder('c')
      .setLock('pessimistic_write').where('c.id = :id', { id: contratoId }).getOne();
    if (!contrato) throw new NotFoundException('Contrato não encontrado');
    if (contrato.conclusaoSolicitadaEm) throw new ConflictException('Resolva a solicitação do contrato antes de alterar evidências');
    if (contrato.arquivadoEm) throw new ConflictException('Contrato arquivado: operação não permitida');
    // A documentação estar completa não é decisão formal de conclusão.
    // Evita bloquear comprovantes de novos entregáveis em contrato ainda aberto.
    if (['CONCLUIDO','ENCERRADO','FINALIZADO','SUSPENSO','CANCELADO'].includes(contrato.status) || (contrato.status === 'CONCLUIDO_PARCIALMENTE' && contrato.conclusaoSolicitadaEm))
      throw new ConflictException('Contrato finalizado: reabra-o antes de alterar evidências');
    return contrato;
  }
  private exigirRegularizacao(contrato: Contrato, e: Entregavel) {
    if (contrato.status === 'CONCLUIDO_PARCIALMENTE' && e.statusExecucao !== 'CONCLUIDO_PARCIALMENTE')
      throw new ConflictException('Contrato parcialmente concluído: somente regularização documental é permitida');
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
    const parcelas = entregavel.execucoesIntegradas ? await this.db.manager.findBy(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA'}) : [];
    const ultima = versoes[0];
    const declaracao = !ultima ? await this.rascunho(this.db.manager,esperadaId,entregavelId) : null;
    const contrato = await this.db.getRepository(Contrato).findOne({ where: { id: contratoId }, select: { arquivadoEm: true, status: true, conclusaoSolicitadaEm: true } });
    const etapaPai = entregavel.etapaId
      ? await this.db.getRepository(Etapa).findOneBy({ id: entregavel.etapaId, contratoId }) : null;
    // A trilha de auditoria já existe na base; filtrar também pelo ID do item
    // para não revelar operações de outras evidências do mesmo entregável.
    const eventos = await this.db.getRepository(EventoAuditoria).find({
      where: { contratoId, entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId, id: Raw(alias => `${alias} IN (SELECT id FROM eventos_auditoria WHERE contrato_id = :c AND entidade_id = :e AND (dados_anteriores->>'itemId' = :i OR dados_posteriores->>'itemId' = :i OR dados_anteriores->>'evidenciaEsperadaId' = :i OR dados_posteriores->>'evidenciaEsperadaId' = :i))`, {c:contratoId,e:entregavelId,i:esperadaId}) },
      order: { registradoEm: 'DESC', id:'DESC' },
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
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REJEITADO]: 'Comprovante devolvido para revisão',
      [AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REABERTO]: 'Evidência reaberta para verificação',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA]: 'Evidência arquivada',
      [AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_REATIVADA]: 'Evidência reativada',
    };
    const percentualDiretoPermitido = entregavel.tipo==='UNICO' || entregavel.tipo==='CONTINUO' && !(await this.db.manager.getRepository(Ocorrencia).findBy({contratoId,entregavelId})).some(o=>!o.substituidaEm);
    const quantidadeDiretaPermitida = entregavel.tipo==='QUANTITATIVO' && Number(entregavel.quantidadePrevista)>0 && Number(entregavel.quantidadeRealizada??0)===0 && !(await this.db.manager.getRepository(Ocorrencia).findBy({contratoId,entregavelId})).some(o=>!o.substituidaEm);
    const ocorrenciasQuantitativas = ['QUANTITATIVO','RECORRENTE'].includes(entregavel.tipo) && entregavel.unidadeMedida
      ? (await this.db.manager.getRepository(Ocorrencia).findBy({ contratoId, entregavelId })).filter(o => !o.substituidaEm && o.modoRegistro === 'QUANTITATIVO')
        .map(o => ({ id: o.id, titulo: o.titulo, status: o.status })) : [];
    const vinculosAtuais: {id:string;titulo:string;tipo:string}[]=ultima?await this.db.manager.query(`SELECT o.id,o.titulo,'ocorrencia' AS tipo FROM ocorrencia_comprovantes oc JOIN ocorrencias o ON o.id=oc.ocorrencia_id AND o.contrato_id=oc.contrato_id WHERE oc.contrato_id=$1 AND oc.comprovante_id=$2 UNION ALL SELECT a.id,a.titulo,'atividade' FROM atividade_comprovantes ac JOIN atividades a ON a.id=ac.atividade_id AND a."contratoId"=ac.contrato_id WHERE ac.contrato_id=$1 AND ac.comprovante_id=$2 AND a."excluidaEm" IS NULL`,[contratoId,ultima.id]):[];
    if(declaracao){
      const os=[...new Set([...idsVinculadosEnvio(declaracao.ocorrenciasVinculadas),...[declaracao.ocorrenciaQuantidadeId,declaracao.ocorrenciaExecucaoId].filter((v):v is string=>Boolean(v))])];
      const asIds=idsVinculadosEnvio(declaracao.atividadesVinculadas);
      if(os.length)vinculosAtuais.push(...await this.db.manager.query(`SELECT id,titulo,'ocorrencia' AS tipo FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id=ANY($3::uuid[]) AND substituida_em IS NULL`,[contratoId,entregavelId,os]));
      if(asIds.length)vinculosAtuais.push(...await this.db.manager.query(`SELECT DISTINCT a.id,a.titulo,'atividade' AS tipo FROM atividades a JOIN atividade_entregaveis ae ON ae."atividadeId"=a.id AND ae."entregavelId"=$2 WHERE a."contratoId"=$1 AND a.id=ANY($3::uuid[]) AND a."excluidaEm" IS NULL`,[contratoId,entregavelId,asIds]));
    }
    const contextoPermiteAlterar = Boolean(contrato && !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm &&
      !['CONCLUIDO','ENCERRADO','FINALIZADO','SUSPENSO','CANCELADO'].includes(contrato.status) &&
      !(contrato.status === 'CONCLUIDO_PARCIALMENTE' && contrato.conclusaoSolicitadaEm) &&
      (!entregavel.etapaId || (etapaPai && !etapaPai.arquivadoEm && !etapaPai.conclusaoSolicitadaEm && !etapaPai.encerramentoSolicitadoEm &&
        !(etapaPai.status === StatusEtapa.CONCLUIDO_PARCIALMENTE && (etapaPai.conclusaoSolicitadaEm || entregavel.statusExecucao !== 'CONCLUIDO_PARCIALMENTE')) &&
        (!['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapaPai.status) || etapaPai.reabertoEm))) &&
      !entregavel.arquivadoEm && !esperada.arquivadoEm && !entregavel.regularizacaoDocumentalSolicitada &&
      !['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(entregavel.statusExecucao ?? ''));
    const permissaoContribuicao = ator.perfil === PerfilUsuario.ADMINISTRADOR ? null : await this.db.manager.getRepository(PermissaoContrato).findOneBy({contratoId,usuarioId:ator.id});
    const efetivasContribuicao = permissaoContribuicao && permissoesEfetivas(ator.perfil,permissaoContribuicao.podeEditar,permissaoContribuicao.permissoesDetalhadas);
    const parcelaAtual = parcelas.find(p=>p.origemId===ultima?.id);
    const ocorrenciaContribuicao = ultima?.ocorrenciaQuantidadeId ?? parcelaAtual?.ocorrenciaId ?? declaracao?.ocorrenciaQuantidadeId ?? declaracao?.ocorrenciaExecucaoId;
    const podeEditarContribuicao = Boolean(contextoPermiteAlterar && (ator.perfil === PerfilUsuario.ADMINISTRADOR || (efetivasContribuicao?.editarExecucaoFisica && (!ocorrenciaContribuicao || (efetivasContribuicao.vincularEvidenciasOcorrencia && efetivasContribuicao.registrarExecucaoOcorrencia)))) && (!ultima || ['PENDENTE_VERIFICACAO','REJEITADA'].includes(ultima.status)) && ultima?.origemQuantidade!=='COMPROVACAO' && declaracao?.origemQuantidade!=='COMPROVACAO' && !declaracao?.comprovaExecucaoId && !parcelaAtual?.referenciaId && entregavel.statusExecucao!=='CONCLUIDO_PARCIALMENTE');
    return {
      contextoPermiteAlterar:contextoPermiteAlterar&&!declaracao?.origemCompartilhadaId,
      podeEditarContribuicao:podeEditarContribuicao&&!declaracao?.origemCompartilhadaId, vinculosAtuais,
      aguardandoEnvioCompartilhado:Boolean(declaracao?.origemCompartilhadaId),
      compartilhamentosPreliminares:declaracao&&(declaracao.origemCompartilhadaId||destinosEvidencia(declaracao.destinosCompartilhados).length)?await this.vinculosPreliminares(this.db.manager,declaracao.origemCompartilhadaId??esperadaId,ator):[],
      declaracaoPreliminar: declaracao ? {quantidadeDeclarada:declaracao.quantidadeExecutada??null,percentualDeclarado:declaracao.percentualExecucao??null,ocorrenciaQuantidadeId:declaracao.ocorrenciaQuantidadeId??null,ocorrenciaPercentualId:declaracao.ocorrenciaExecucaoId??null,origemQuantidade:declaracao.origemQuantidade??null,referenciaPercentualId:declaracao.comprovaExecucaoId??null} : null,
      percentualDiretoPermitido, tipoEntregavel: entregavel.tipo, quantidadePrevista: entregavel.quantidadePrevista,
      ocorrenciasDescritivas: aceitaParcelas(entregavel.tipo) && entregavel.tipo !== 'UNICO' ?
        (await this.db.manager.getRepository(Ocorrencia).findBy({contratoId,entregavelId})).filter(o=>!o.substituidaEm && o.modoRegistro==='DESCRITIVO' && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(o.status)).map(o=>({id:o.id,titulo:o.titulo,status:o.status})) : [],
      totalDestinosAguardandoEnvio: declaracao ? destinosEvidencia(declaracao.destinosCompartilhados).length : 0,
      compartilhamentos: ultima?.grupoCompartilhadoId ? await this.vinculosCompartilhados(this.db.manager,ultima.grupoCompartilhadoId,ator) : [],
      id: esperada.id, codigoPublico: esperada.codigoPublico, entregavelId, contratoId, tipoEvidencia: esperada.tipoEvidencia,
      descricao: esperada.descricao, obrigatoria: esperada.obrigatoria,
      unidadeMedida: entregavel.unidadeMedida ?? null,
      quantidadeMensuravel: quantidadeDiretaPermitida || ocorrenciasQuantitativas.length > 0, quantidadeDiretaPermitida, ocorrenciasQuantitativas,
      execucoesQuantitativas: [...await listarExecucoesQuantitativas(this.db.manager, contratoId, ocorrenciasQuantitativas.map(o => o.id)), ...await listarReferenciasDiretas(this.db.manager,entregavel)],
      arquivadoEm: esperada.arquivadoEm ?? null, reabertoEm: esperada.reabertoEm ?? null,
      entregavelArquivadoEm: entregavel.arquivadoEm ?? null,
      status: ultima?.status ?? 'SEM_ENVIO',
      versoes: versoes.map(v => ({ ...publico(v),
        ocorrenciaPercentualId: parcelas.find(p=>p.origemId===v.id)?.ocorrenciaId ?? null,
        referenciaPercentualId: parcelas.find(p=>p.origemId===v.id)?.referenciaId ?? null,
        percentualDeclarado: parcelas.find(p=>p.origemId===v.id&&p.centesimos>0)?.centesimos ? String(parcelas.find(p=>p.origemId===v.id)!.centesimos/100) : null,
        percentualAprovado: parcelas.find(p=>p.origemId===v.id)?.centesimosAprovados != null ? String(parcelas.find(p=>p.origemId===v.id)!.centesimosAprovados!/100) : null,
        enviadoPor: pessoa(porId.get(v.autorId)), verificadoPorUsuario: pessoa(porId.get(v.verificadoPor ?? '')) })),
      historico: relevantes.map(ev => ({ id: ev.id, acao: ev.acao,
        descricao: ev.acao === AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA && ev.dadosPosteriores?.['operacao'] === 'CRIAR_ITEM'
          ? 'Evidência cadastrada' : ev.dadosPosteriores?.['operacao']==='EDITAR_VINCULOS' ? 'Vínculos documentais alterados' : ev.dadosPosteriores?.['operacao']==='EDITAR_CONTRIBUICAO' ? 'Contribuição da evidência alterada' : descricoes[ev.acao] ?? 'Alteração registrada',
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
      podeVerificar: Boolean(contextoPermiteAlterar && ultima && ['PENDENTE_VERIFICACAO','REJEITADA'].includes(ultima.status) &&
        await this.verificadorAutorizado(this.db.manager, ator, entregavel)),
    };
  }
  /** Somente ADMIN ou delegação nominal permite tornar uma evidência opcional. */
  private async alterarObrigatoriedadePermitido(m: EntityManager, contratoId: string, ator: UsuarioAutenticado) {
    if (ator.perfil === PerfilUsuario.ADMINISTRADOR) return true;
    const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
    return Boolean(vinculo?.permissoesDetalhadas?.alterarObrigatoriedade);
  }
  /** Apenas contribuição concorrente no mesmo destino é conflito; vínculo documental não é. */
  private async exigirAtividadesSemMedicaoDuplicada(m:EntityManager,e:Entregavel,ids:string[],quantidade:boolean,ocorrenciaQ:string|null,percentual:boolean,ocorrenciaP:string|null) {
    if(!ids.length || (!quantidade&&!percentual))return;
    const [r]=await m.query(`SELECT EXISTS(SELECT 1 FROM atividades a WHERE a."contratoId"=$1 AND a.id=ANY($3::uuid[]) AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA' AND (
      ($4::boolean AND (($5::uuid IS NULL AND EXISTS(SELECT 1 FROM atividade_entregavel_medicoes dm WHERE dm.atividade_id=a.id AND dm.contrato_id=$1 AND dm.entregavel_id=$2 AND dm.quantidade>0)) OR
        ($5::uuid IS NOT NULL AND (EXISTS(SELECT 1 FROM atividade_ocorrencia_medicoes am WHERE am.atividade_id=a.id AND am.contrato_id=$1 AND am.ocorrencia_id=$5 AND am.quantidade>0) OR (a."ocorrenciaId"=$5 AND a.quantidade_execucao>0))))) OR
      ($6::boolean AND EXISTS(SELECT 1 FROM execucoes_entregavel p WHERE p.contrato_id=$1 AND p.entregavel_id=$2 AND p.origem='ATIVIDADE' AND p.origem_id=a.id AND p.centesimos>0 AND p.ocorrencia_id IS NOT DISTINCT FROM $7::uuid)))) AS duplicada`,[e.contratoId,e.id,ids,quantidade,ocorrenciaQ,percentual,ocorrenciaP]);
    if(r?.duplicada) throw new ConflictException('A atividade vinculada já registra execução neste destino. Utilize comprovação sem duplicar a medição.');
  }
  /** Read only in the scoped evidence service; never expose cross-contract IDs from the JSON. */
  private async rascunho(m: EntityManager, id: string, entregavelId: string): Promise<(EnviarComprovanteDto & {origemCompartilhadaId?:string}) | null> {
    const [r] = await m.query('SELECT rascunho_envio AS rascunho FROM evidencias_esperadas WHERE id=$1 AND entregavel_id=$2', [id, entregavelId]);
    return r?.rascunho ?? null;
  }
  /** Reserva local visível desde o cadastro, sem inventar um comprovante ou progresso. */
  private async materializarDestinosPreliminares(m:EntityManager, origem:EvidenciaEsperada, dto:EnviarComprovanteDto, ator:UsuarioAutenticado) {
    const destinos=destinosEvidencia(dto.destinosCompartilhados);
    if(!destinos.length)return;
    const repo=m.getRepository(EvidenciaEsperada);
    for(const d of destinos){
      const alvo=await m.findOneBy(Entregavel,{id:d.entregavelId});
      if(!alvo)throw new NotFoundException('Entregável vinculado não encontrado.');
      let item=d.esperadaId?await repo.findOneBy({id:d.esperadaId,entregavelId:alvo.id,arquivadoEm:IsNull()}):null;
      if(d.esperadaId&&!item)throw new ConflictException('Evidência vinculada indisponível.');
      if(!item){
        await exigirPermissaoTransacional(m,alvo.contratoId,ator,'criarEvidencias');
        await exigirPermissaoTransacional(m,alvo.contratoId,ator,'alterarObrigatoriedade');
        if(await repo.count({where:{entregavelId:alvo.id,arquivadoEm:IsNull()}})>=10)throw new ConflictException('Um dos entregáveis atingiu o limite de evidências.');
        item=await repo.save(repo.create({entregavelId:alvo.id,tipoEvidencia:origem.tipoEvidencia,descricao:origem.descricao,obrigatoria:false}));
      }
      if(await this.rascunho(m,item.id,alvo.id)||await m.getRepository(ComprovanteEvidencia).count({where:{evidenciaEsperadaId:item.id}}))throw new ConflictException('Uma das evidências vinculadas já possui registro próprio.');
      const declaracao:Record<string,string>={origemCompartilhadaId:origem.id};
      if(d.quantidadeExecutada){declaracao.quantidadeExecutada=d.quantidadeExecutada;declaracao.origemQuantidade='NOVA_EXECUCAO';if(d.ocorrenciaId)declaracao.ocorrenciaQuantidadeId=d.ocorrenciaId;}
      if(d.percentualExecucao){declaracao.percentualExecucao=d.percentualExecucao;if(d.ocorrenciaId)declaracao.ocorrenciaExecucaoId=d.ocorrenciaId;}
      if(d.ocorrenciaIds?.length)declaracao.ocorrenciasVinculadas=d.ocorrenciaIds.join(',');
      await repo.update({id:item.id,entregavelId:alvo.id},{rascunhoEnvio:declaracao});
      d.esperadaId=item.id;
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,entidadeTipo:'ENTREGAVEL',entidadeId:alvo.id,dadosPosteriores:{operacao:'CRIAR_VINCULO_COMPARTILHADO',itemId:item.id,tipoEvidencia:item.tipoEvidencia,obrigatoria:item.obrigatoria,origemCompartilhadaId:origem.id}});
    }
    const rascunho=Object.fromEntries(Object.entries(dto).filter(([,v])=>typeof v==='string'));
    rascunho.destinosCompartilhados=JSON.stringify(destinos);
    await repo.update({id:origem.id,entregavelId:origem.entregavelId},{rascunhoEnvio:rascunho});
  }
  private async vinculosPreliminares(m:EntityManager,origemId:string,ator:UsuarioAutenticado){
    return m.query(`SELECT ev.id AS "esperadaId",e.id AS "entregavelId",e.nome AS entregavel,c.id AS "contratoId",c.numero_contrato AS contrato
      FROM evidencias_esperadas ev JOIN entregaveis e ON e.id=ev.entregavel_id JOIN contratos c ON c.id=e.contrato_id
      JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=c.id
      WHERE (ev.id=$1::uuid OR ev.rascunho_envio->>'origemCompartilhadaId'=($1::uuid)::text)
      AND ev.arquivado_em IS NULL AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL AND c.arquivado_em IS NULL
      AND ($2::boolean OR EXISTS(SELECT 1 FROM permissoes_contrato p WHERE p.contrato_id=c.id AND p.usuario_id=$3) OR c.responsavel_interno_id=$3)
      ORDER BY c.numero_contrato,e.nome,ev.id`,[origemId,ator.perfil===PerfilUsuario.ADMINISTRADOR,ator.id]) as Promise<{esperadaId:string;entregavelId:string;entregavel:string;contratoId:string;contrato:string}[]>;
  }
  private async validarRascunho(m: EntityManager, e: Entregavel, dto: EnviarComprovanteDto, ator: UsuarioAutenticado, tipoOrigem?: string, origemId?:string) {
    if(dto.ocorrenciaExecucaoId && !dto.percentualExecucao && !dto.comprovaExecucaoId) throw new BadRequestException('Informe a contribuição percentual para selecionar sua ocorrência.');
    const q = normalizarVinculoQuantidade(dto);
    const idsO = idsVinculadosEnvio(dto.ocorrenciasVinculadas);
    const idsA = idsVinculadosEnvio(dto.atividadesVinculadas);
    const destinos = destinosEvidencia(dto.destinosCompartilhados);
    if (destinos.length) await exigirPermissaoTransacional(m,e.contratoId,ator,'compartilharEvidencias');
    if (q && (dto.percentualExecucao || dto.comprovaExecucaoId) || dto.percentualExecucao && dto.comprovaExecucaoId)
      throw new BadRequestException('Informe uma única modalidade de contribuição.');
    const verificar = async (alvo: Entregavel, quantidade: ReturnType<typeof normalizarVinculoQuantidade>, percentual: string | undefined, ocorrenciaId: string | undefined, ocorrencias: string[], atividades: string[], referencia?: string) => {
      await this.etapaAtiva(m, alvo);
      if (alvo.statusExecucao==='CONCLUIDO_PARCIALMENTE' && (quantidade?.origemQuantidade==='NOVA_EXECUCAO'||percentual)) throw new ConflictException('Regularização documental não acrescenta execução física.');
      if (alvo.arquivadoEm || alvo.regularizacaoDocumentalSolicitada || ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(alvo.statusExecucao ?? ''))
        throw new ConflictException('O destino não permite nova declaração.');
      if (quantidade?.origemQuantidade === 'NOVA_EXECUCAO' || percentual) await exigirPermissaoParcela(m, alvo.contratoId, ator);
      if (ator.perfil !== PerfilUsuario.ADMINISTRADOR && (ocorrencias.length || ocorrenciaId || quantidade?.ocorrenciaQuantidadeId || atividades.length)) {
        const v = await m.findOneBy(PermissaoContrato,{contratoId:alvo.contratoId,usuarioId:ator.id});
        const p = v && permissoesEfetivas(ator.perfil,v.podeEditar,v.permissoesDetalhadas);
        if ((ocorrencias.length || ocorrenciaId || quantidade?.ocorrenciaQuantidadeId) && !p?.vincularEvidenciasOcorrencia || (quantidade?.origemQuantidade==='NOVA_EXECUCAO' && quantidade.ocorrenciaQuantidadeId || percentual && ocorrenciaId) && !p?.registrarExecucaoOcorrencia || atividades.length && !p?.editarAtividades)
          throw new ForbiddenException('Sem autorização para os vínculos ou a contribuição do destino.');
      }
      await validarOcorrenciaQuantidade(m, alvo, quantidade);
      if (atividades.length) await this.exigirAtividadesSemMedicaoDuplicada(m,alvo,atividades,quantidade?.origemQuantidade==='NOVA_EXECUCAO',quantidade?.ocorrenciaQuantidadeId??null,Boolean(percentual),ocorrenciaId??null);
      if (quantidade?.origemQuantidade === 'NOVA_EXECUCAO') {
        const o=quantidade.ocorrenciaQuantidadeId?await m.findOneBy(Ocorrencia,{id:quantidade.ocorrenciaQuantidadeId,contratoId:alvo.contratoId,entregavelId:alvo.id}):null;
        const medicao = o ? await resumoMedicao(m,o) : null;
        const saldo=o?milesimos(o.metaQuantidade)-milesimos(medicao?.quantidadeRegistradaExata ?? medicao?.quantidadeRegistrada):
          milesimos(alvo.quantidadePrevista)-((await listarQuantidadeDireta(m,{...alvo,quantidadeDiretaIntegrada:true} as Entregavel)) as {situacao:string;quantidade:string;referenciaExecucao:string|null}[]).filter(l=>['PENDENTE','APROVADO'].includes(l.situacao)&&!l.referenciaExecucao).reduce((n,l)=>n+milesimos(l.quantidade),0n);
        if(milesimos(quantidade.quantidadeDeclarada)>saldo) throw new ConflictException('Quantidade acima do saldo disponível no destino.');
      }
      if (percentual || referencia) {
        if (!aceitaParcelas(alvo.tipo) || alvo.tipo === 'UNICO' && ocorrenciaId) throw new ConflictException('Modalidade percentual indisponível neste destino.');
        const o = await exigirOcorrenciaParcela(m, alvo, ocorrenciaId);
        const r = await resumoParcelas(m, alvo);
        const saldo = o && alvo.tipo === 'RECORRENTE' ? (r.saldosOcorrencias.find(s => s.id === o.id)?.saldo ?? 10000) : r.saldo;
        if (percentual && centesimos(percentual) > saldo) throw new ConflictException('Percentual acima do saldo disponível.');
        if (referencia && !r.itens.some(i => i.id === referencia && i.reconhecido > 0 && i.ocorrenciaId === (o?.id ?? null))) throw new ConflictException('Selecione uma execução reconhecida.');
      }
      if (ocorrencias.length) {
        const rows = await m.query(`SELECT id FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id=ANY($3::uuid[]) AND substituida_em IS NULL`, [alvo.contratoId,alvo.id,ocorrencias]);
        if (rows.length !== ocorrencias.length) throw new ConflictException('Ocorrências fora do destino.');
      }
      if (atividades.length) {
        const rows = await m.query(`SELECT DISTINCT a.id FROM atividades a JOIN atividade_entregaveis ae ON ae."atividadeId"=a.id AND ae."entregavelId"=$2 WHERE a."contratoId"=$1 AND a.id=ANY($3::uuid[]) AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA'`,[alvo.contratoId,alvo.id,atividades]);
        if (rows.length !== atividades.length) throw new ConflictException('Atividades fora do destino.');
      }
    };
    await verificar(e,q,dto.percentualExecucao,dto.ocorrenciaExecucaoId,idsO,idsA,dto.comprovaExecucaoId);
    for (const d of destinos) {
      if (d.entregavelId === e.id) throw new BadRequestException('O entregável de origem já está selecionado.');
      const alvo = await m.findOneBy(Entregavel,{id:d.entregavelId});
      if (!alvo) throw new NotFoundException('Destino indisponível.');
      const permis = await this.permissaoDestino(m,alvo.contratoId,ator);
      if (!permis.enviar || !permis.compartilhar || !d.esperadaId && !permis.criarOpcional) throw new ForbiddenException('Sem autorização no destino.');
      const contrato = await m.findOneBy(Contrato,{id:alvo.contratoId});
      if (!contrato || contrato.arquivadoEm || contrato.conclusaoSolicitadaEm || !FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)) throw new ConflictException('Destino indisponível.');
      if (d.esperadaId) {
        const requisito = await m.findOneBy(EvidenciaEsperada,{id:d.esperadaId,entregavelId:alvo.id,arquivadoEm:IsNull()});
        if (!requisito) throw new NotFoundException('Requisito de destino indisponível.');
        if (tipoOrigem && requisito.tipoEvidencia.trim().toLocaleLowerCase('pt-BR') !== tipoOrigem.trim().toLocaleLowerCase('pt-BR')) throw new ConflictException('O tipo da evidência deve corresponder ao requisito de destino.');
        const reserva=await this.rascunho(m,requisito.id,alvo.id);
        if (reserva && (!origemId||reserva.origemCompartilhadaId!==origemId) || await m.getRepository(ComprovanteEvidencia).count({where:{evidenciaEsperadaId:requisito.id}}))
          throw new ConflictException('O requisito de destino já possui declaração ou comprovante.');
      }
      const vq = d.quantidadeExecutada ? normalizarVinculoQuantidade({quantidadeExecutada:d.quantidadeExecutada,ocorrenciaQuantidadeId:d.ocorrenciaId,origemQuantidade:'NOVA_EXECUCAO',referenciaExecucao:randomUUID()}) : null;
      await verificar(alvo,vq,d.percentualExecucao,d.ocorrenciaId,d.ocorrenciaIds??[],[]);
    }
  }
  /** Um novo requisito por chamada: não substitui o checklist já cadastrado. */
  async criarEsperada(contratoId: string, entregavelId: string, dto: EditarEvidenciaEsperadaDto, ator: UsuarioAutenticado) {
    const tipoEvidencia = dto.tipoEvidencia?.trim();
    if (!tipoEvidencia)
      throw new BadRequestException('Informe o tipo da evidência');
    return this.db.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'criarEvidencias');
      const destinos=destinosEvidencia(dto.rascunhoEnvio?.destinosCompartilhados);
      const alvos=destinos.length?await m.findBy(Entregavel,{id:In(destinos.map(d=>d.entregavelId))}):[];
      if(alvos.length!==destinos.length)throw new NotFoundException('Entregável vinculado não encontrado.');
      if (destinos.length) {
        for (const cid of [...new Set([contratoId,...alvos.map(e=>e.contratoId)])].sort()) {
          await exigirPermissaoTransacional(m,cid,ator,'compartilharEvidencias');
          await exigirPermissaoTransacional(m,cid,ator,'enviarComprovantes');
        }
      }
      const contratosBloqueados=new Map<string,Contrato>();
      for(const cid of [...new Set([contratoId,...alvos.map(e=>e.contratoId)])].sort())contratosBloqueados.set(cid,await this.contratoEditavel(m,cid));
      const contrato=contratosBloqueados.get(contratoId)!;
      const e = await m.getRepository(Entregavel).findOneBy({ id: entregavelId, contratoId });
      if (!e) throw new NotFoundException('Entregável não encontrado neste contrato');
      this.exigirRegularizacao(contrato,e);
      if (e.arquivadoEm || e.regularizacaoDocumentalSolicitada) throw new ConflictException('Entregável arquivado ou aguardando decisão documental');
      await this.etapaAtiva(m, e);
      // Evidências previamente verificadas não fecham automaticamente o planejamento.
      // Apenas o estado explícito CONCLUIDO/FINALIZADO bloqueia uma nova exigência.
      if (['CONCLUIDO', 'CONCLUIDO_PARCIALMENTE', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_CONCLUSAO_PARCIAL', 'PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))
        throw new ConflictException('Entregável fechado ou aguardando aprovação: reabra antes de cadastrar outra evidência');
      if (dto.obrigatoria === false && !await this.alterarObrigatoriedadePermitido(m, contratoId, ator))
        throw new ForbiddenException('Somente Administrador ou usuário delegado pode cadastrar evidência opcional');
      const repo = m.getRepository(EvidenciaEsperada);
      const total = await repo.count({ where: { entregavelId, arquivadoEm: IsNull() } });
      if (total >= 10) throw new ConflictException('Limite de dez evidências ativas por entregável');
      if (dto.rascunhoEnvio) await this.validarRascunho(m,e,dto.rascunhoEnvio,ator,tipoEvidencia);
      const criado = await repo.save(repo.create({ entregavelId, tipoEvidencia,
        ...(dto.rascunhoEnvio ? {rascunhoEnvio: Object.fromEntries(Object.entries(dto.rascunhoEnvio).filter(([,v])=>typeof v==='string'))} : {}),
        descricao: dto.descricao?.trim() || null, obrigatoria: dto.obrigatoria !== false }));
      if(dto.rascunhoEnvio&&destinos.length)await this.materializarDestinosPreliminares(m,criado,dto.rascunhoEnvio,ator);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosPosteriores: { operacao: 'CRIAR_ITEM', itemId: criado.id,
          tipoEvidencia: criado.tipoEvidencia, obrigatoria: criado.obrigatoria, ...(dto.rascunhoEnvio ? {declaracaoPreliminar:resumoRascunho(dto.rascunhoEnvio)} : {}) },
      });
      return { id: criado.id, tipoEvidencia: criado.tipoEvidencia,
        descricao: criado.descricao, obrigatoria: criado.obrigatoria };
    });
  }
  /** Modifica apenas UM item. Os demais itens do checklist e seus comprovantes são preservados. */
  async editarEsperada(contratoId: string, entregavelId: string, esperadaId: string,
    dto: EditarEvidenciaEsperadaDto, ator: UsuarioAutenticado) {
    if (!Object.values(dto).some(valor => valor !== undefined)) throw new BadRequestException('Informe ao menos um campo');
    return this.db.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'editarEvidencias');
      const contrato = await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.exigirRegularizacao(contrato,entregavel);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      // Um documento já verificado não pode ter seus critérios alterados sem reabertura explícita.
      const ultima = await m.getRepository(ComprovanteEvidencia).findOne({
        where: { evidenciaEsperadaId: esperadaId }, order: { criadoEm: 'DESC', id: 'DESC' },
      });
      if (ultima?.status === 'VERIFICADA') throw new ConflictException('Evidência verificada: reabra antes de editar');
      const rascunhoAnterior = !ultima ? await this.rascunho(m,esperadaId,entregavelId) : null;
      if(rascunhoAnterior?.origemCompartilhadaId)throw new ConflictException('Edite esta evidência no registro de origem até o envio do comprovante.');
      const destinosAnteriores=destinosEvidencia(rascunhoAnterior?.destinosCompartilhados);
      if(destinosAnteriores.length&&dto.tipoEvidencia!==undefined&&dto.tipoEvidencia.trim()!==esperada.tipoEvidencia)throw new ConflictException('Mantenha o tipo da evidência compartilhada.');
      if (dto.rascunhoEnvio !== undefined) {
        if (!dto.rascunhoEnvio) throw new BadRequestException('Informe um objeto de declaração, mesmo vazio.');
        if (ultima) throw new ConflictException('Edite somente a declaração preliminar por esta operação.');
        // Inclusive remover uma contribuição exige autorização de execução.
        await exigirPermissaoParcela(m,contratoId,ator);
        if(JSON.stringify(destinosEvidencia(dto.rascunhoEnvio.destinosCompartilhados))!==JSON.stringify(destinosAnteriores))throw new ConflictException('Os destinos compartilhados não podem ser alterados por esta operação.');
        await this.validarRascunho(m,entregavel,dto.rascunhoEnvio,ator,dto.tipoEvidencia??esperada.tipoEvidencia,esperadaId);
        const limpa = Object.fromEntries(Object.entries(dto.rascunhoEnvio).filter(([,v])=>typeof v==='string'));
        await m.getRepository(EvidenciaEsperada).update({id:esperadaId,entregavelId},{rascunhoEnvio:Object.keys(limpa).length ? limpa : null});
      }
      const anterior = { itemId: esperada.id, tipoEvidencia: esperada.tipoEvidencia, descricao: esperada.descricao, obrigatoria: esperada.obrigatoria,
        ...(dto.rascunhoEnvio !== undefined ? {declaracaoPreliminar:resumoRascunho(rascunhoAnterior??{})} : {}) };
      if (dto.tipoEvidencia !== undefined && ultima && dto.tipoEvidencia.trim() !== esperada.tipoEvidencia)
        throw new ConflictException('O tipo de uma evidência com arquivo anexado não pode mudar. Cadastre outra evidência.');
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
          tipoEvidencia: esperada.tipoEvidencia, descricao: esperada.descricao, obrigatoria: esperada.obrigatoria,
          ...(dto.rascunhoEnvio !== undefined ? {declaracaoPreliminar:resumoRascunho(dto.rascunhoEnvio)} : {}) },
      });
      return { id: esperada.id, tipoEvidencia: esperada.tipoEvidencia, descricao: esperada.descricao, obrigatoria: esperada.obrigatoria };
    });
  }
  /** Corrige vínculos documentais do requisito local, preservando as versões anteriores. */
  async editarVinculos(contratoId:string,entregavelId:string,esperadaId:string,dto:EditarVinculosEvidenciaDto,ator:UsuarioAutenticado) {
    if(dto.ocorrencias==null && dto.atividades==null) throw new BadRequestException('Informe os vínculos a editar.');
    return this.db.transaction(async m=>{
      await exigirPermissaoTransacional(m, contratoId, ator, 'editarEvidencias');
      const contrato = await this.contratoEditavel(m, contratoId);
      const {entregavel:e,esperada}=await this.contexto(m,contratoId,entregavelId,esperadaId);
      this.exigirRegularizacao(contrato,e);
      this.validarPlanejamentoAtivo(e,esperada); await this.etapaAtiva(m,e);
      const c=await m.getRepository(ComprovanteEvidencia).createQueryBuilder('c').setLock('pessimistic_write').where('c.evidenciaEsperadaId = :esperadaId',{esperadaId}).orderBy('c.criadoEm','DESC').addOrderBy('c.id','DESC').getOne();
      if((c?.id??null)!==(dto.comprovanteId??null))throw new ConflictException('A versão mudou. Atualize a evidência.');
      if(c && (!['PENDENTE_VERIFICACAO','REJEITADA'].includes(c.status)||c.contratoId!==contratoId||c.entregavelId!==entregavelId))throw new ConflictException('Reabra a evidência antes de editar os vínculos.');
      if(ator.perfil!==PerfilUsuario.ADMINISTRADOR){
        const v=await m.findOneBy(PermissaoContrato,{contratoId,usuarioId:ator.id});
        const p=v&&permissoesEfetivas(ator.perfil,v.podeEditar,v.permissoesDetalhadas);
        if(dto.ocorrencias!=null&&!p?.vincularEvidenciasOcorrencia || dto.atividades!=null&&!p?.editarAtividades)throw new ForbiddenException('Sem autorização para editar estes vínculos.');
      }
      const r=await this.rascunho(m,esperadaId,entregavelId)??{};
      if(r.origemCompartilhadaId)throw new ConflictException('Edite os vínculos no registro de origem até o envio do comprovante.');
      const parcela=c&&e.execucoesIntegradas?await m.findOneBy(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA',origemId:c.id}):null;
      const fixas=[...new Set([c?.ocorrenciaQuantidadeId,parcela?.ocorrenciaId,r.ocorrenciaQuantidadeId,r.ocorrenciaExecucaoId].filter((v):v is string=>Boolean(v)))];
      const anterioresO=c?(await m.query(`SELECT ocorrencia_id AS id FROM ocorrencia_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2`,[contratoId,c.id]) as {id:string}[]).map(v=>v.id):[...new Set([...idsVinculadosEnvio(r.ocorrenciasVinculadas),...fixas])];
      const anterioresA=c?(await m.query(`SELECT atividade_id AS id FROM atividade_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2`,[contratoId,c.id]) as {id:string}[]).map(v=>v.id):idsVinculadosEnvio(r.atividadesVinculadas);
      const os=dto.ocorrencias??anterioresO,idsAtividades=dto.atividades??anterioresA;
      if(dto.ocorrencias!=null&&fixas.some(id=>!os.includes(id)))throw new ConflictException('Preserve a ocorrência da contribuição ou altere a contribuição primeiro.');
      if(dto.ocorrencias!=null&&os.length){const rows=await m.query(`SELECT id FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id=ANY($3::uuid[]) AND substituida_em IS NULL`,[contratoId,entregavelId,os]);if(rows.length!==os.length)throw new ConflictException('Ocorrências fora do destino.');}
      if(dto.atividades!=null&&idsAtividades.length){const rows=await m.query(`SELECT DISTINCT a.id FROM atividades a JOIN atividade_entregaveis ae ON ae."atividadeId"=a.id AND ae."entregavelId"=$2 WHERE a."contratoId"=$1 AND a.id=ANY($3::uuid[]) AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA'`,[contratoId,entregavelId,idsAtividades]);if(rows.length!==idsAtividades.length)throw new ConflictException('Atividades fora do destino.');}
      await this.exigirAtividadesSemMedicaoDuplicada(m,e,idsAtividades,c?c.origemQuantidade==='NOVA_EXECUCAO':r.origemQuantidade==='NOVA_EXECUCAO',c?.ocorrenciaQuantidadeId??r.ocorrenciaQuantidadeId??null,Boolean(parcela?.centesimos&&!parcela.referenciaId||r.percentualExecucao),parcela?.ocorrenciaId??r.ocorrenciaExecucaoId??null);
      if(c){
        if(anterioresO.some(id=>!os.includes(id))||anterioresA.some(id=>!idsAtividades.includes(id)))await this.protegerDecisoesDeOcorrencia(m,contratoId,c.id,true);
        if(dto.ocorrencias!=null){await m.query(`DELETE FROM ocorrencia_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2 AND NOT(ocorrencia_id=ANY($3::uuid[]))`,[contratoId,c.id,os]);for(const id of os)await m.query(`INSERT INTO ocorrencia_comprovantes (ocorrencia_id,comprovante_id,contrato_id,vinculado_por) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[id,c.id,contratoId,ator.id]);}
        if(dto.atividades!=null){await m.query(`DELETE FROM atividade_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2 AND NOT(atividade_id=ANY($3::uuid[]))`,[contratoId,c.id,idsAtividades]);for(const id of idsAtividades)await m.query(`INSERT INTO atividade_comprovantes (atividade_id,comprovante_id,contrato_id,vinculado_por) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[id,c.id,contratoId,ator.id]);}
      }else{
        const novo={...r};if(dto.ocorrencias!=null){if(os.length)novo.ocorrenciasVinculadas=os.join(',');else delete novo.ocorrenciasVinculadas;}if(dto.atividades!=null){if(idsAtividades.length)novo.atividadesVinculadas=idsAtividades.join(',');else delete novo.atividadesVinculadas;}
        const limpa=Object.fromEntries(Object.entries(novo).filter(([,v])=>typeof v==='string'));
        await m.getRepository(EvidenciaEsperada).update({id:esperadaId,entregavelId},{rascunhoEnvio:Object.keys(limpa).length?limpa:null});
      }
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,entidadeTipo:'ENTREGAVEL',entidadeId:entregavelId,dadosAnteriores:{itemId:esperadaId,comprovanteId:c?.id??null,ocorrencias:anterioresO,atividades:anterioresA},dadosPosteriores:{itemId:esperadaId,comprovanteId:c?.id??null,operacao:'EDITAR_VINCULOS',ocorrencias:os,atividades:idsAtividades}});
      return {id:esperadaId,ocorrencias:os,atividades:idsAtividades};
    });
  }
  async editarContribuicao(contratoId:string, entregavelId:string, esperadaId:string, comprovanteId:string,
    dto:EditarContribuicaoEvidenciaDto, ator:UsuarioAutenticado) {
    return this.db.transaction(async m=>{
      await exigirPermissaoTransacional(m, contratoId, ator, 'editarExecucaoFisica');
      const contrato = await this.contratoEditavel(m, contratoId);
      const {entregavel:e,esperada}=await this.contexto(m,contratoId,entregavelId,esperadaId);
      this.exigirRegularizacao(contrato,e);
      this.validarPlanejamentoAtivo(e,esperada); await this.etapaAtiva(m,e);
      if(e.statusExecucao==='CONCLUIDO_PARCIALMENTE')throw new ConflictException('Reabra a execução física antes de corrigir a contribuição.');
      const repo=m.getRepository(ComprovanteEvidencia);
      const c=await repo.createQueryBuilder('c').setLock('pessimistic_write').where('c.evidenciaEsperadaId = :esperadaId',{esperadaId}).orderBy('c.criadoEm','DESC').addOrderBy('c.id','DESC').getOne();
      if (!c && comprovanteId === 'rascunho') {
        await exigirPermissaoParcela(m,contratoId,ator);
        const anterior = await this.rascunho(m,esperadaId,entregavelId) ?? {};
        if(anterior.origemCompartilhadaId)throw new ConflictException('Edite a contribuição no registro de origem até o envio do comprovante.');
        if (anterior.origemQuantidade==='COMPROVACAO' || anterior.comprovaExecucaoId) throw new ConflictException('Preserve a referência de comprovação existente.');
        const novo = {...anterior};
        for (const chave of ['quantidadeExecutada','ocorrenciaQuantidadeId','origemQuantidade','referenciaExecucao','percentualExecucao','ocorrenciaExecucaoId'] as const) delete novo[chave];
        if (dto.modalidade==='SEM_CONTRIBUICAO' && (dto.valor||dto.ocorrenciaId)) throw new BadRequestException('Não informe valor sem contribuição.');
        if (dto.modalidade!=='SEM_CONTRIBUICAO' && !dto.valor) throw new BadRequestException('Informe a contribuição.');
        if (dto.modalidade==='QUANTITATIVA') Object.assign(novo,{quantidadeExecutada:dto.valor,ocorrenciaQuantidadeId:dto.ocorrenciaId,origemQuantidade:'NOVA_EXECUCAO',referenciaExecucao:anterior.referenciaExecucao??`evidencia-${esperadaId}`});
        if (dto.modalidade==='PERCENTUAL') Object.assign(novo,{percentualExecucao:dto.valor,ocorrenciaExecucaoId:dto.ocorrenciaId});
        const limpa = Object.fromEntries(Object.entries(novo).filter(([,v])=>typeof v==='string'));
        await this.validarRascunho(m,e,limpa,ator,esperada.tipoEvidencia,esperadaId);
        await m.getRepository(EvidenciaEsperada).update({id:esperadaId,entregavelId},{rascunhoEnvio:Object.keys(limpa).length ? limpa : null});
        await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,entidadeTipo:'ENTREGAVEL',entidadeId:entregavelId,dadosAnteriores:{itemId:esperadaId,declaracaoPreliminar:resumoRascunho(anterior)},dadosPosteriores:{itemId:esperadaId,operacao:'EDITAR_CONTRIBUICAO',declaracaoPreliminar:resumoRascunho(limpa)}});
        return {id:esperadaId,status:'SEM_ENVIO'};
      }
      if(!c||c.id!==comprovanteId||c.contratoId!==contratoId||c.entregavelId!==entregavelId||!['PENDENTE_VERIFICACAO','REJEITADA'].includes(c.status))throw new ConflictException('Somente a versão atual pendente de verificação ou em revisão pode ser editada. Reabra a evidência se necessário.');
      await this.protegerDecisoesDeOcorrencia(m,contratoId,c.id,true);
      await exigirPermissaoParcela(m,contratoId,ator);
      const parcela=e.execucoesIntegradas?await m.findOneBy(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA',origemId:c.id}):null;
      if(ator.perfil!=='ADMINISTRADOR'&&(dto.ocorrenciaId||c.ocorrenciaQuantidadeId||parcela?.ocorrenciaId)){
        const v=await m.findOneBy(PermissaoContrato,{contratoId,usuarioId:ator.id});
        const p=v&&permissoesEfetivas(ator.perfil,v.podeEditar,v.permissoesDetalhadas);
        if(!p?.vincularEvidenciasOcorrencia||!p.registrarExecucaoOcorrencia)throw new ForbiddenException('Sem autorização para registrar execução nesta ocorrência.');
      }
      if(parcela?.referenciaId||c.origemQuantidade==='COMPROVACAO')throw new ConflictException('Esta evidência comprova uma execução existente; preserve essa referência.');
      const referenciasQuantidade=await m.query(`SELECT 1 FROM comprovantes_evidencia WHERE contrato_id=$1 AND origem_quantidade='COMPROVACAO' AND referencia_execucao=$2 LIMIT 1`,[contratoId,`evidencia:${c.id}`]);
      if(referenciasQuantidade.length)throw new ConflictException('Outra evidência referencia esta execução. Resolva esse vínculo antes de corrigir.');
      const anterior={...publico(c),parcelaExecucao:parcela?snapshotParcela(parcela):null};
      if(parcela){
        const refs=await m.query(`SELECT 1 FROM execucoes_entregavel WHERE referencia_id=$1 LIMIT 1`,[parcela.id]);
        if(refs.length)throw new ConflictException('Outra evidência referencia esta execução. Resolva esse vínculo antes de corrigir.');
        await m.delete(ExecucaoLancamento,{id:parcela.id,contratoId,entregavelId});
      }
      if(dto.modalidade==='SEM_CONTRIBUICAO'&&(dto.valor||dto.ocorrenciaId))throw new BadRequestException('Não informe valor sem contribuição.');
      if(dto.modalidade!=='SEM_CONTRIBUICAO'&&!dto.valor)throw new BadRequestException('Informe a contribuição.');
      const vinculo=dto.modalidade==='QUANTITATIVA'?normalizarVinculoQuantidade({quantidadeExecutada:dto.valor,ocorrenciaQuantidadeId:dto.ocorrenciaId,origemQuantidade:'NOVA_EXECUCAO',referenciaExecucao:c.referenciaExecucao??`evidencia-${c.id}`}):null;
      await validarOcorrenciaQuantidade(m,e,vinculo);
      c.quantidadeDeclarada=vinculo?.quantidadeDeclarada??null;c.ocorrenciaQuantidadeId=vinculo?.ocorrenciaQuantidadeId??null;c.origemQuantidade=vinculo?.origemQuantidade??null;c.referenciaExecucao=vinculo?.referenciaExecucao??null;c.quantidadeAprovada=null;
      if(c.status==='REJEITADA'){c.status='PENDENTE_VERIFICACAO';c.verificadoPor=null;c.verificadoEm=null;}
      await repo.save(c);
      if(vinculo){await validarContribuicaoEvidencia(m,e,c);if(!vinculo.ocorrenciaQuantidadeId&&!e.quantidadeDiretaIntegrada){await m.update(Entregavel,{id:e.id,contratoId},{quantidadeDiretaIntegrada:true});e.quantidadeDiretaIntegrada=true;}}
      let novaParcela=null;
      if(dto.modalidade==='PERCENTUAL'){
        if(e.tipo==='UNICO'&&dto.ocorrenciaId)throw new BadRequestException('Entregável único não utiliza ocorrência para contribuição percentual.');
        novaParcela=await criarParcela(m,e,ator,{origem:'EVIDENCIA',origemId:c.id,valor:dto.valor,ocorrenciaId:dto.ocorrenciaId,data:parcela?.dataExecucao??hojeCivil(),observacao:parcela?.observacao,...(parcela?{id:parcela.id}:{})});
        const conflito=await m.query(`SELECT 1 FROM atividade_comprovantes ac JOIN execucoes_entregavel p ON p.origem='ATIVIDADE' AND p.origem_id=ac.atividade_id AND p.contrato_id=ac.contrato_id WHERE ac.comprovante_id=$1 AND ac.contrato_id=$2 AND p.entregavel_id=$3 AND p.centesimos>0 AND p.ocorrencia_id IS NOT DISTINCT FROM $4::uuid LIMIT 1`,[c.id,contratoId,e.id,novaParcela.ocorrenciaId]);
        if(conflito.length)throw new ConflictException('Uma atividade vinculada já registra execução neste destino.');
      }
      if(dto.ocorrenciaId)await m.query(`INSERT INTO ocorrencia_comprovantes (ocorrencia_id,comprovante_id,contrato_id,vinculado_por) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[dto.ocorrenciaId,c.id,contratoId,ator.id]);
      await validarSaldoParcelas(m,e);
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,entidadeTipo:'ENTREGAVEL',entidadeId:entregavelId,dadosAnteriores:{...anterior,evidenciaEsperadaId:esperadaId},dadosPosteriores:{...publico(c),evidenciaEsperadaId:esperadaId,operacao:'EDITAR_CONTRIBUICAO',parcelaExecucao:novaParcela?snapshotParcela(novaParcela):null}});
      return publico(c);
    });
  }
  async enviar(contratoId: string, entregavelId: string, esperadaId: string,
    arquivo: ArquivoComprovante | undefined, dto: EnviarComprovanteDto, ator: UsuarioAutenticado, chaveEnvio?: string | string[]) {
    dto = dto ?? {};
    if (!arquivo || !Buffer.isBuffer(arquivo.buffer) || arquivo.size !== arquivo.buffer.length)
      throw new BadRequestException('Selecione um arquivo válido');
    const op = operacaoUpload(chaveEnvio, `evidencia:${contratoId}:${entregavelId}:${esperadaId}`,ator.id,arquivo,dto);
    const recuperar = async (m: EntityManager) => {
      const id = await recuperarUpload(m,op);
      if (!id) return null;
      const item = await m.getRepository(ComprovanteEvidencia).findOneBy({id,contratoId,entregavelId,evidenciaEsperadaId:esperadaId,autorId:ator.id});
      if (!item) throw new ServiceUnavailableException('Registro do envio precisa de reconciliação');
      return item;
    };
    if (op) {
      const anterior = await this.db.transaction(async m => {
        await exigirPermissaoTransacional(m,contratoId,ator,'enviarComprovantes');
        return recuperar(m);
      });
      if (anterior) return publico(anterior);
    }
    let repetido = false;
    // Verificar escopo antes de criar blob; repetir sob lock na transação.
    const antes = await this.contexto(this.db.manager, contratoId, entregavelId, esperadaId);
    this.validarPlanejamentoAtivo(antes.entregavel, antes.esperada);
    await this.etapaAtiva(this.db.manager, antes.entregavel);
    const rascunho = await this.rascunho(this.db.manager,esperadaId,entregavelId);
    if(rascunho?.origemCompartilhadaId)throw new ConflictException('O comprovante compartilhado deve ser anexado no registro de origem.');
    if (rascunho) {
      for (const [k,v] of Object.entries(dto??{})) if (k!=='descricao' && v!==undefined && v!==rascunho[k as keyof EnviarComprovanteDto]) throw new ConflictException('Edite a declaração salva antes de anexar o arquivo.');
      dto = {...dto,...rascunho};
    }
    const destinos = destinosEvidencia(dto?.destinosCompartilhados);
    if (destinos.some(d=>d.entregavelId===entregavelId)) throw new BadRequestException('O entregável de origem já está selecionado.');
    let vinculoQuantidade = normalizarVinculoQuantidade(dto ?? {});
    let ocorrenciasVinculadas=idsVinculadosEnvio(dto?.ocorrenciasVinculadas);
    let atividadesVinculadas=idsVinculadosEnvio(dto?.atividadesVinculadas);
    await validarOcorrenciaQuantidade(this.db.manager, antes.entregavel, vinculoQuantidade);
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
    let callbackConcluido = false;
    try {
      salvo = await this.db.transaction(async m => {
        // Ordem global de locks impede deadlock quando dois envios cruzam contratos.
        const alvos = destinos.length ? await m.findBy(Entregavel,{id:In(destinos.map(d=>d.entregavelId))}) : [];
        if (alvos.length!==destinos.length) throw new NotFoundException('Destino indisponível.');
        const contratosEnvio = [...new Set([contratoId,...alvos.map(e=>e.contratoId)])].sort();
        for (const cid of contratosEnvio) {
          await exigirPermissaoTransacional(m,cid,ator,'enviarComprovantes');
          if (destinos.length) await exigirPermissaoTransacional(m,cid,ator,'compartilharEvidencias');
        }
        const contratosBloqueados = new Map<string,Contrato>();
        for (const cid of contratosEnvio) contratosBloqueados.set(cid,await this.contratoEditavel(m,cid));
        const anterior = await recuperar(m);
        if (anterior) { repetido = true; callbackConcluido = true; return anterior; }
        const atual = await this.contexto(m, contratoId, entregavelId, esperadaId);
        this.exigirRegularizacao(contratosBloqueados.get(contratoId)!,atual.entregavel);
        if (JSON.stringify(await this.rascunho(m,esperadaId,entregavelId)) !== JSON.stringify(rascunho)) throw new ConflictException('A declaração foi alterada. Atualize a evidência e tente novamente.');
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
        // Troca de arquivo não é uma edição implícita de execução ou vínculos.
        if (ultima) {
          if (vinculoQuantidade || dto.percentualExecucao || dto.comprovaExecucaoId || dto.ocorrenciaExecucaoId ||
              dto.ocorrenciasVinculadas !== undefined || dto.atividadesVinculadas !== undefined || destinos.length)
            throw new ConflictException('Substitua somente o arquivo. Edite a contribuição ou os vínculos em uma operação própria.');
          await this.protegerDecisoesDeOcorrencia(m,contratoId,ultima.id,true);
          const parcelaAnterior=atual.entregavel.execucoesIntegradas?await m.findOneBy(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA',origemId:ultima.id}):null;
          const refs=await m.query(`SELECT 1 FROM comprovantes_evidencia WHERE contrato_id=$1 AND origem_quantidade='COMPROVACAO' AND referencia_execucao=$2 LIMIT 1`,[contratoId,`evidencia:${ultima.id}`]);
          if(refs.length || parcelaAnterior && (await m.query(`SELECT 1 FROM execucoes_entregavel WHERE referencia_id=$1 LIMIT 1`,[parcelaAnterior.id])).length)
            throw new ConflictException('Esta versão é referência de outra execução. Preserve a referência antes de substituir o arquivo.');
          if(!vinculoQuantidade && !dto.percentualExecucao && !dto.comprovaExecucaoId && ultima.quantidadeDeclarada!=null){
            vinculoQuantidade=normalizarVinculoQuantidade({quantidadeExecutada:ultima.quantidadeDeclarada,ocorrenciaQuantidadeId:ultima.ocorrenciaQuantidadeId,origemQuantidade:ultima.origemQuantidade,referenciaExecucao:ultima.referenciaExecucao});
          } else if(!vinculoQuantidade && !dto.percentualExecucao && !dto.comprovaExecucaoId && parcelaAnterior){
            dto={...dto,percentualExecucao:parcelaAnterior.referenciaId?undefined:String(parcelaAnterior.centesimos/100),comprovaExecucaoId:parcelaAnterior.referenciaId??undefined,ocorrenciaExecucaoId:parcelaAnterior.ocorrenciaId??undefined};
          }
          const os:{id:string}[]=await m.query(`SELECT ocorrencia_id AS id FROM ocorrencia_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2`,[contratoId,ultima.id]);
          const atividadesAnteriores:{id:string}[]=await m.query(`SELECT atividade_id AS id FROM atividade_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2`,[contratoId,ultima.id]);
          ocorrenciasVinculadas=[...new Set([...ocorrenciasVinculadas,...os.map(r=>r.id).filter(Boolean)])];
          atividadesVinculadas=[...new Set([...atividadesVinculadas,...atividadesAnteriores.map(r=>r.id).filter(Boolean)])];
          dto={...dto,descricao:dto.descricao??ultima.descricao??undefined};
        }
        if (atual.entregavel.statusExecucao==='CONCLUIDO_PARCIALMENTE' && (vinculoQuantidade?.origemQuantidade==='NOVA_EXECUCAO'||dto?.percentualExecucao)) throw new ConflictException('A regularização documental não pode acrescentar execução física.');
        await validarOcorrenciaQuantidade(m, atual.entregavel, vinculoQuantidade);
        if(vinculoQuantidade?.origemQuantidade==='NOVA_EXECUCAO'||dto.percentualExecucao) await exigirPermissaoParcela(m,contratoId,ator);
        if ((vinculoQuantidade || dto?.ocorrenciaExecucaoId || ocorrenciasVinculadas.length || atividadesVinculadas.length) && ator.perfil !== PerfilUsuario.ADMINISTRADOR) {
          const vinculo = await m.getRepository(PermissaoContrato).findOneBy({ contratoId, usuarioId: ator.id });
          const permissoes = vinculo && permissoesEfetivas(ator.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas);
          if (((vinculoQuantidade?.ocorrenciaQuantidadeId || dto?.ocorrenciaExecucaoId || ocorrenciasVinculadas.length) && !permissoes?.vincularEvidenciasOcorrencia) || (vinculoQuantidade?.origemQuantidade === 'NOVA_EXECUCAO' && !(vinculoQuantidade.ocorrenciaQuantidadeId ? permissoes?.registrarExecucaoOcorrencia : permissoes?.editarExecucaoFisica)) || (dto.percentualExecucao && dto.ocorrenciaExecucaoId && !permissoes?.registrarExecucaoOcorrencia) || (atividadesVinculadas.length && !permissoes?.editarAtividades))
            throw new ForbiddenException('Sem permissão para vincular a evidência ou registrar execução na ocorrência.');
        }
        if(ocorrenciasVinculadas.length){
          const validas: {id:string}[]=await m.query(`SELECT id FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id=ANY($3::uuid[]) AND substituida_em IS NULL`,[contratoId,entregavelId,ocorrenciasVinculadas]);
          if(validas.length!==ocorrenciasVinculadas.length)throw new ConflictException('Selecione ocorrências vigentes do entregável de origem.');
        }
        if(atividadesVinculadas.length){
          const validas: {id:string}[]=await m.query(`SELECT DISTINCT a.id FROM atividades a JOIN atividade_entregaveis ae ON ae."atividadeId"=a.id AND ae."entregavelId"=$2 WHERE a."contratoId"=$1 AND a.id=ANY($3::uuid[]) AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA'`,[contratoId,entregavelId,atividadesVinculadas]);
          if(validas.length!==atividadesVinculadas.length)throw new ConflictException('Selecione atividades ativas vinculadas ao entregável de origem.');
          await this.exigirAtividadesSemMedicaoDuplicada(m,atual.entregavel,atividadesVinculadas,vinculoQuantidade?.origemQuantidade==='NOVA_EXECUCAO',vinculoQuantidade?.ocorrenciaQuantidadeId??null,Boolean(dto.percentualExecucao),dto.ocorrenciaExecucaoId??null);
        }
        const grupoCompartilhadoId = destinos.length ? randomUUID() : ultima?.grupoCompartilhadoId ?? null;
        const novo = repo.create({ contratoId, entregavelId, evidenciaEsperadaId: esperadaId, grupoCompartilhadoId,
          autorId: ator.id, nomeOriginal: pendente.nomeOriginal, tipoMime: pendente.mimeEfetivo,
          tamanho: pendente.tamanho, sha256: pendente.sha256, storageKey: pendente.chave,
          descricao: dto.descricao?.trim() || null, status: 'PENDENTE_VERIFICACAO',
          quantidadeDeclarada: null, ocorrenciaQuantidadeId: null, origemQuantidade: null, referenciaExecucao: null, ...vinculoQuantidade, quantidadeAprovada: null,
          verificadoPor: null, verificadoEm: null });
        const criado = await repo.save(novo);
        if(vinculoQuantidade?.origemQuantidade==='NOVA_EXECUCAO' && !vinculoQuantidade.ocorrenciaQuantidadeId && !atual.entregavel.quantidadeDiretaIntegrada){
          atual.entregavel.quantidadeDiretaIntegrada=true;
          await m.getRepository(Entregavel).update({id:entregavelId,contratoId},{quantidadeDiretaIntegrada:true});
        }
        let parcela = null;
        if(dto?.percentualExecucao!==undefined||dto?.comprovaExecucaoId){
          if(vinculoQuantidade) throw new BadRequestException('Não misture quantidade e contribuição percentual.');
          parcela=await criarParcela(m,atual.entregavel,ator,{origem:'EVIDENCIA',origemId:criado.id,ocorrenciaId:dto.ocorrenciaExecucaoId,valor:dto.percentualExecucao,referenciaId:dto.comprovaExecucaoId,data:hojeCivil(),observacao:dto.descricao});
        }
        // Os vínculos existem desde o envio; a comprovação só considera versões verificadas.
        const idsOcorrencias=[...new Set([...ocorrenciasVinculadas,...(criado.ocorrenciaQuantidadeId?[criado.ocorrenciaQuantidadeId]:[]),...(parcela?.ocorrenciaId?[parcela.ocorrenciaId]:[])])];
        if(idsOcorrencias.length)await m.query(`INSERT INTO ocorrencia_comprovantes (ocorrencia_id,comprovante_id,contrato_id,vinculado_por) SELECT unnest($1::uuid[]),$2,$3,$4 ON CONFLICT DO NOTHING`,[idsOcorrencias,criado.id,contratoId,ator.id]);
        if(atividadesVinculadas.length)await m.query(`INSERT INTO atividade_comprovantes (atividade_id,comprovante_id,contrato_id,vinculado_por) SELECT unnest($1::uuid[]),$2,$3,$4 ON CONFLICT DO NOTHING`,[atividadesVinculadas,criado.id,contratoId,ator.id]);
        if (vinculoQuantidade) await validarContribuicaoEvidencia(m,atual.entregavel,criado);
        if (parcela?.centesimos && atividadesVinculadas.length) {
          const conflito=await m.query(`SELECT 1 FROM execucoes_entregavel p WHERE p.contrato_id=$1 AND p.entregavel_id=$2 AND p.origem='ATIVIDADE' AND p.origem_id=ANY($3::uuid[]) AND p.centesimos>0 AND p.ocorrencia_id IS NOT DISTINCT FROM $4::uuid LIMIT 1`,[contratoId,entregavelId,atividadesVinculadas,parcela.ocorrenciaId]);
          if (conflito.length) throw new ConflictException('A atividade vinculada já registra execução neste destino. Utilize comprovação.');
        }
        await this.auditoria.registrarNaTransacao(m, ator, {
          acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO,
          entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
          dadosPosteriores: { comprovanteId: criado.id, evidenciaEsperadaId: esperadaId,
            nomeOriginal: criado.nomeOriginal, tamanho: criado.tamanho, status: criado.status, ocorrenciasVinculadas:idsOcorrencias, atividadesVinculadas,
            quantidadeDeclarada: criado.quantidadeDeclarada, ocorrenciaQuantidadeId: criado.ocorrenciaQuantidadeId, origemQuantidade: criado.origemQuantidade, referenciaExecucao: criado.referenciaExecucao, unidadeMedida: atual.entregavel.unidadeMedida, ...(parcela?{parcelaExecucao:snapshotParcela(parcela)}:{}) },
        });
        for (const destino of destinos) {
          const alvo = alvos.find(e=>e.id===destino.entregavelId)!;
          const e = await m.findOneBy(Entregavel,{id:alvo.id,contratoId:alvo.contratoId});
          if (!e) throw new NotFoundException('Destino indisponível.');
          this.exigirRegularizacao(contratosBloqueados.get(e.contratoId)!,e);
          const p = await this.permissaoDestino(m,e.contratoId,ator);
          if (!p.enviar || !p.compartilhar) throw new ForbiddenException('Sem autorização para compartilhar no contrato de destino.');
          if (e.statusExecucao==='CONCLUIDO_PARCIALMENTE') throw new ConflictException('Regularize a documentação no próprio entregável parcialmente concluído.');
          await this.etapaAtiva(m,e);
          const requisitos=m.getRepository(EvidenciaEsperada);
          let ev: EvidenciaEsperada | null;
          if (destino.esperadaId) {
            ev=await requisitos.findOneBy({id:destino.esperadaId,entregavelId:e.id});
            if (!ev) throw new NotFoundException('Requisito de destino indisponível.');
            if (await repo.count({where:{evidenciaEsperadaId:ev.id}})) throw new ConflictException('O requisito de destino já possui arquivo; selecione outro requisito.');
            const reserva=await this.rascunho(m,ev.id,e.id);
            if(reserva&&reserva.origemCompartilhadaId!==esperadaId)throw new ConflictException('A evidência vinculada possui uma declaração própria.');
            if (ev.tipoEvidencia.trim().toLocaleLowerCase('pt-BR')!==atual.esperada.tipoEvidencia.trim().toLocaleLowerCase('pt-BR')) throw new ConflictException('O tipo da evidência deve corresponder ao requisito de destino.');
          } else {
            if (!p.criarOpcional) throw new ForbiddenException('Sem permissão para criar vínculo documental opcional no destino.');
            if (await requisitos.count({where:{entregavelId:e.id,arquivadoEm:IsNull()}})>=10) throw new ConflictException('Limite de evidências no entregável de destino.');
            ev=await requisitos.save(requisitos.create({entregavelId:e.id,tipoEvidencia:atual.esperada.tipoEvidencia,descricao:atual.esperada.descricao,obrigatoria:false}));
          }
          this.validarPlanejamentoAtivo(e,ev);
          validarTipo(ev.tipoEvidencia);
          // Mesmo blob, contribuição opcional e explicitamente declarada neste destino.
          const vq=normalizarVinculoQuantidade(destino.quantidadeExecutada?{quantidadeExecutada:destino.quantidadeExecutada,ocorrenciaQuantidadeId:destino.ocorrenciaId,origemQuantidade:'NOVA_EXECUCAO',referenciaExecucao:randomUUID()}:{});
          const idsDestino=[...new Set([...(destino.ocorrenciaIds??[]),...(destino.ocorrenciaId?[destino.ocorrenciaId]:[])])];
          if(vq||destino.percentualExecucao) await exigirPermissaoParcela(m,e.contratoId,ator);
          if(ator.perfil!==PerfilUsuario.ADMINISTRADOR&&(vq||idsDestino.length||destino.percentualExecucao)){
            const vinculo=await m.getRepository(PermissaoContrato).findOneBy({contratoId:e.contratoId,usuarioId:ator.id});
            const permissoes=vinculo&&permissoesEfetivas(ator.perfil,vinculo.podeEditar,vinculo.permissoesDetalhadas);
            if((idsDestino.length&&!permissoes?.vincularEvidenciasOcorrencia)||(vq&&!(vq.ocorrenciaQuantidadeId?permissoes?.registrarExecucaoOcorrencia:permissoes?.editarExecucaoFisica))||(destino.percentualExecucao&&destino.ocorrenciaId&&!permissoes?.registrarExecucaoOcorrencia))throw new ForbiddenException('Sem autorização para os vínculos ou a execução do destino.');
          }
          if(idsDestino.length){const validas=await m.query(`SELECT id FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND id=ANY($3::uuid[]) AND substituida_em IS NULL`,[e.contratoId,e.id,idsDestino]);if(validas.length!==idsDestino.length)throw new ConflictException('Selecione ocorrências vigentes do entregável de destino.');}
          await validarOcorrenciaQuantidade(m,e,vq);
          if(destino.percentualExecucao&&destino.ocorrenciaId&&e.tipo==='UNICO')throw new BadRequestException('A parcela do Único deve ser diretamente no entregável.');
          const copia=await repo.save(repo.create({contratoId:e.contratoId,entregavelId:e.id,evidenciaEsperadaId:ev.id,grupoCompartilhadoId,autorId:ator.id,nomeOriginal:pendente.nomeOriginal,tipoMime:pendente.mimeEfetivo,tamanho:pendente.tamanho,sha256:pendente.sha256,storageKey:pendente.chave,descricao:criado.descricao,status:'PENDENTE_VERIFICACAO',quantidadeDeclarada:null,quantidadeAprovada:null,ocorrenciaQuantidadeId:null,origemQuantidade:null,referenciaExecucao:null,...vq,verificadoPor:null,verificadoEm:null}));
          if(vq&&!vq.ocorrenciaQuantidadeId&&!e.quantidadeDiretaIntegrada){e.quantidadeDiretaIntegrada=true;await m.update(Entregavel,{id:e.id,contratoId:e.contratoId},{quantidadeDiretaIntegrada:true});}
          const parcelaDestino=destino.percentualExecucao?await criarParcela(m,e,ator,{origem:'EVIDENCIA',origemId:copia.id,valor:destino.percentualExecucao,ocorrenciaId:destino.ocorrenciaId,data:hojeCivil(),observacao:criado.descricao}):null;
          if(idsDestino.length)await m.query(`INSERT INTO ocorrencia_comprovantes(ocorrencia_id,comprovante_id,contrato_id,vinculado_por) SELECT unnest($1::uuid[]),$2,$3,$4 ON CONFLICT DO NOTHING`,[idsDestino,copia.id,e.contratoId,ator.id]);
          if(vq)await validarContribuicaoEvidencia(m,e,copia);
          await requisitos.update({id:ev.id,entregavelId:e.id},{rascunhoEnvio:null});
          await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO,entidadeTipo:'ENTREGAVEL',entidadeId:e.id,dadosPosteriores:{comprovanteId:copia.id,evidenciaEsperadaId:ev.id,grupoCompartilhadoId,status:copia.status,nomeOriginal:copia.nomeOriginal,contribuicaoAdicional:Boolean(vq||parcelaDestino),quantidadeDeclarada:copia.quantidadeDeclarada,ocorrenciasVinculadas:idsDestino,parcelaExecucao:parcelaDestino?snapshotParcela(parcelaDestino):null}});
        }
        if (rascunho) await m.getRepository(EvidenciaEsperada).update({id:esperadaId,entregavelId},{rascunhoEnvio:null});
        await registrarUpload(m,op,criado.id);
        callbackConcluido = true;
        return criado;
      });
    } catch (e) {
      // Erros de regra são lançados dentro da transação, antes do COMMIT.
      // Erro de transporte/COMMIT pode significar que os metadados já existem.
      if (callbackConcluido || !(e instanceof ConflictException || e instanceof NotFoundException || e instanceof BadRequestException || e instanceof ForbiddenException)) {
        this.logger.error('Resultado transacional de comprovante indeterminado; preservar blob para reconciliação');
        throw new ServiceUnavailableException('Envio com confirmação pendente; consulte a evidência antes de reenviar');
      }
      try { await this.armazenamento.removerOrfao(pendente); }
      catch { this.logger.error('Falha ao reconciliar blob após rollback de comprovante');
        throw new ServiceUnavailableException('Armazenamento requer reconciliação'); }
      if (e instanceof ConflictException || e instanceof NotFoundException || e instanceof BadRequestException || e instanceof ForbiddenException) throw e;
      this.logger.error('Falha no registro de comprovante');
      throw new ServiceUnavailableException('Falha ao registrar o comprovante');
    }
    try { if (repetido) await this.armazenamento.removerOrfao(pendente); else this.armazenamento.confirmarPersistencia(pendente); }
    catch { this.logger.error('Comprovante persistido com confirmação local pendente'); }
    return publico(salvo);
  }
  /** Verificação documental não aprova o encerramento operacional.
   * Esta rotina mantém compatibilidade de resposta, sem alterar estados-pai. */
  private async concluirHierarquiaSeComprovada(_m: EntityManager, _ator: UsuarioAutenticado,
    _contratoId: string, _entregavel: Entregavel): Promise<string[]> {
    return [];
  }
  async verificar(contratoId: string, entregavelId: string, esperadaId: string, comprovanteId: string,
    ator: UsuarioAutenticado, dto: VerificarComprovanteDto = {}) {
    return this.db.transaction(async m => {
      // A autorização é obtida exclusivamente no destino solicitado, nunca de IDs arbitrários do body.
      await exigirPermissaoTransacional(m, contratoId, ator, 'verificarComprovantes');
      const origem = await m.getRepository(ComprovanteEvidencia).findOne({where:{id:comprovanteId,contratoId,entregavelId,evidenciaEsperadaId:esperadaId},select:{id:true,grupoCompartilhadoId:true,storageKey:true,sha256:true}});
      if (!origem?.grupoCompartilhadoId) return this.verificarDestino(m,contratoId,entregavelId,esperadaId,comprovanteId,ator,dto);
      const grupo = {id:origem.grupoCompartilhadoId,storageKey:origem.storageKey,sha256:origem.sha256};
      // Serializa decisões concorrentes do mesmo grupo; só versões vigentes do mesmo arquivo.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[grupo.id]);
      const destinos: {id:string;contratoId:string;entregavelId:string;esperadaId:string;status:string}[] = await m.query(`
        SELECT c.id,c.contrato_id AS "contratoId",c.entregavel_id AS "entregavelId",c.evidencia_esperada_id AS "esperadaId",c.status
        FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
        JOIN entregaveis e ON e.id=c.entregavel_id AND e.contrato_id=c.contrato_id
        JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id JOIN contratos ct ON ct.id=c.contrato_id
        WHERE c.grupo_compartilhado_id=$1 AND c.storage_key=$2 AND c.sha256=$3
          AND ev.arquivado_em IS NULL AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL AND ct.arquivado_em IS NULL
          AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
        ORDER BY c.contrato_id,c.entregavel_id,c.id`,[grupo.id,grupo.storageKey,grupo.sha256]);
      if (!destinos.some(d=>d.id===comprovanteId)) throw new ConflictException('A evidência compartilhada não está vigente.');
      // Mesma ordem de locks do upload. O estado de cada destino é revalidado antes da escrita.
      for(const cid of [...new Set(destinos.map(d=>d.contratoId))].sort()) {
        try { await this.contratoEditavel(m,cid); }
        catch(e) { if(cid===contratoId)throw e; throw new ConflictException('Um dos vínculos compartilhados não permite a aprovação neste momento.'); }
      }
      const resultado = await this.verificarDestino(m,contratoId,entregavelId,esperadaId,comprovanteId,ator,dto);
      for(const d of destinos) {
        if(d.id===comprovanteId || d.status==='VERIFICADA') continue;
        try { await this.verificarDestino(m,d.contratoId,d.entregavelId,d.esperadaId,d.id,ator,{},grupo); }
        catch(e) { if(e instanceof ConflictException || e instanceof BadRequestException || e instanceof NotFoundException || e instanceof ForbiddenException) throw new ConflictException('Não foi possível aprovar todos os vínculos. Confira as contribuições e a situação dos destinos.'); throw e; }
      }
      return resultado;
    });
  }

  private async verificarDestino(m: EntityManager, contratoId: string, entregavelId: string, esperadaId: string, comprovanteId: string,
    ator: UsuarioAutenticado, dto: VerificarComprovanteDto, grupoAutorizado?:{id:string;storageKey:string;sha256:string}) {
      if (!grupoAutorizado) await exigirPermissaoTransacional(m, contratoId, ator, 'verificarComprovantes');
      const contrato = await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.exigirRegularizacao(contrato,entregavel);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      const repo = m.getRepository(ComprovanteEvidencia);
      const ultima = await repo.createQueryBuilder('c').addSelect('c.storageKey').setLock('pessimistic_write').where('c.evidenciaEsperadaId = :esperadaId', { esperadaId })
        .orderBy('c.criadoEm', 'DESC').addOrderBy('c.id', 'DESC').getOne();
      if (!ultima || ultima.id !== comprovanteId || ultima.contratoId !== contratoId || ultima.entregavelId !== entregavelId)
        throw new ConflictException('Só o envio mais recente pode ser verificado');
      if (!['PENDENTE_VERIFICACAO','REJEITADA'].includes(ultima.status)) throw new ConflictException('Comprovante já verificado');
      if (grupoAutorizado) {
        if (ultima.grupoCompartilhadoId !== grupoAutorizado.id || ultima.storageKey !== grupoAutorizado.storageKey || ultima.sha256 !== grupoAutorizado.sha256) throw new ConflictException('O vínculo compartilhado mudou. Atualize a evidência.');
      } else if (!await this.verificadorAutorizado(m, ator, entregavel)) throw new ForbiddenException('Sem permissão para verificar esta evidência');
      await lerArquivoIntegro(this.armazenamento, ultima);
      const declarada = ultima.quantidadeDeclarada ?? null;
      if (dto?.quantidadeAprovada !== undefined && declarada === null)
        throw new BadRequestException('Esta evidência não declarou quantidade para verificação');
      if (dto?.quantidadeAprovada !== undefined && milesimos(dto.quantidadeAprovada) !== milesimos(declarada)) throw new BadRequestException('Edite a contribuição com a permissão correspondente antes de verificar.');
      const aprovada = declarada;
      if (aprovada !== null && (!/^(?:\d{1,15})(?:\.\d{1,3})?$/.test(aprovada) ||
          milesimos(aprovada) <= 0n || milesimos(aprovada) > milesimos(declarada)))
        throw new BadRequestException('A quantidade validada deve ser positiva e não exceder a declarada');
      if (declarada !== null) {
        await validarContribuicaoEvidencia(m, entregavel, ultima);
      }
      const parcela = entregavel.execucoesIntegradas ? await m.findOneBy(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA',origemId:ultima.id}) : null;
      if (parcela?.referenciaId) {
        const origem = (await resumoParcelas(m, entregavel)).itens.find(i => i.id === parcela.referenciaId);
        if (!origem || origem.reconhecido <= 0 || origem.ocorrenciaId !== parcela.ocorrenciaId)
          throw new ConflictException('A execução referenciada não está mais reconhecida neste destino. Regularize a referência antes de verificar.');
      }
      if(ultima.origemQuantidade==='NOVA_EXECUCAO'||(parcela?.centesimos && !parcela.referenciaId)) {
        await this.protegerDecisoesDeOcorrencia(m,contratoId,ultima.id,false);
        if(ultima.origemQuantidade==='NOVA_EXECUCAO') await validarOcorrenciaQuantidade(m,entregavel,normalizarVinculoQuantidade({quantidadeExecutada:ultima.quantidadeDeclarada,ocorrenciaQuantidadeId:ultima.ocorrenciaQuantidadeId,origemQuantidade:ultima.origemQuantidade,referenciaExecucao:ultima.referenciaExecucao}));
        if(parcela?.centesimos && parcela.ocorrenciaId) await exigirOcorrenciaParcela(m,entregavel,parcela.ocorrenciaId);
      }
      if(parcela?.centesimos){
        const vinculadas:{id:string}[]=await m.query(`SELECT atividade_id AS id FROM atividade_comprovantes WHERE contrato_id=$1 AND comprovante_id=$2`,[contratoId,ultima.id]);
        await this.exigirAtividadesSemMedicaoDuplicada(m,entregavel,vinculadas.map(v=>v.id).filter(Boolean),false,null,true,parcela.ocorrenciaId);
        const n=parcela.centesimos;
        if(dto?.percentualAprovado!==undefined && centesimos(dto.percentualAprovado)!==n)throw new BadRequestException('Edite a contribuição com a permissão correspondente antes de verificar.');
        parcela.centesimosAprovados=n;parcela.decididoPor=ator.id;parcela.decididoEm=new Date();await m.save(ExecucaoLancamento,parcela);
      }else if(dto?.percentualAprovado!==undefined)throw new BadRequestException('Não há contribuição percentual declarada nesta evidência.');
      const statusAnterior = ultima.status;
      ultima.quantidadeAprovada = aprovada;
      ultima.status = 'VERIFICADA'; ultima.verificadoPor = ator.id; ultima.verificadoEm = new Date();
      if (esperada.reabertoEm) {
        await m.getRepository(EvidenciaEsperada).update({ id: esperadaId, entregavelId }, { reabertoEm: null });
      }
      const resultado = await repo.save(ultima);
      if(declarada!==null)await validarContribuicaoEvidencia(m,entregavel,resultado);
      await validarSaldoParcelas(m,entregavel);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { comprovanteId, evidenciaEsperadaId: esperadaId, status: statusAnterior },
        dadosPosteriores: { comprovanteId, evidenciaEsperadaId: esperadaId, status: resultado.status,
          verificadoPor: ator.id, verificadoEm: resultado.verificadoEm,
          quantidadeDeclarada: declarada, quantidadeAprovada: aprovada, ...(grupoAutorizado ? {grupoCompartilhadoId:grupoAutorizado.id, decisaoCompartilhada:true} : {}), ...(parcela?{parcelaExecucao:snapshotParcela(parcela)}:{}) },
      });
      if (resultado.ocorrenciaQuantidadeId) await m.query(`INSERT INTO ocorrencia_comprovantes
        (ocorrencia_id, comprovante_id, contrato_id, vinculado_por) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [resultado.ocorrenciaQuantidadeId, resultado.id, contratoId, ator.id]);
      if(parcela?.ocorrenciaId)await m.query(`INSERT INTO ocorrencia_comprovantes
        (ocorrencia_id, comprovante_id, contrato_id, vinculado_por) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[parcela.ocorrenciaId,resultado.id,contratoId,ator.id]);
      const ocorrenciasReconhecidas:{id:string}[]=await m.query(`SELECT DISTINCT o.id FROM vw_provas_ocorrencia_r41 v JOIN ocorrencias o ON o.id=v.ocorrencia_id AND o.contrato_id=v.contrato_id WHERE v.contrato_id=$1 AND v.comprovante_id=$2 AND o.entregavel_id=$3 AND o.substituida_em IS NULL AND o.status IN ('NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO') ORDER BY o.id`,[contratoId,resultado.id,entregavelId]);
      for(const o of ocorrenciasReconhecidas.filter(o=>typeof o.id==='string'))
        await reconhecerExecucaoOcorrencia(m,this.auditoria,ator,entregavel,o.id);
      await iniciarHierarquiaOperacional(m,this.auditoria,ator,contratoId,entregavelId);
      const conclusoes = await this.concluirHierarquiaSeComprovada(m, ator, contratoId, entregavel);
      return { ...publico(resultado), conclusoes };
  }
  /** Rejeitar a última versão exige autoridade de verificação, justificativa e
   * conciliação quantitativa na mesma transação. Arquivo e histórico preservados. */
  async rejeitar(contratoId: string, entregavelId: string, esperadaId: string,
    comprovanteId: string, motivo: string, ator: UsuarioAutenticado) {
    const justificativa = motivo?.trim() ?? '';
    if (justificativa.length < 15 || justificativa.length > 200)
      throw new BadRequestException('Informe justificativa entre 15 e 200 caracteres');
    return this.db.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'verificarComprovantes');
      const contrato = await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.exigirRegularizacao(contrato,entregavel);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      if (!await this.verificadorAutorizado(m, ator, entregavel))
        throw new ForbiddenException('Sem permissão para rejeitar esta evidência');
      const repo = m.getRepository(ComprovanteEvidencia);
      const ultima = await repo.createQueryBuilder('c').setLock('pessimistic_write')
        .where('c.evidenciaEsperadaId = :esperadaId', { esperadaId })
        .orderBy('c.criadoEm', 'DESC').addOrderBy('c.id', 'DESC').getOne();
      if (!ultima || ultima.id !== comprovanteId || ultima.contratoId !== contratoId ||
          ultima.entregavelId !== entregavelId || ultima.status === 'REJEITADA')
        throw new ConflictException('Somente a versão vigente pode ser rejeitada');
      if (ultima.status === 'VERIFICADA') await this.protegerDecisoesDeOcorrencia(m,contratoId,ultima.id,true);
      if (entregavel.statusExecucao==='CONCLUIDO_PARCIALMENTE' && ultima.status==='VERIFICADA') throw new ConflictException('Reabra o entregável antes de invalidar uma prova reconhecida.');
      const parcela = entregavel.execucoesIntegradas ? await m.findOneBy(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA',origemId:ultima.id}) : null;
      if(ultima.status==='VERIFICADA'){
        if(ultima.origemQuantidade==='NOVA_EXECUCAO'&&milesimos(ultima.quantidadeAprovada)>0n)await protegerReferenciaManual(m,contratoId,ultima.id,'QUANTIDADE','evidencia');
        if(parcela&&!parcela.referenciaId&&parcela.centesimos>0)await protegerReferenciaManual(m,contratoId,parcela.id,'PERCENTUAL');
      }
      const anterior = { status: ultima.status, quantidadeAprovada: ultima.quantidadeAprovada,
        verificadoPor: ultima.verificadoPor, verificadoEm: ultima.verificadoEm,
        ...(parcela ? { parcelaExecucao: snapshotParcela(parcela) } : {}) };
      ultima.status = 'REJEITADA'; ultima.quantidadeAprovada = null;
      ultima.verificadoPor = null; ultima.verificadoEm = null;
      const salvo = await repo.save(ultima);
      if (parcela) {
        parcela.centesimosAprovados = null; parcela.decididoPor = null; parcela.decididoEm = null;
        await m.save(ExecucaoLancamento, parcela);
      }
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REJEITADO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { ...anterior, comprovanteId, evidenciaEsperadaId: esperadaId },
        dadosPosteriores: { status: salvo.status, quantidadeAprovada: null,
          comprovanteId, evidenciaEsperadaId: esperadaId, justificativa, decididoPor: ator.id,
          ...(parcela ? { parcelaExecucao: snapshotParcela(parcela) } : {}) },
      });
      return publico(salvo);
    });
  }

  /** Retorna o comprovante mais recente à análise, mantendo o arquivo e a auditoria. */
  async reabrir(contratoId: string, entregavelId: string, esperadaId: string, ator: UsuarioAutenticado, motivo?: string) {
    return this.db.transaction(async m => {
      await exigirPermissaoTransacional(m, contratoId, ator, 'reabrirEvidencias');
      const contrato = await this.contratoEditavel(m, contratoId);
      const { entregavel, esperada } = await this.contexto(m, contratoId, entregavelId, esperadaId);
      this.exigirRegularizacao(contrato,entregavel);
      this.validarPlanejamentoAtivo(entregavel, esperada);
      await this.etapaAtiva(m, entregavel);
      // Checklist documental 100% não é, por si só, conclusão física do entregável.
      // Bloqueie apenas se a decisão de conclusão operacional realmente estiver vigente.
      if (!entregavel.reabertoEm && ['CONCLUIDO','FINALIZADO'].includes(entregavel.statusExecucao ?? ''))
        throw new ConflictException('Reabra o entregável concluído antes de reabrir suas evidências');
      const repo = m.getRepository(ComprovanteEvidencia);
      const ultima = await repo.createQueryBuilder('c').setLock('pessimistic_write')
        .where('c.evidenciaEsperadaId = :esperadaId', { esperadaId })
        .orderBy('c.criadoEm', 'DESC').addOrderBy('c.id', 'DESC').getOne();
      if (!ultima || ultima.status !== 'VERIFICADA' || ultima.contratoId !== contratoId || ultima.entregavelId !== entregavelId)
        throw new ConflictException('Somente uma evidência verificada pode ser reaberta');
      await this.protegerDecisoesDeOcorrencia(m,contratoId,ultima.id,true);
      if(ultima.origemQuantidade==='NOVA_EXECUCAO'&&milesimos(ultima.quantidadeAprovada)>0n)await protegerReferenciaManual(m,contratoId,ultima.id,'QUANTIDADE','evidencia');
      const parcela = entregavel.execucoesIntegradas ? await m.findOneBy(ExecucaoLancamento,{contratoId,entregavelId,origem:"EVIDENCIA",origemId:ultima.id}) : null;
      if (parcela) {
        if(parcela&&!parcela.referenciaId&&parcela.centesimos>0){
          if(entregavel.statusExecucao==='CONCLUIDO_PARCIALMENTE')throw new ConflictException('Reabra a execução física antes de invalidar esta contribuição.');
          await protegerReferenciaManual(m,contratoId,parcela.id,'PERCENTUAL');
        }
      }
      if (entregavel.statusExecucao==='CONCLUIDO_PARCIALMENTE' && ultima.origemQuantidade==='NOVA_EXECUCAO') throw new ConflictException('Reabra a execução física antes de invalidar esta contribuição.');
      const verificadoPor = ultima.verificadoPor;
      const verificadoEm = ultima.verificadoEm;
      ultima.status = 'PENDENTE_VERIFICACAO'; ultima.verificadoPor = null; ultima.verificadoEm = null;
      const quantidadeAprovadaAnterior = ultima.quantidadeAprovada ?? null;
      ultima.quantidadeAprovada = null;
      esperada.reabertoEm = new Date();
      await m.getRepository(EvidenciaEsperada).save(esperada);
      await repo.save(ultima);
      if (entregavel.execucoesIntegradas) await m.update(ExecucaoLancamento,{contratoId,entregavelId,origem:'EVIDENCIA',origemId:ultima.id},{centesimosAprovados:null,decididoPor:null,decididoEm:null});
      await validarSaldoParcelas(m,entregavel);
      await this.auditoria.registrarNaTransacao(m, ator, {
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_REABERTO,
        entidadeTipo: 'ENTREGAVEL', entidadeId: entregavelId,
        dadosAnteriores: { comprovanteId: ultima.id, evidenciaEsperadaId: esperadaId, status: 'VERIFICADA', verificadoPor, verificadoEm, quantidadeAprovada: quantidadeAprovadaAnterior, parcelaExecucao: parcela?snapshotParcela(parcela):null },
        dadosPosteriores: { comprovanteId: ultima.id, evidenciaEsperadaId: esperadaId, status: ultima.status, quantidadeAprovada: null, ...(motivo ? { justificativa: motivo } : {}) },
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
