import { dataEfetivaValida } from '../common/data-civil.js';
import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { avaliarMetasMarco, projetarMeta } from './metas-marco-gate.js';
import { listarExecucoesMeta } from './execucao-manual-meta.js';
import { iniciarHierarquiaOperacional } from '../execucao/inicio-operacional.js';
import type { CriarLancamentoDto, CorrigirLancamentoDto, DecidirLancamentoDto } from '../execucao/lancamentos.dto.js';
import { milesimos, quantidadeDecimal } from '../common/quantidade-exata.js';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { MetaMarco, VinculoMetaMarco, type TipoRegistroMeta, type EstadoMetaMarco } from './meta-marco.entity.js';
import type { CriarMetaMarcoDto, EditarMetaMarcoDto, AcaoMeta } from './metas-marco.dto.js';

type Operacao = 'metas-marco:corrigir-manual' | 'metas-marco:registrar-manual' | 'metas-marco:decidir-manual' | 'metas-marco:listar' | 'metas-marco:criar' | 'metas-marco:editar' | 'metas-marco:vincular' | 'metas-marco:decidir' | 'metas-marco:solicitar' | 'metas-marco:reabrir' | 'metas-marco:arquivar' | 'metas-marco:reativar';
const campos = (d: CriarMetaMarcoDto) => ({
  tipo:d.tipo,titulo:d.titulo.trim(),pesoCentesimos:d.pesoCentesimos,criterioConclusao:d.criterioConclusao.trim(),
  quantidadePrevista:d.quantidadePrevista??null,unidadeMedida:d.unidadeMedida?.trim()||null,provasExigidas:d.provasExigidas,
  dataPrevista:d.dataPrevista||null,inicioPrevisto:d.inicioPrevisto||null,terminoPrevisto:d.terminoPrevisto||null,observacoes:d.observacoes?.trim()||null,
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
    alterar = false, regularizar = false): Promise<Entregavel> {
    let contratoParcial=false;
    if (alterar) {
      const c = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
      if (!c || c.arquivadoEm || c.conclusaoSolicitadaEm || c.encerramentoSolicitado || !(FASES_OPERACIONAIS_CONTRATO.includes(c.status)||regularizar&&c.status==='CONCLUIDO_PARCIALMENTE'))
        throw new ConflictException('Contrato indisponível para alterar metas do Marco');
      contratoParcial=c.status==='CONCLUIDO_PARCIALMENTE';
    }
    const e = await m.findOne(Entregavel, { where: { id: entregavelId, contratoId },
      ...(alterar ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!e || (alterar && e.arquivadoEm) || e.tipo !== 'MARCO') throw new NotFoundException('Marco indisponível');
    if (alterar) {
      const etapa = await m.findOneBy(Etapa,{ id:e.etapaId, contratoId });
      if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm || (['CONCLUIDA','ENCERRADA','FINALIZADA'].includes(etapa.status)||etapa.status==='CONCLUIDO_PARCIALMENTE'&&!regularizar))
        throw new ConflictException('Etapa indisponível para alterar metas do Marco');
      if((contratoParcial||etapa.status==='CONCLUIDO_PARCIALMENTE')&&e.statusExecucao!=='CONCLUIDO_PARCIALMENTE')throw new ConflictException('Somente a regularização do Marco parcialmente concluído é permitida.');
    }
    if (alterar && (e.regularizacaoDocumentalSolicitada || ['CONCLUIDO', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_CONCLUSAO_PARCIAL', 'PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '') || e.statusExecucao==='CONCLUIDO_PARCIALMENTE'&&!regularizar))
      throw new ConflictException('Reabra o Marco ou devolva a solicitação antes de alterar suas metas');
    return e;
  }
  private async meta(m: EntityManager, contratoId: string, entregavelId: string, metaId: string,
    alterar = false, incluirArquivada = false): Promise<MetaMarco> {
    const meta = await m.findOne(MetaMarco, { where: { id: metaId, contratoId, entregavelId, ...(incluirArquivada?{}:{arquivadoEm:IsNull()}) },
      ...(alterar ? { lock: { mode: 'pessimistic_write' as const } } : {}) });
    if (!meta) throw new NotFoundException('Meta não encontrada neste Marco');
    return meta;
  }
  private validar(meta:MetaMarco, e:Entregavel){
    if(!meta.titulo||!meta.criterioConclusao)throw new BadRequestException('Informe nome e critério de conclusão.');
    if(!Number.isInteger(meta.pesoCentesimos)||meta.pesoCentesimos<1||meta.pesoCentesimos>10000)throw new BadRequestException('Peso inválido.');
    if(meta.tipo==='QUANTITATIVA'&&(!meta.unidadeMedida||!meta.quantidadePrevista||milesimos(meta.quantidadePrevista)<=0n))throw new BadRequestException('Informe unidade e meta prevista positiva.');
    if(meta.tipo==='DESCRITIVA'&&(meta.quantidadePrevista!==null||meta.unidadeMedida!==null))throw new BadRequestException('Meta descritiva não possui quantidade ou unidade.');
    if(meta.inicioPrevisto&&meta.terminoPrevisto&&meta.inicioPrevisto>meta.terminoPrevisto||meta.dataPrevista&&(meta.inicioPrevisto||meta.terminoPrevisto))throw new BadRequestException('Datas da meta inválidas.');
    for(const d of [meta.dataPrevista,meta.inicioPrevisto,meta.terminoPrevisto])if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||e.inicioPrevisto&&d<e.inicioPrevisto||e.terminoPrevisto&&d>e.terminoPrevisto))throw new BadRequestException('A data da meta deve estar na vigência do Marco.');
  }
  private async validarPeso(m:EntityManager, meta:MetaMarco){
    const metas=await m.find(MetaMarco,{where:{contratoId:meta.contratoId,entregavelId:meta.entregavelId,arquivadoEm:IsNull()}});
    if(metas.filter(x=>x.id!==meta.id).reduce((n,x)=>n+x.pesoCentesimos,0)+meta.pesoCentesimos>10000)throw new ConflictException('A soma dos pesos não pode ultrapassar 100%.');
  }
  private async auditar(m:EntityManager,ator:UsuarioAutenticado,meta:MetaMarco,acao:AcaoAuditoria,antes:object|null,depois:object){
    await this.auditoria.registrarNaTransacao(m,ator,{acao,entidadeTipo:'ENTREGAVEL',entidadeId:meta.entregavelId,...(antes?{dadosAnteriores:{metaId:meta.id,...antes}}:{}),dadosPosteriores:{metaId:meta.id,...depois}});
  }
  async listar(c:string,e:string,ator:UsuarioAutenticado){
    await this.autorizar(ator,c,'metas-marco:listar');
    return this.ds.transaction('REPEATABLE READ',async m=>{const entregavel=await this.entregar(m,c,e);const r=await avaliarMetasMarco(m,c,e);const todas=await m.find(MetaMarco,{where:{contratoId:c,entregavelId:e}});const arquivadas=await Promise.all(todas.filter(x=>x.arquivadoEm).map(x=>projetarMeta(m,x)));return {...r,entregavelId:e,aptoPelasMetas:r.apto,execucaoFisica:['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(entregavel.statusExecucao??'')&&dataEfetivaValida(entregavel.dataEfetivaMarco)?100:0,arquivadas};});
  }
  async criar(c:string,e:string,dto:CriarMetaMarcoDto,ator:UsuarioAutenticado){
    await this.autorizar(ator,c,'metas-marco:criar');
    return this.ds.transaction(async m=>{await exigirPermissaoTransacional(m,c,ator,'criarMetasMarco');const entregavel=await this.entregar(m,c,e,true);const meta=m.create(MetaMarco,{...campos(dto),contratoId:c,entregavelId:e,criadoPor:ator.id,estado:'ABERTA'});this.validar(meta,entregavel);await this.validarPeso(m,meta);const salvo=await m.save(MetaMarco,meta);await this.auditar(m,ator,salvo,AcaoAuditoria.META_MARCO_CRIADA,null,campos(dto));return projetarMeta(m,salvo);});
  }
  async editar(c:string,e:string,id:string,dto:EditarMetaMarcoDto,ator:UsuarioAutenticado){
    await this.autorizar(ator,c,'metas-marco:editar');
    return this.ds.transaction(async m=>{await exigirPermissaoTransacional(m,c,ator,'editarMetasMarco');const entregavel=await this.entregar(m,c,e,true);const meta=await this.meta(m,c,e,id,true);if(meta.estado!=='ABERTA')throw new ConflictException('Reabra a meta para editar.');const antes={...meta};const ativos=await m.count(VinculoMetaMarco,{where:{metaId:id,contratoId:c,status:'APROVADO'}});const origem=await m.count(Ocorrencia,{where:{metaMarcoOrigemId:id,contratoId:c}});const manuais=await listarExecucoesMeta(m,meta);if((ativos||origem||manuais.length)&&(dto.tipo!==meta.tipo||dto.unidadeMedida?.trim()!==(meta.unidadeMedida??undefined)&&!(dto.unidadeMedida==null&&meta.unidadeMedida==null)||milesimos(dto.quantidadePrevista)!==milesimos(meta.quantidadePrevista)||dto.provasExigidas<meta.provasExigidas))throw new ConflictException('Não altere tipo, unidade, quantidade ou reduza comprovação após vincular registros.');Object.assign(meta,campos(dto));this.validar(meta,entregavel);await this.validarPeso(m,meta);const salvo=await m.save(MetaMarco,meta);await this.auditar(m,ator,salvo,AcaoAuditoria.META_MARCO_EDITADA,antes,campos(dto));return projetarMeta(m,salvo);});
  }
  private async listarCandidatos(m:EntityManager,meta:MetaMarco,tipo:TipoRegistroMeta):Promise<{id:string;titulo:string}[]>{
    if(tipo==='OCORRENCIA')return m.query(`SELECT o.id,o.titulo FROM ocorrencias o JOIN entregaveis e ON e.id=o.entregavel_id AND e.contrato_id=o.contrato_id WHERE o.contrato_id=$1 AND o.entregavel_id=$2 AND o.substituida_em IS NULL AND e.arquivado_em IS NULL ORDER BY o.titulo,o.id`,[meta.contratoId,meta.entregavelId]);
    if(tipo==='ATIVIDADE')return m.query(`SELECT a.id,a.titulo FROM atividades a WHERE a."contratoId"=$1 AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA' AND EXISTS (SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=a.id AND ae."entregavelId"=$2) ORDER BY a.titulo,a.id`,[meta.contratoId,meta.entregavelId]);
    return m.query(`SELECT ev.id,ev.tipo_evidencia AS titulo FROM evidencias_esperadas ev JOIN entregaveis e ON e.id=ev.entregavel_id WHERE e.contrato_id=$1 AND ev.entregavel_id=$2 AND ev.arquivado_em IS NULL AND e.arquivado_em IS NULL ORDER BY ev.tipo_evidencia,ev.id`,[meta.contratoId,meta.entregavelId]);
  }
  async candidatos(c:string,e:string,id:string,tipo:TipoRegistroMeta,ator:UsuarioAutenticado){
    await this.autorizar(ator,c,'metas-marco:listar');
    if(!['OCORRENCIA','ATIVIDADE','EVIDENCIA'].includes(tipo))throw new BadRequestException('Categoria inválida.');
    return this.ds.transaction('REPEATABLE READ',async m=>{await this.entregar(m,c,e);const meta=await this.meta(m,c,e,id);const vinculados=await m.find(VinculoMetaMarco,{where:{metaId:id,contratoId:c,status:'APROVADO'}});return (await this.listarCandidatos(m,meta,tipo)).filter(x=>!vinculados.some(v=>v.ocorrenciaId===x.id||v.atividadeId===x.id||v.evidenciaEsperadaId===x.id));});
  }
  async vincular(c:string,e:string,id:string,tipo:TipoRegistroMeta,registroId:string,ator:UsuarioAutenticado){
    await this.autorizar(ator,c,'metas-marco:vincular');
    return this.ds.transaction(async m=>{await exigirPermissaoTransacional(m,c,ator,'vincularMetasMarco');const marco=await this.entregar(m,c,e,true,tipo==='EVIDENCIA');const meta=await this.meta(m,c,e,id,true);if(marco.statusExecucao==='CONCLUIDO_PARCIALMENTE'&&meta.estado!=='CONCLUIDA_PARCIALMENTE'||meta.estado!=='ABERTA'&&!(meta.estado==='CONCLUIDA_PARCIALMENTE'&&tipo==='EVIDENCIA'))throw new ConflictException('Meta bloqueada.');
      if(!['OCORRENCIA','ATIVIDADE','EVIDENCIA'].includes(tipo))throw new BadRequestException('Categoria inválida.');
      if(!(await this.listarCandidatos(m,meta,tipo)).some(x=>x.id===registroId))throw new NotFoundException('O registro precisa pertencer a este entregável Marco.');
      const existentes=await m.find(VinculoMetaMarco,{where:{metaId:id,contratoId:c,status:'APROVADO'}});if(existentes.some(v=>v.ocorrenciaId===registroId||v.atividadeId===registroId||v.evidenciaEsperadaId===registroId))return projetarMeta(m,meta);
      if(tipo==='OCORRENCIA'&&meta.tipo==='QUANTITATIVA'){const [duplicada]=await m.query(`SELECT 1 FROM vinculos_metas_marco v JOIN metas_marco mm ON mm.id=v.meta_id WHERE mm.entregavel_id=$1 AND mm.tipo='QUANTITATIVA' AND mm.arquivado_em IS NULL AND v.status='APROVADO' AND v.ocorrencia_id=$2 AND mm.id<>$3`,[e,registroId,id]);if(duplicada)throw new ConflictException('A medição desta ocorrência já está vinculada a outra meta quantitativa do Marco.');}
      const alvo=tipo==='OCORRENCIA'?{ocorrenciaId:registroId}:tipo==='ATIVIDADE'?{atividadeId:registroId}:{evidenciaEsperadaId:registroId};const v=await m.save(VinculoMetaMarco,m.create(VinculoMetaMarco,{metaId:id,contratoId:c,...alvo,status:'APROVADO',solicitadoPor:ator.id}));await this.auditar(m,ator,meta,AcaoAuditoria.META_MARCO_VINCULO_SOLICITADO,null,{vinculoId:v.id,tipo,registroId});return projetarMeta(m,meta);});
  }
  async desvincular(c:string,e:string,id:string,vinculoId:string,ator:UsuarioAutenticado){
    await this.autorizar(ator,c,'metas-marco:vincular');return this.ds.transaction(async m=>{await exigirPermissaoTransacional(m,c,ator,'vincularMetasMarco');await this.entregar(m,c,e,true);const meta=await this.meta(m,c,e,id,true);if(meta.estado!=='ABERTA')throw new ConflictException('Reabra a meta para desvincular.');const r=await projetarMeta(m,meta);const atual=r.vinculos.find(v=>v.id===vinculoId);if(!atual||!atual.direto)throw new NotFoundException('Vínculo indisponível.');if(!atual.desvinculavel)throw new ConflictException('Reabra o registro antes de desvincular.');const v=await m.findOneByOrFail(VinculoMetaMarco,{id:vinculoId,metaId:id,contratoId:c,status:'APROVADO'});v.status='REJEITADO';v.decididoPor=ator.id;v.decididoEm=new Date();await m.save(v);await this.auditar(m,ator,meta,AcaoAuditoria.META_MARCO_VINCULO_DECIDIDO,{vinculoId,status:'APROVADO'},{vinculoId,status:'REJEITADO'});return projetarMeta(m,meta);});
  }
  /** Lançamento direto, identificado pela meta, não por uma ocorrência fictícia. */
  async executarManual(c:string,e:string,id:string,acao:'criar'|'corrigir'|'decidir',ator:UsuarioAutenticado,dto:CriarLancamentoDto|CorrigirLancamentoDto|DecidirLancamentoDto,lid?:string){
    const permissao=acao==='decidir'?'aprovarExecucaoManual':acao==='corrigir'?'corrigirExecucaoOcorrencia':'registrarExecucaoOcorrencia';
    await this.autorizar(ator,c,acao==='decidir'?'metas-marco:decidir-manual':acao==='corrigir'?'metas-marco:corrigir-manual':'metas-marco:registrar-manual');
    return this.ds.transaction(async m=>{
      await exigirPermissaoTransacional(m,c,ator,permissao);
      const marco=await this.entregar(m,c,e,true),meta=await this.meta(m,c,e,id,true);
      if(meta.tipo!=='QUANTITATIVA'||meta.estado!=='ABERTA')throw new ConflictException('Somente metas quantitativas abertas recebem lançamentos manuais.');
      const registros=await listarExecucoesMeta(m,meta);
      const r=registros.find(x=>x.id===(acao==='criar'?(dto as CriarLancamentoDto).id:lid));
      const projetado=await projetarMeta(m,meta);
      const validarSaldo=(valor:bigint,anterior:bigint=0n)=>{if(milesimos(projetado.quantidadeComprometida)-anterior+valor>milesimos(meta.quantidadePrevista))throw new ConflictException('Quantidade acima do saldo disponível da meta.');};
      const dados=(d:CriarLancamentoDto|CorrigirLancamentoDto)=>{
        if(!/^\d{1,15}(?:\.\d{1,3})?$/.test(d.valor)||milesimos(d.valor)<=0n)throw new BadRequestException('Informe quantidade positiva com até três casas decimais.');
        if(!dataEfetivaValida(d.data)||marco.inicioPrevisto&&d.data<marco.inicioPrevisto||marco.terminoPrevisto&&d.data>marco.terminoPrevisto)throw new BadRequestException('Informe data de execução válida dentro da vigência do Marco.');
        return {valor:quantidadeDecimal(milesimos(d.valor)),data:d.data,observacao:d.observacao?.trim()||null};
      };
      let registroId=lid;
      if(acao==='criar'){
        const d=dto as CriarLancamentoDto; if(d.ocorrenciaId)throw new BadRequestException('O lançamento direto não recebe ocorrência.');
        const p=dados(d);registroId=d.id;
        if(r){if(r.autorId===ator.id&&r.pedidoOriginal.valor===p.valor&&r.pedidoOriginal.data===p.data&&r.pedidoOriginal.observacao===p.observacao)return projetado;throw new ConflictException('Identificador de lançamento já utilizado.');}
        validarSaldo(milesimos(p.valor));
        await m.query(`INSERT INTO execucoes_metas_marco(id,meta_id,contrato_id,quantidade,data_execucao,observacao,autor_id,pedido_original) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[d.id,id,c,p.valor,p.data,p.observacao,ator.id,JSON.stringify(p)]);
      }else{
        if(!r)throw new NotFoundException('Lançamento não encontrado nesta meta.');
        const d=dto as CorrigirLancamentoDto|DecidirLancamentoDto;
        if(!d.versaoEsperada||d.versaoEsperada!==r.versao)throw new ConflictException('O lançamento mudou. Atualize os dados.');
        if(acao==='corrigir'){
          const corrigir=d as CorrigirLancamentoDto,p=dados(corrigir);
          if(corrigir.motivo.trim().length<15)throw new BadRequestException('Informe uma justificativa de pelo menos 15 caracteres.');
          if(r.status==='APROVADO')await exigirPermissaoTransacional(m,c,ator,'corrigirExecucaoAprovada');
          validarSaldo(milesimos(p.valor),r.status==='REJEITADO'?0n:milesimos(r.quantidade));
          await m.query(`UPDATE execucoes_metas_marco SET quantidade=$4,data_execucao=$5,observacao=$6,status='PENDENTE',decidido_por=NULL,decidido_em=NULL,motivo=$7 WHERE id=$1 AND meta_id=$2 AND contrato_id=$3`,[lid,id,c,p.valor,p.data,p.observacao,corrigir.motivo.trim()]);
        }else{
          const decidir=d as DecidirLancamentoDto;
          if(r.status!=='PENDENTE')throw new ConflictException('O lançamento não está pendente.');
          if(decidir.decisao==='REJEITADO'&&!decidir.motivo?.trim())throw new BadRequestException('Informe o motivo da rejeição.');
          if(decidir.decisao==='APROVADO')validarSaldo(milesimos(r.quantidade),milesimos(r.quantidade));
          await m.query(`UPDATE execucoes_metas_marco SET status=$4,decidido_por=$5,decidido_em=now(),motivo=$6 WHERE id=$1 AND meta_id=$2 AND contrato_id=$3`,[lid,id,c,decidir.decisao,ator.id,decidir.motivo?.trim()||null]);
          if(decidir.decisao==='APROVADO')await iniciarHierarquiaOperacional(m,this.auditoria,ator,c,e);
        }
      }
      const resultado=await projetarMeta(m,meta);
      await this.auditar(m,ator,meta,AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA,r??null,{operacao:`MANUAL_META_${acao.toUpperCase()}`,registro:resultado.registrosManuais.find(x=>x.id===registroId)});
      return resultado;
    });
  }
  async transicionar(c:string,e:string,id:string,acao:AcaoMeta,justificativa:string|undefined,ator:UsuarioAutenticado){
    const operacao = acao==='reabrir'?'reabrir':acao==='arquivar'?'arquivar':acao==='reativar'?'reativar':['aprovar','devolver'].includes(acao)?'decidir':'solicitar';
    const permissao = operacao==='reabrir'?'reabrirMetasMarco':operacao==='arquivar'?'arquivarMetasMarco':operacao==='reativar'?'reativarMetasMarco':operacao==='decidir'?'aprovarVinculosMetasMarco':'solicitarMetasMarco';
    await this.autorizar(ator,c,`metas-marco:${operacao}`);
    return this.ds.transaction(async m=>{await exigirPermissaoTransacional(m,c,ator,permissao);const marco=await this.entregar(m,c,e,true,['solicitar-regularizacao','aprovar','devolver'].includes(acao));const meta=await this.meta(m,c,e,id,true,acao==='reativar');if(marco.statusExecucao==='CONCLUIDO_PARCIALMENTE'&&!(acao==='solicitar-regularizacao'&&meta.estado==='CONCLUIDA_PARCIALMENTE'||['aprovar','devolver'].includes(acao)&&meta.estado==='PENDENTE_REGULARIZACAO'))throw new ConflictException('Somente regularização documental é permitida.');const r=await projetarMeta(m,meta);const antes={estado:meta.estado,arquivadoEm:meta.arquivadoEm,justificativa:meta.justificativaEstado};const motivo=justificativa?.trim()??'';let novo:EstadoMetaMarco=meta.estado;
      const exigir=(ok:boolean,msg:string)=>{if(!ok)throw new ConflictException(msg);};
      if(['solicitar-conclusao','solicitar-conclusao-parcial','solicitar-encerramento','devolver','reabrir'].includes(acao)&&motivo.length<15)throw new BadRequestException('Informe uma justificativa de pelo menos 15 caracteres.');
      if(acao==='solicitar-conclusao'){exigir(meta.estado==='ABERTA'&&r.podeIntegral,'Objetivo ou comprovação ainda incompletos.');novo='PENDENTE_CONCLUSAO';}
      else if(acao==='solicitar-conclusao-parcial'){exigir(meta.estado==='ABERTA'&&r.podeParcial,'Conclusão parcial exige execução completa e pendência documental.');novo='PENDENTE_CONCLUSAO_PARCIAL';}
      else if(acao==='solicitar-encerramento'){exigir(meta.estado==='ABERTA','Meta indisponível para encerramento.');novo='PENDENTE_ENCERRAMENTO';}
      else if(acao==='solicitar-regularizacao'){exigir(meta.estado==='CONCLUIDA_PARCIALMENTE'&&r.podeIntegral,'Regularize a documentação antes de solicitar.');novo='PENDENTE_REGULARIZACAO';}
      else if(acao==='aprovar'){exigir(meta.estado.startsWith('PENDENTE_'),'Não há solicitação pendente.');if(meta.estado==='PENDENTE_ENCERRAMENTO')novo='ENCERRADA';else if(meta.estado==='PENDENTE_CONCLUSAO_PARCIAL'){exigir(r.podeParcial,'A elegibilidade mudou. Devolva para revisão.');novo='CONCLUIDA_PARCIALMENTE';}else{exigir(r.podeIntegral,'A elegibilidade mudou. Devolva para revisão.');novo='CONCLUIDA';}}
      else if(acao==='devolver'){exigir(meta.estado.startsWith('PENDENTE_'),'Não há solicitação pendente.');novo=meta.estado==='PENDENTE_REGULARIZACAO'?'CONCLUIDA_PARCIALMENTE':'ABERTA';}
      else if(acao==='reabrir'){exigir(['CONCLUIDA','CONCLUIDA_PARCIALMENTE','ENCERRADA'].includes(meta.estado),'Meta não está fechada.');novo='ABERTA';}
      else if(acao==='arquivar'){exigir(['CONCLUIDA','CONCLUIDA_PARCIALMENTE','ENCERRADA'].includes(meta.estado),'Feche a meta antes de arquivar.');meta.arquivadoEm=new Date();}
      else if(acao==='reativar'){exigir(Boolean(meta.arquivadoEm),'Meta não arquivada.');await this.validarPeso(m,meta);if(meta.tipo==='QUANTITATIVA'){const [duplicada]=await m.query(`SELECT 1 FROM vinculos_metas_marco a JOIN vinculos_metas_marco b ON b.ocorrencia_id=a.ocorrencia_id AND b.contrato_id=a.contrato_id JOIN metas_marco mm ON mm.id=b.meta_id WHERE a.meta_id=$1 AND a.status='APROVADO' AND b.status='APROVADO' AND b.meta_id<>$1 AND mm.tipo='QUANTITATIVA' AND mm.entregavel_id=$2 AND mm.arquivado_em IS NULL LIMIT 1`,[id,e]);if(duplicada)throw new ConflictException('Outra meta ativa utiliza uma das medições desta meta.');}meta.arquivadoEm=null;}
      meta.estado=novo;if(motivo)meta.justificativaEstado=motivo;const salvo=await m.save(MetaMarco,meta);await this.auditar(m,ator,salvo,AcaoAuditoria.META_MARCO_EDITADA,antes,{acao,estado:novo,arquivadoEm:meta.arquivadoEm,justificativa:motivo});return projetarMeta(m,salvo);});
  }
}
