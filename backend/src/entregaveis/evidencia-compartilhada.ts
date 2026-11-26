import { BadRequestException } from '@nestjs/common';
import { uuidValido } from '../autorizacao/politicas-operacionais.js';

export type DestinoEvidencia = { entregavelId: string; esperadaId: string | null; quantidadeExecutada?:string; percentualExecucao?:string; ocorrenciaId?:string; ocorrenciaIds?:string[] };
/** Cada destino possui contribuição própria; a aprovação do arquivo é compartilhada. */
export function destinosEvidencia(valor?: string): DestinoEvidencia[] {
  if (valor === undefined) return [];
  let dados: unknown;
  try { dados = JSON.parse(valor); } catch { throw new BadRequestException('Vínculos adicionais inválidos.'); }
  if (!Array.isArray(dados) || dados.length > 30) throw new BadRequestException('Selecione até 30 entregáveis adicionais.');
  const vistos = new Set<string>();
  return dados.map(d => {
    if (!d || typeof d !== 'object' || Object.keys(d).some(k => !['entregavelId','esperadaId','quantidadeExecutada','percentualExecucao','ocorrenciaId','ocorrenciaIds'].includes(k)) || !uuidValido(d.entregavelId) || (d.esperadaId !== null && !uuidValido(d.esperadaId)))
      throw new BadRequestException('Destino de evidência inválido.');
    const entregavelId = d.entregavelId.toLowerCase();
    if (vistos.has(entregavelId)) throw new BadRequestException('Selecione apenas um requisito por entregável.');
    vistos.add(entregavelId);
    const q=d.quantidadeExecutada,p=d.percentualExecucao,o=d.ocorrenciaId,ids=d.ocorrenciaIds;
    if(q!==undefined&&(typeof q!=='string'||!/^\d{1,15}(?:\.\d{1,3})?$/.test(q)||Number(q)<=0)||p!==undefined&&(typeof p!=='string'||!/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/.test(p)||Number(p)<=0)||q!==undefined&&p!==undefined||o!==undefined&&(!uuidValido(o)||(q===undefined&&p===undefined))||ids!==undefined&&(!Array.isArray(ids)||ids.length>50||ids.some(id=>!uuidValido(id))||new Set(ids.map(id=>id.toLowerCase())).size!==ids.length))throw new BadRequestException('Contribuição ou ocorrências do destino inválidas.');
    return { entregavelId, esperadaId: d.esperadaId?.toLowerCase() ?? null, ...(q!==undefined?{quantidadeExecutada:q}:{}), ...(p!==undefined?{percentualExecucao:p}:{}), ...(o?{ocorrenciaId:o.toLowerCase()}:{}), ...(ids?{ocorrenciaIds:ids.map((id:string)=>id.toLowerCase())}:{}) };
  });
}
