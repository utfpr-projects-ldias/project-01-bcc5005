import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull } from 'typeorm';
import { ContratosService } from '../contratos/contratos.service.js';
import { ExecucaoService } from '../execucao/execucao.service.js';
import { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { hojeCivil } from '../common/data-civil.js';
import { finalizado, projetarContrato, resumirCarteira, type LinhaDashboard } from './dashboard-modelo.js';
import type { Contrato } from '../contratos/contrato.entity.js';

export type FiltroDashboard = { busca: string; filtro: string; pagina: number; limiteDias: number };
const TAMANHO_PAGINA = 20;
export const FILTROS = ['todos','ativos','planejamento','encerramento','atrasados','concluidos','pendentes','proximas'] as const;
const corresponde = (l:LinhaDashboard,f:string,d:number) => {
  switch(f){
    case 'ativos': return l.ativo;
    case 'planejamento': return l.ativo&&l.contrato.status==='PLANEJAMENTO';
    case 'encerramento': return l.ativo&&l.diasRestantes>=0&&l.diasRestantes<=d;
    case 'atrasados': return l.ativo&&l.atrasos>0;
    case 'concluidos': return finalizado(l.contrato);
    case 'pendentes': return l.ativo&&l.entregaveis.pendentes>0;
    case 'proximas': return l.ativo&&l.proximas>0;
    default: return true;
  }
};
@Injectable()
export class DashboardService {
  constructor(private readonly contratos:ContratosService,private readonly execucao:ExecucaoService,private readonly entregaveis:EntregaveisService,private readonly politica:PoliticaAcessoService,private readonly ds:DataSource){}
  private async projetar(contratos:Contrato[],ator:UsuarioAutenticado,hoje:string,limite:number) {
    // Carteira já filtrada no SQL de ContratosService. Revalidar as políticas
    // de leitura das projeções: nenhuma consulta de detalhe de UUID arbitrário.
    const permitidos:Contrato[]=[];
    for(const c of contratos) {
      const escopoOperacional={tipo:'contrato',parametro:'contratoId'} as const;
      if(await this.politica.permitido(ator,{acao:'execucao:visualizar',escopoOperacional},c.id)&&
        await this.politica.permitido(ator,{acao:'evidencias:listar',escopoOperacional},c.id)&&
        await this.politica.permitido(ator,{acao:'etapas:listar',escopoOperacional},c.id)&&
        await this.politica.permitido(ator,{acao:'ocorrencias:listar',escopoOperacional},c.id)&&
        await this.politica.permitido(ator,{acao:'atividades:listar',escopoOperacional},c.id)) permitidos.push(c);
    }
    if(!permitidos.length)return [];
    const ids=permitidos.map(c=>c.id);
    // Consultas em lote para cronograma e contagens. Motor físico/documental existente,
    // sem duplicar suas regras. Limitar paralelismo para preservar o pool PostgreSQL.
    const responsaveisIds=ator.perfil===PerfilUsuario.ADMINISTRADOR?[...new Set(permitidos.flatMap(c=>c.responsavelInternoId?[c.responsavelInternoId]:[]))]:[];
    const [etapas,ocorrencias,atividades,metadados,responsaveis]=await Promise.all([
      this.ds.manager.findBy(Etapa,{contratoId:In(ids),arquivadoEm:IsNull()}),
      this.ds.manager.findBy(Ocorrencia,{contratoId:In(ids),substituidaEm:IsNull()}),
      this.ds.manager.query(`SELECT "contratoId" AS id, count(*)::int AS total, count(*) FILTER (WHERE status='VERIFICADA')::int AS verificadas FROM atividades WHERE "contratoId"=ANY($1::uuid[]) AND "excluidaEm" IS NULL AND status<>'ARQUIVADA' GROUP BY "contratoId"`,[ids]) as Promise<{id:string;total:number;verificadas:number}[]>,
      this.ds.manager.find(Entregavel,{where:{contratoId:In(ids),arquivadoEm:IsNull()},select:{id:true,contratoId:true,etapaId:true,unidadeMedida:true}}),
      responsaveisIds.length?this.ds.manager.find(Usuario,{where:{id:In(responsaveisIds)},select:{id:true,nome:true}}):Promise.resolve([] as Usuario[]),
    ]);
    const linhas:LinhaDashboard[]=[];
    for(let i=0;i<permitidos.length;i+=3){
      linhas.push(...await Promise.all(permitidos.slice(i,i+3).map(async c=>{
        const [p,d]=await Promise.all([this.execucao.consultar(c.id),this.entregaveis.resumoDocumental(c.id)]);
        const a=atividades.find(v=>v.id===c.id);
        return projetarContrato(c,p,d,etapas.filter(e=>e.contratoId===c.id),ocorrencias.filter(o=>o.contratoId===c.id),a?{total:a.total,verificadas:a.verificadas}:{total:0,verificadas:0},hoje,limite,metadados.filter(e=>e.contratoId===c.id),c.responsavelInternoId?(responsaveis.find(r=>r.id===c.responsavelInternoId)?.nome?.trim()||'Responsável interno cadastrado'):null);
      })));
    }
    return linhas;
  }
  async carteira(ator:UsuarioAutenticado,f:FiltroDashboard){
    const hoje=hojeCivil();
    const termo=f.busca.trim().toLocaleLowerCase('pt-BR');
    const contratos=(await this.contratos.listar(ator)).filter(c=>!c.arquivadoEm && (!termo||[c.numeroContrato,c.codigoPublico,c.orgaoContratante,c.objeto].some(s=>s.toLocaleLowerCase('pt-BR').includes(termo))));
    const linhas=await this.projetar(contratos,ator,hoje,f.limiteDias);
    const filtradas=linhas.filter(l=>corresponde(l,f.filtro,f.limiteDias));
    const total=filtradas.length, paginas=Math.max(1,Math.ceil(total/TAMANHO_PAGINA)), pagina=Math.min(f.pagina,paginas);
    return {versao:1,hoje,limiteDias:f.limiteDias,indicadores:resumirCarteira(linhas,f.limiteDias),totalCarteira:linhas.length,total,pagina,paginas,
      linhas:filtradas.slice((pagina-1)*TAMANHO_PAGINA,pagina*TAMANHO_PAGINA).map(({matriz,prazos,alertas,...linha})=>({...linha,totalAlertas:alertas.length,alertas:alertas.slice(0,3)}))};
  }
  async detalhe(ator:UsuarioAutenticado,id:string,limite:number){
    const c=(await this.contratos.listar(ator)).find(v=>v.id===id&&!v.arquivadoEm);
    if(!c)throw new NotFoundException('Contrato não encontrado');
    const [linha]=await this.projetar([c],ator,hojeCivil(),limite);
    if(!linha)throw new NotFoundException('Contrato não encontrado');
    return {versao:1,...linha};
  }
}
