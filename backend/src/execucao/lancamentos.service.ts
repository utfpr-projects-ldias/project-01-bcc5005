import { pedidoManual, mesmoPedido } from './pedido-manual.js';
import { FASES_OPERACIONAIS_CONTRATO } from '../contratos/fases-operacionais.js';
import { exigirPermissaoTransacional } from '../autorizacao/permissao-transacional.js';
import { reconhecerExecucaoOcorrencia } from '../ocorrencias/reconhecer-execucao-ocorrencia.js';
import { protegerReferenciaManual } from './proteger-referencia-execucao.js';
import { iniciarHierarquiaOperacional } from './inicio-operacional.js';
import { criarManualDireta, editarManualDireta, decidirManualDireta, consultarManualDireta, validarReenvioManualDireta } from './quantidade-manual-direta.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { ExecucaoLancamento } from './execucao-lancamento.entity.js';
import { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { listarContribuicoesQuantitativas, listarExecucoesQuantitativas, listarQuantidadeDireta, listarReferenciasDiretas } from '../entregaveis/quantidade-evidencias.js';
import { medicaoAprovadaAtual, medicaoReconhecidaAtual, resumoMedicao } from '../ocorrencias/medicao-ocorrencia.js';
import { hojeCivil } from '../common/data-civil.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { centesimos, criarParcela, aceitaParcelas, exigirOcorrenciaParcela, resumoParcelas, validarSaldoParcelas } from './parcelas-execucao.js';
import type { CriarLancamentoDto, CorrigirLancamentoDto, DecidirLancamentoDto } from './lancamentos.dto.js';

@Injectable()
export class LancamentosService {
  constructor(private readonly ds:DataSource,private readonly auditoria:AuditoriaService){}
  private async contexto(m:EntityManager,c:string,id:string,mutacao=false,validarEstado=mutacao) {
    const contrato=await m.findOne(Contrato,{where:{id:c},...(mutacao?{lock:{mode:'pessimistic_write' as const}}:{})});
    const e=await m.findOne(Entregavel,{where:{id,contratoId:c},...(mutacao?{lock:{mode:'pessimistic_write' as const}}:{})});
    if(!contrato||!e)throw new NotFoundException('Entregável não encontrado.');
    if(validarEstado){
      const etapa=await m.findOneBy(Etapa,{id:e.etapaId,contratoId:c});
      if((!aceitaParcelas(e.tipo)&&e.tipo!=='QUANTITATIVO')||contrato.arquivadoEm||contrato.conclusaoSolicitadaEm||contrato.encerramentoSolicitado||!FASES_OPERACIONAIS_CONTRATO.includes(contrato.status)||e.arquivadoEm||!etapa||etapa.arquivadoEm||etapa.conclusaoSolicitadaEm||etapa.encerramentoSolicitadoEm||['ENCERRADA','CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADA'].includes(etapa.status)||['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??''))throw new ConflictException('O contexto não permite alterar parcelas de execução.');
    }
    return e;
  }
  private validarData(data:string){const d=new Date(`${data}T00:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==data||data>hojeCivil())throw new BadRequestException('Informe uma data de execução válida e não futura.');}
  private auditar(m:EntityManager,ator:UsuarioAutenticado,e:Entregavel,antes:ExecucaoLancamento|null,depois:ExecucaoLancamento,operacao:string,motivo?:string){return this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA,entidadeTipo:'ENTREGAVEL',entidadeId:e.id,dadosAnteriores:antes?{...antes}:undefined,dadosPosteriores:{...depois,operacao,motivo}});}
  consultar(c:string,id:string){return this.ds.transaction('REPEATABLE READ',async m=>{
    const e=await this.contexto(m,c,id);const resumo=await resumoParcelas(m,e);
    const ocorrencias=await m.find(Ocorrencia,{where:{contratoId:c,entregavelId:id},order:{dataPrevista:'DESC'}});
    const ids=ocorrencias.filter(o=>o.modoRegistro==='QUANTITATIVO').map(o=>o.id);
    const idsAtuais=ocorrencias.filter(o=>o.modoRegistro==='QUANTITATIVO'&&!o.substituidaEm).map(o=>o.id);
    const ativas=new Set(ocorrencias.filter(o=>!o.substituidaEm).map(o=>o.id));
    const [quantitativas,referenciasQuantitativas]=await Promise.all([listarContribuicoesQuantitativas(m,c,ids),listarExecucoesQuantitativas(m,c,idsAtuais)]);
    const detalhadas=quantitativas.map((l:{origem:string;id:string;ocorrenciaId:string;situacao:string;referenciaExecucao:string|null;situacaoRegistro?:string})=>({...l,situacao:ativas.has(l.ocorrenciaId)?l.situacao:'INATIVO',situacaoRegistro:ativas.has(l.ocorrenciaId)||['ARQUIVADO','EXCLUIDO'].includes(l.situacaoRegistro??'')?l.situacaoRegistro:'SUBSTITUIDO',contabilizada:referenciasQuantitativas.some(f=>f.ocorrenciaId===l.ocorrenciaId&&f.referencia===`${l.origem.toLowerCase()}:${l.id}`)}));
    const diretas=await listarQuantidadeDireta(m,e);
    const versoes=await m.query(`SELECT id,xmin::text AS versao FROM execucoes_entregavel WHERE contrato_id=$1 AND entregavel_id=$2 AND origem='MANUAL'`,[c,id]) as {id:string;versao:string}[];
    const versaoPorId=new Map(versoes.map(v=>[v.id,v.versao]));
    return {...resumo,itens:resumo.itens.map(i=>({...i,versao:versaoPorId.get(i.id)})),quantitativas:[...detalhadas,...diretas.map((l:{situacao:string;referenciaExecucao?:string|null})=>({...l,contabilizada:l.situacao==='APROVADO'&&!l.referenciaExecucao}))],referenciasQuantitativas:[...referenciasQuantitativas,...await listarReferenciasDiretas(m,e)],ocorrencias:await Promise.all(ocorrencias.map(async o=>({id:o.id,titulo:o.titulo,data:o.dataRealizada??o.dataPrevista,dataRealizada:o.dataRealizada,status:o.status,pesoPeriodo:o.pesoPeriodo,substituidaEm:o.substituidaEm,metaQuantidade:o.metaQuantidade,modoRegistro:o.modoRegistro,...await medicaoAprovadaAtual(m,o),quantidade:await medicaoReconhecidaAtual(m,o),percentual:o.execucoesPercentuais?(await resumoMedicao(m,o)).progressoPercentual:null})))};
  });}
  criar(c:string,id:string,dto:CriarLancamentoDto,ator:UsuarioAutenticado){return this.ds.transaction(async m=>{
    await exigirPermissaoTransacional(m,c,ator,'editarExecucaoFisica');
    // Serializa a leitura do pedido original antes dos gates de contexto mutável.
    const e=await this.contexto(m,c,id,true,false);this.validarData(dto.data);
    if(e.tipo==='QUANTITATIVO'){
      const anterior=await consultarManualDireta(m,e,dto.id);
      if(anterior)return validarReenvioManualDireta(anterior,dto,ator);
      await this.contexto(m,c,id,true);
      const {registro}=await criarManualDireta(m,e,dto,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA,entidadeTipo:'ENTREGAVEL',entidadeId:e.id,dadosPosteriores:{...registro,operacao:'CADASTRAR_QUANTIDADE_MANUAL'}});
      return registro;
    }
    const pedido=pedidoManual(dto,String(centesimos(dto.valor)));
    const anterior=await m.findOneBy(ExecucaoLancamento,{id:dto.id});
    if(anterior){
      const original=anterior.pedidoOriginal??{valor:String(anterior.centesimos),data:anterior.dataExecucao,observacao:anterior.observacao,ocorrenciaId:anterior.ocorrenciaId};
      if(anterior.contratoId===c&&anterior.entregavelId===id&&anterior.autorId===ator.id&&anterior.origem==='MANUAL'&&mesmoPedido(original,pedido))return anterior;
      throw new ConflictException('Identificador de lançamento já utilizado.');
    }
    await this.contexto(m,c,id,true);
    const l=await criarParcela(m,e,ator,{origem:'MANUAL',id:dto.id,ocorrenciaId:dto.ocorrenciaId,valor:dto.valor,data:dto.data,observacao:dto.observacao?.trim()||null,pedidoOriginal:pedido});
    await this.auditar(m,ator,e,null,l,'CADASTRAR_LANCAMENTO');return l;
  });}
  editar(c:string,id:string,lid:string,dto:CorrigirLancamentoDto,ator:UsuarioAutenticado){return this.ds.transaction(async m=>{
    await exigirPermissaoTransacional(m,c,ator,'editarExecucaoFisica');const e=await this.contexto(m,c,id,true);this.validarData(dto.data);
    if(e.tipo==='QUANTITATIVO'){
      const {anterior,registro}=await editarManualDireta(m,e,lid,dto,()=>exigirPermissaoTransacional(m,c,ator,'corrigirExecucaoAprovada'));
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA,entidadeTipo:'ENTREGAVEL',entidadeId:e.id,dadosAnteriores:anterior,dadosPosteriores:{...registro,operacao:'CORRIGIR_QUANTIDADE_MANUAL',motivo:dto.motivo.trim()}});return registro;
    }
    const l=await m.findOneBy(ExecucaoLancamento,{id:lid,contratoId:c,entregavelId:id,origem:'MANUAL'});if(!l)throw new NotFoundException('Lançamento não encontrado.');
    if(dto.versaoEsperada!==undefined){
      const [v]=await m.query('SELECT xmin::text AS versao FROM execucoes_entregavel WHERE id=$1 AND contrato_id=$2 AND entregavel_id=$3',[lid,c,id]);
      if(v?.versao!==dto.versaoEsperada)throw new ConflictException('O lançamento mudou. Atualize os dados antes de continuar.');
    }
    await exigirOcorrenciaParcela(m,e,l.ocorrenciaId);
    if(!dto.motivo || dto.motivo.trim().length<15)throw new BadRequestException('Informe a justificativa da correção (mínimo de 15 caracteres).');
    if(l.status==='APROVADO') {
      await exigirPermissaoTransacional(m,c,ator,'corrigirExecucaoAprovada');
      await protegerReferenciaManual(m,c,lid,'PERCENTUAL');
    }
    const antes={...l};l.centesimos=centesimos(dto.valor);l.dataExecucao=dto.data;l.observacao=dto.observacao?.trim()||null;l.status='PENDENTE';l.centesimosAprovados=null;l.decididoPor=null;l.decididoEm=null;
    await m.save(ExecucaoLancamento,l);await validarSaldoParcelas(m,e);await this.auditar(m,ator,e,antes,l,'CORRIGIR_LANCAMENTO',dto.motivo.trim());if(l.ocorrenciaId)await reconhecerExecucaoOcorrencia(m,this.auditoria,ator,e,l.ocorrenciaId);return l;
  });}
  decidir(c:string,id:string,lid:string,dto:DecidirLancamentoDto,ator:UsuarioAutenticado){return this.ds.transaction(async m=>{
    await exigirPermissaoTransacional(m,c,ator,'aprovarExecucaoManual');const e=await this.contexto(m,c,id,true);
    if(e.tipo==='QUANTITATIVO'){
      const {anterior,registro}=await decidirManualDireta(m,e,lid,dto,ator);
      await this.auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA,entidadeTipo:'ENTREGAVEL',entidadeId:e.id,dadosAnteriores:anterior,dadosPosteriores:{...registro,operacao:'DECIDIR_QUANTIDADE_MANUAL',motivo:dto.motivo?.trim()}});if(dto.decisao==='APROVADO')await iniciarHierarquiaOperacional(m,this.auditoria,ator,c,id);return registro;
    }
    const l=await m.findOneBy(ExecucaoLancamento,{id:lid,contratoId:c,entregavelId:id,origem:'MANUAL'});if(!l)throw new NotFoundException('Lançamento não encontrado.');
    if(dto.versaoEsperada!==undefined){
      const [v]=await m.query('SELECT xmin::text AS versao FROM execucoes_entregavel WHERE id=$1 AND contrato_id=$2 AND entregavel_id=$3',[lid,c,id]);
      if(v?.versao!==dto.versaoEsperada)throw new ConflictException('O lançamento mudou. Atualize os dados antes de continuar.');
    }
    await exigirOcorrenciaParcela(m,e,l.ocorrenciaId);
    if(l.status!=='PENDENTE'&&!(l.status==='REJEITADO'&&dto.decisao==='APROVADO'))throw new ConflictException('O lançamento não está pendente de aprovação.');
    if(dto.decisao==='REJEITADO'&&!dto.motivo?.trim())throw new BadRequestException('Informe a justificativa da rejeição.');
    const antes={...l};l.status=dto.decisao;l.centesimosAprovados=dto.decisao==='APROVADO'?l.centesimos:null;l.decididoPor=ator.id;l.decididoEm=new Date();
    await m.save(ExecucaoLancamento,l);await validarSaldoParcelas(m,e);await this.auditar(m,ator,e,antes,l,'DECIDIR_LANCAMENTO',dto.motivo?.trim());if(l.ocorrenciaId)await reconhecerExecucaoOcorrencia(m,this.auditoria,ator,e,l.ocorrenciaId);if(dto.decisao==='APROVADO')await iniciarHierarquiaOperacional(m,this.auditoria,ator,c,id);return l;
  });}
}
