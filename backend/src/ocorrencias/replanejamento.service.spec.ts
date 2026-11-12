import { planoDeRevisao } from './replanejamento.service.js';
import { PeriodicidadeEntregavel as Periodicidade } from '../entregaveis/periodicidade-entregavel.enum.js';
import { StatusOcorrencia as Status } from './status-ocorrencia.enum.js';
import type { Ocorrencia } from './ocorrencia.entity.js';
const o = (id:string,i:string,f:string,status=Status.NAO_INICIADO, substituidaEm:Date|null=null) => ({
  id, periodoInicio:i, periodoFim:f, dataPrevista:f, status, substituidaEm,
}) as Ocorrencia;
const dto = { inicioFuturo:'2026-11-08', terminoPrevisto:'2026-11-14', periodicidade:Periodicidade.DIARIA };
describe('HU09 — impacto de replanejamento histórico',()=>{
 it('preserva conclusão antiga e substitui os sete dias futuros',()=>{
   const p=planoDeRevisao([o('aprovada','2026-11-01','2026-11-07',Status.CONCLUIDO),o('futura','2026-11-08','2026-11-14')],new Set(),dto,'2026-11-07');
   expect(p.substituir.map(v=>v.id)).toEqual(['futura']);expect(p.novas).toHaveLength(7);expect(p.preservadas).toBe(1);
 });
 it('arquiva período ainda não concluído, mesmo se vinculado; jamais o reativa',()=>{
   const antiga=o('substituida','2026-11-08','2026-11-14',Status.EM_REVISAO);
   const p=planoDeRevisao([antiga],new Set([antiga.id]),dto,'2026-11-07');
   expect(p.substituir).toContain(antiga);expect(p.reativar).toHaveLength(0);
   const p2=planoDeRevisao([o('arquivo','2026-11-08','2026-11-14',Status.NAO_INICIADO,new Date())],new Set(),
     {...dto,periodicidade:Periodicidade.SEMANAL},'2026-11-07');
   expect(p2.novas).toHaveLength(1);expect(p2.reativar).toHaveLength(0);
 });
 it('não cria segundo registro em período já coberto por um concluído',()=>{
   const p=planoDeRevisao([o('concluida','2026-11-08','2026-11-09',Status.CONCLUIDO)],new Set(),
     {...dto,periodicidade:Periodicidade.SEMANAL},'2026-11-07');
   expect(p.substituir).toHaveLength(0);expect(p.novas).toHaveLength(0);expect(p.preservadas).toBe(1);
 });
 it('não duplica uma conclusão antiga que cruza mais de uma célula',()=>{
   const p=planoDeRevisao([o('concluida','2026-11-08','2026-11-14',Status.CONCLUIDO)],new Set(),dto,'2026-11-07');
   expect(p.novas).toHaveLength(6);
 });
});
