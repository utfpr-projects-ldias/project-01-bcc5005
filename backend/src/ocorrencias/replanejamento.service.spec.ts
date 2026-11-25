import { planoDeRevisao } from './replanejamento.service.js';
import { ConflictException } from '@nestjs/common';
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
 it('recusa substituir período iniciado ou vinculado sem conciliação de execução',()=>{
   const iniciado=o('iniciado','2026-11-08','2026-11-14',Status.EM_REVISAO);
   expect(()=>planoDeRevisao([iniciado],new Set([iniciado.id]),dto,'2026-11-07'))
     .toThrow(ConflictException);
   const apenasVinculado=o('atividade','2026-11-08','2026-11-14');
   expect(()=>planoDeRevisao([apenasVinculado],new Set([apenasVinculado.id]),dto,'2026-11-07'))
     .toThrow(ConflictException);
 });
 it('preserva período vinculado quando sua duração e datas continuam idênticas',()=>{
   const vinculada=o('atividade','2026-11-08','2026-11-14');
   const p=planoDeRevisao([vinculada],new Set([vinculada.id]),
     {...dto,periodicidade:Periodicidade.SEMANAL},'2026-11-07');
   expect(p.substituir).toHaveLength(0);
   expect(p.novas).toHaveLength(0);
   expect(p.preservadas).toBe(1);
 });
 it('não reativa ocorrências substituídas historicamente',()=>{
   const arquivada=o('arquivo','2026-11-08','2026-11-14',Status.NAO_INICIADO,new Date());
   const p=planoDeRevisao([arquivada],new Set(),
     {...dto,periodicidade:Periodicidade.SEMANAL},'2026-11-07');
   expect(p.novas).toHaveLength(1);
   expect(p.reativar).toHaveLength(0);
 });
 it('preserva uma conclusão apenas quando o novo período tem datas exatamente iguais',()=>{
   const concluida=o('concluida','2026-11-08','2026-11-14',Status.CONCLUIDO);
   const p=planoDeRevisao([concluida],new Set(),
     {...dto,periodicidade:Periodicidade.SEMANAL},'2026-11-07');
   expect(p.substituir).toHaveLength(0);
   expect(p.novas).toHaveLength(0);
   expect(p.preservadas).toBe(1);
 });
 it('recusa fundir um período concluído com dias ainda não executados',()=>{
   const concluida=o('concluida','2026-11-08','2026-11-09',Status.CONCLUIDO);
   expect(()=>planoDeRevisao([concluida],new Set(),
     {...dto,periodicidade:Periodicidade.SEMANAL},'2026-11-07'))
     .toThrow(ConflictException);
 });
 it('recusa dividir um período concluído em vários novos períodos',()=>{
   const concluida=o('concluida','2026-11-08','2026-11-14',Status.CONCLUIDO);
   expect(()=>planoDeRevisao([concluida],new Set(),dto,'2026-11-07'))
     .toThrow(ConflictException);
 });
});

// As alterações de unidade e da meta para NOVOS períodos não participam do
// algoritmo de datas: o impacto deve preservar períodos históricos concluídos.
describe('parâmetros dos períodos novos não reescrevem o calendário histórico', () => {
  it('preserva o mesmo conjunto de datas ao incluir meta e unidade', () => {
    const antigo = [o('historico', '2026-11-01', '2026-11-07', Status.CONCLUIDO)];
    const base = planoDeRevisao(antigo, new Set(), dto, '2026-11-07');
    const comMeta = planoDeRevisao(antigo, new Set(), { ...dto, modoRegistro: 'QUANTITATIVO', metaQuantidade: '25.000', unidadeMedida: 'computadores' }, '2026-11-07');
    expect(comMeta.novas).toEqual(base.novas);
    expect(comMeta.preservadas).toBe(1);
  });
});

describe('B06 — preservação da grade histórica',()=>{
  it('recusa substituir intervalo iniciado no calendário ainda sem mudança de status',()=>{
    expect(()=>planoDeRevisao([o('em-curso','2026-11-06','2026-11-14')],new Set(),dto,'2026-11-07')).toThrow(ConflictException);
  });
  it('recusa lacuna entre histórico e nova grade',()=>{
    expect(()=>planoDeRevisao([o('antigo','2026-11-01','2026-11-06',Status.CONCLUIDO)],new Set(),dto,'2026-11-07')).toThrow(ConflictException);
  });
  it('preserva observações de período futuro',()=>{
    const futuro=Object.assign(o('futuro','2026-11-08','2026-11-14'),{observacoes:'Planejamento acordado'});
    expect(()=>planoDeRevisao([futuro],new Set(),dto,'2026-11-07')).toThrow(ConflictException);
  });
});
