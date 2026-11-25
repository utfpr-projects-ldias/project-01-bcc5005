import { describe, expect, it, jest } from '@jest/globals';
import type { DataSource } from 'typeorm';
import { DashboardService } from './dashboard.service.js';
import type { ContratosService } from '../contratos/contratos.service.js';
import type { ExecucaoService } from '../execucao/execucao.service.js';
import type { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import type { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import type { Contrato } from '../contratos/contrato.entity.js';
import { StatusContrato } from '../contratos/status-contrato.enum.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const contrato=(id:string,numeroContrato:string)=>({id,numeroContrato,codigoPublico:'1',objeto:'Objeto',orgaoContratante:'Órgão',inicioVigencia:'2026-01-01',terminoVigencia:'2027-12-31',status:StatusContrato.EM_EXECUCAO,arquivadoEm:null,reabertoEm:null,responsavelInternoId:null}) as Contrato;
const gestor={id:'gestor',supertokensUserId:'st',email:'gestor@exemplo.com',perfil:PerfilUsuario.GESTOR} satisfies UsuarioAutenticado;
const admin={...gestor,perfil:PerfilUsuario.ADMINISTRADOR};
const filtro={busca:'',filtro:'todos',pagina:1,limiteDias:30};
function cenario(){
  const listar=jest.fn(async (ator:UsuarioAutenticado)=>ator.perfil===PerfilUsuario.ADMINISTRADOR?[contrato(A,'Carteira Alfa'),contrato(B,'Carteira Beta')]:[contrato(A,'Carteira Alfa')]);
  const consultar=jest.fn(async (_id:string)=>({avanco:null,configuracaoPendente:false,entregaveis:[]}));
  const resumoDocumental=jest.fn(async (_id:string)=>({}));
  const permitido=jest.fn(async (_ator:UsuarioAutenticado,_politica:unknown,_id:string)=>true);
  const findBy=jest.fn(async()=>[]),find=jest.fn(async()=>[]),query=jest.fn(async()=>[]);
  const service=new DashboardService({listar} as unknown as ContratosService,{consultar} as unknown as ExecucaoService,{resumoDocumental} as unknown as EntregaveisService,{permitido} as unknown as PoliticaAcessoService,{manager:{findBy,find,query}} as unknown as DataSource);
  return {service,consultar,resumoDocumental,permitido,findBy,query};
}
describe('HU11 — escopo da carteira',()=>{
  it('gestor só agrega A e detalhe de B é negado antes de consultar dados',async()=>{const c=cenario();const r=await c.service.carteira(gestor,filtro);expect(r.total).toBe(1);expect(r.linhas.map(l=>l.contrato.id)).toEqual([A]);expect(c.consultar).toHaveBeenCalledWith(A);expect(c.consultar).not.toHaveBeenCalledWith(B);expect(c.query).toHaveBeenCalledWith(expect.any(String),[[A]]);await expect(c.service.detalhe(gestor,B,30)).rejects.toThrow('Contrato não encontrado');});
  it('administrador agrega ambos os contratos permitidos e busca é aplicada antes do motor',async()=>{const c=cenario();expect((await c.service.carteira(admin,filtro)).total).toBe(2);c.consultar.mockClear();expect((await c.service.carteira(admin,{...filtro,busca:'Carteira Beta'})).linhas.map(l=>l.contrato.id)).toEqual([B]);expect(c.consultar).not.toHaveBeenCalledWith(A);});
  it('se uma projeção for negada, não consulta seus dados',async()=>{const c=cenario();c.permitido.mockResolvedValue(false);expect((await c.service.carteira(gestor,filtro)).total).toBe(0);expect(c.consultar).not.toHaveBeenCalled();expect(c.findBy).not.toHaveBeenCalled();});
});
