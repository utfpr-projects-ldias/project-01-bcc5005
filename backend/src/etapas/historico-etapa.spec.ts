import { expect, jest, test } from '@jest/globals';
import { EtapasService } from './etapas.service.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const contratoId='11111111-1111-4111-8111-111111111111';
const etapaId='22222222-2222-4222-8222-222222222222';
const entregavelId='33333333-3333-4333-8333-333333333333';
function cenario() {
  const eventos = [{id:'ev',entidadeTipo:'ENTREGAVEL',entidadeId:entregavelId,acao:'ENTREGAVEL_EDITADO',atorSupertokensUserId:'qa',registradoEm:new Date(),dadosPosteriores:{itemId:'chave-legada',comprovanteId:'outro-registro-logico'}}];
  const consultarEventos=jest.fn(async (_filtros:unknown)=>eventos);
  const getRepository=jest.fn((entidade:unknown)=>{
    if(entidade===Entregavel)return {find:async()=>[{id:entregavelId,nome:'Entrega'}]};
    if(entidade===EventoAuditoria)return {find:consultarEventos};
    if(entidade===Usuario)return {find:async()=>[]};
    if(entidade===PermissaoContrato)return {findOneBy:async()=>null};
    throw new Error('Não deve consultar UUIDs inválidos nem calcular o progresso');
  });
  const repo={findOneBy:jest.fn(async (_filtro:unknown)=>({id:etapaId,contratoId}))};
  return { service:new EtapasService(repo as never,{} as never,{getRepository} as never,{} as never), consultarEventos, repo };
}
test('histórico preserva evento legado sem consultar identificadores não UUID e sem cálculo operacional',async()=>{
  const {service,consultarEventos,repo}=cenario();
  const r=await service.historico(contratoId,etapaId,{perfil:PerfilUsuario.ADMINISTRADOR} as never);
  expect(repo.findOneBy).toHaveBeenCalledWith({contratoId,id:etapaId});
  expect(r).toHaveLength(1);
  expect(r[0].descricao).toContain('Entrega');
  expect(consultarEventos).toHaveBeenCalledTimes(1);
});
test('histórico continua proibido sem vínculo autorizado',async()=>{
  const {service,consultarEventos}=cenario();
  await expect(service.historico(contratoId,etapaId,{perfil:PerfilUsuario.COLABORADOR,id:'usuario'} as never)).rejects.toThrow('Sem permissão');
  expect(consultarEventos).not.toHaveBeenCalled();
});
