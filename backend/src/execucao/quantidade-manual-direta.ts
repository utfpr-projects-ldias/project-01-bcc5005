import { protegerReferenciaManual } from './proteger-referencia-execucao.js';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Entregavel } from '../entregaveis/entregavel.entity.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { exigirSaldoQuantidadeDireta } from '../entregaveis/quantidade-evidencias.js';
import type { CriarLancamentoDto, CorrigirLancamentoDto, DecidirLancamentoDto } from './lancamentos.dto.js';

type Registro = { id:string; contrato_id:string; entregavel_id:string; quantidade:string; data_execucao:string; observacao:string|null; autor_id:string; status:string; decidido_por:string|null; decidido_em:Date|null };
const tabela = 'execucoes_quantitativas_diretas';
export function validarQuantidadeManual(valor:string) {
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(valor) || !(Number(valor)>0)) throw new BadRequestException('Informe uma quantidade positiva com até três casas decimais.');
}
async function contextoDireto(m:EntityManager,e:Entregavel) {
  if(e.tipo!=='QUANTITATIVO'||!e.unidadeMedida?.trim()||!(Number(e.quantidadePrevista)>0)||Number(e.quantidadeRealizada??0)!==0)
    throw new ConflictException('Quantidade direta exige meta, unidade e ausência de quantidade legada.');
  const ocorrencias=await m.query('SELECT 1 FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND substituida_em IS NULL LIMIT 1',[e.contratoId,e.id]);
  if(ocorrencias.length)throw new ConflictException('Registre a execução nas ocorrências existentes.');
}
export async function consultarManualDireta(m:EntityManager,e:Entregavel,id:string):Promise<Registro|undefined>{
  const [r]=await m.query(`SELECT *, data_execucao::text AS data_execucao FROM ${tabela} WHERE id=$1 AND contrato_id=$2 AND entregavel_id=$3`,[id,e.contratoId,e.id]);return r;
}
/** Chamado somente sob lock do contrato e entregável, com ACL e auditoria na mesma transação. */
export async function criarManualDireta(m:EntityManager,e:Entregavel,dto:CriarLancamentoDto,ator:UsuarioAutenticado) {
  if(dto.ocorrenciaId)throw new BadRequestException('O lançamento direto não recebe ocorrência.');
  validarQuantidadeManual(dto.valor);await contextoDireto(m,e);
  const anterior=await consultarManualDireta(m,e,dto.id);
  if(anterior){if(anterior.autor_id===ator.id&&Number(anterior.quantidade)===Number(dto.valor)&&anterior.data_execucao===dto.data&&anterior.observacao===(dto.observacao?.trim()||null))return {anterior,registro:anterior};throw new ConflictException('Identificador de lançamento já utilizado.');}
  try {
  await m.query(`INSERT INTO ${tabela}(id,contrato_id,entregavel_id,quantidade,data_execucao,observacao,autor_id) VALUES($1,$2,$3,$4,$5,$6,$7)`,[dto.id,e.contratoId,e.id,dto.valor,dto.data,dto.observacao?.trim()||null,ator.id]);
  } catch (erro) {
    if ((erro as {code?:string})?.code==='23505')throw new ConflictException('Identificador de lançamento já utilizado.');
    throw erro;
  }
  if(!e.quantidadeDiretaIntegrada){await m.query('UPDATE entregaveis SET quantidade_direta_integrada=true WHERE id=$1 AND contrato_id=$2',[e.id,e.contratoId]);e.quantidadeDiretaIntegrada=true;}
  await exigirSaldoQuantidadeDireta(m,e);const registro=await consultarManualDireta(m,e,dto.id);if(!registro)throw new NotFoundException('Lançamento não encontrado.');return {anterior:null,registro};
}
export async function editarManualDireta(m:EntityManager,e:Entregavel,id:string,dto:CorrigirLancamentoDto){
  validarQuantidadeManual(dto.valor);await contextoDireto(m,e);
  const anterior=await consultarManualDireta(m,e,id);if(!anterior)throw new NotFoundException('Lançamento não encontrado.');
  if(!dto.motivo||dto.motivo.trim().length<15)throw new BadRequestException('Informe a justificativa da correção (mínimo de 15 caracteres).');
  if (anterior.status==='APROVADO') await protegerReferenciaManual(m,e.contratoId,id,'QUANTIDADE');
  await m.query(`UPDATE ${tabela} SET quantidade=$4,data_execucao=$5,observacao=$6,status='PENDENTE',decidido_por=NULL,decidido_em=NULL WHERE id=$1 AND contrato_id=$2 AND entregavel_id=$3`,[id,e.contratoId,e.id,dto.valor,dto.data,dto.observacao?.trim()||null]);
  await exigirSaldoQuantidadeDireta(m,e);const registro=await consultarManualDireta(m,e,id);if(!registro)throw new NotFoundException('Lançamento não encontrado.');return {anterior,registro};
}
export async function decidirManualDireta(m:EntityManager,e:Entregavel,id:string,dto:DecidirLancamentoDto,ator:UsuarioAutenticado){
  await contextoDireto(m,e);const anterior=await consultarManualDireta(m,e,id);if(!anterior)throw new NotFoundException('Lançamento não encontrado.');
  if(anterior.status!=='PENDENTE'&&!(anterior.status==='REJEITADO'&&dto.decisao==='APROVADO'))throw new ConflictException('O lançamento não está pendente de aprovação.');
  if(dto.decisao==='REJEITADO'&&!dto.motivo?.trim())throw new BadRequestException('Informe a justificativa da rejeição.');
  await m.query(`UPDATE ${tabela} SET status=$4,decidido_por=$5,decidido_em=now() WHERE id=$1 AND contrato_id=$2 AND entregavel_id=$3`,[id,e.contratoId,e.id,dto.decisao,ator.id]);
  await exigirSaldoQuantidadeDireta(m,e);const registro=await consultarManualDireta(m,e,id);if(!registro)throw new NotFoundException('Lançamento não encontrado.');return {anterior,registro};
}
