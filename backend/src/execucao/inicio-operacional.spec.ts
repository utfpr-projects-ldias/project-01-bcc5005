import { jest } from '@jest/globals';
import { iniciarHierarquiaOperacional } from './inicio-operacional.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
const ator={id:'u',email:'qa@example.invalid',perfil:PerfilUsuario.ADMINISTRADOR,supertokensUserId:'qa'};
function cenario(status:string|null=null, etapaStatus='PLANEJADA') {
 const e={id:'e',contratoId:'c',etapaId:'t',statusExecucao:status,arquivadoEm:null,reabertoEm:null};
 const t={id:'t',contratoId:'c',status:etapaStatus,arquivadoEm:null,reabertoEm:null};
 const m={findOneBy:jest.fn(async (tipo:unknown)=>tipo===Entregavel?e:t),update:jest.fn(async(tipo:unknown,_where:unknown,campos:object)=>{Object.assign(tipo===Entregavel?e:t,campos);return {affected:1};})};
 const auditoria={registrarNaTransacao:jest.fn(async (..._args:unknown[])=>undefined)};
 return {e,t,m,auditoria,executar:()=>iniciarHierarquiaOperacional(m as never,auditoria as never,ator,'c','e')};
}
test('execução reconhecida inicia entrega e etapa, sem concluir nem alterar medidas',async()=>{
 const x=cenario(); await x.executar(); expect(x.e.statusExecucao).toBe('EM_ANDAMENTO');expect(x.t.status).toBe('EM_ANDAMENTO');
 expect(x.auditoria.registrarNaTransacao).toHaveBeenCalledTimes(2);
 expect(x.auditoria.registrarNaTransacao).toHaveBeenCalledWith(x.m,ator,expect.objectContaining({acao:AcaoAuditoria.ETAPA_STATUS_ALTERADO}));
 await x.executar();expect(x.m.update).toHaveBeenCalledTimes(2);
});
test('etapa encerrada não reabre por verificação de um registro',async()=>{
 const x=cenario('EM_ANDAMENTO','ENCERRADA');await x.executar();expect(x.t.status).toBe('ENCERRADA');expect(x.m.update).not.toHaveBeenCalled();
});
test('entregável concluído inicia etapa planejada sem voltar a andamento',async()=>{
 const x=cenario('CONCLUIDO');await x.executar();expect(x.e.statusExecucao).toBe('CONCLUIDO');expect(x.t.status).toBe('EM_ANDAMENTO');expect(x.m.update).toHaveBeenCalledTimes(1);
});

test('reconhecimento inicia a execução preservando a revisão existente', async () => {
  const x = cenario(); const revisao = new Date();
  Object.assign(x.e, { reabertoEm: revisao }); Object.assign(x.t, { reabertoEm: revisao });
  await x.executar();
  expect(x.e.statusExecucao).toBe('EM_ANDAMENTO'); expect(x.t.status).toBe('EM_ANDAMENTO');
  expect(x.e.reabertoEm).toBe(revisao); expect(x.t.reabertoEm).toBe(revisao);
});
