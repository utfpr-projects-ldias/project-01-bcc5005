import { avaliarAgendaRecorrente, avaliarPesosAgenda } from './avaliar-agenda-recorrente.js';
import type { Ocorrencia } from './ocorrencia.entity.js';
const o = (inicio: string, fim: string, status: string) => ({periodoInicio:inicio,periodoFim:fim,status}) as Ocorrencia;

describe('HU09/TEC09 — grade replanejada com histórico preservado', () => {
  const dias = [{inicio:'2026-12-01',fim:'2026-12-01'},{inicio:'2026-12-02',fim:'2026-12-02'}];
  it('uma ocorrência histórica longa não conclui dois novos dias', () => {
    expect(avaliarAgendaRecorrente([o('2026-12-01','2026-12-07','CONCLUIDO')], dias, '2026-12-01'))
      .toEqual({completa:false,total:2,concluidas:0});
  });
  it('recusa sobreposição histórica ainda que existam tantos registros quanto períodos', () => {
    expect(avaliarAgendaRecorrente([
      o('2026-12-01','2026-12-07','CONCLUIDO'), o('2026-12-02','2026-12-02','CONCLUIDO'),
    ],dias,'2026-12-01')).toEqual({completa:false,total:2,concluidas:1});
  });
  it('período anterior aprovado continua contado separadamente', () => {
    expect(avaliarAgendaRecorrente([
      o('2026-11-01','2026-11-30','CONCLUIDO'),
      o('2026-12-01','2026-12-01','CONCLUIDO'),
      o('2026-12-02','2026-12-02','ENCERRADA'),
    ],dias,'2026-12-01')).toEqual({completa:true,total:3,concluidas:2});
  });
});

 describe('pesos vigentes da agenda',()=>{
  it('usa exatamente os mesmos pesos no painel e no aceite',()=>{
    expect(avaliarPesosAgenda([{pesoPeriodo:'20.0000',status:'CONCLUIDO' as Ocorrencia['status']},{pesoPeriodo:'80.0000',status:'NAO_INICIADO' as Ocorrencia['status']}])).toEqual({configurados:true,validos:true,percentual:20});
  });
  it('não admite encerramento com distribuição incompleta',()=>{
    expect(avaliarPesosAgenda([{pesoPeriodo:'20.0000',status:'CONCLUIDO' as Ocorrencia['status']}])).toEqual({configurados:true,validos:false,percentual:null});
  });
  it('mantém o modo simples se não há pesos',()=>{
    expect(avaliarPesosAgenda([{pesoPeriodo:null,status:'CONCLUIDO' as Ocorrencia['status']}])).toEqual({configurados:false,validos:true,percentual:null});
  });
});

describe('B06 — integridade da grade civil',()=>{
  const grade=[{inicio:'2026-12-02',fim:'2026-12-02'},{inicio:'2026-12-03',fim:'2026-12-03'}];
  const registros=[o('2026-12-01','2026-12-01','CONCLUIDO'),o('2026-12-02','2026-12-02','CONCLUIDO'),o('2026-12-03','2026-12-03','NAO_INICIADO')];
  const avaliar=(itens:Ocorrencia[],fim='2026-12-03')=>avaliarAgendaRecorrente(itens,grade,'2026-12-02','2026-12-01',fim);
  it('conta somente intervalos exatos e mantém períodos futuros no denominador',()=>{
    expect(avaliar(registros)).toEqual({completa:true,total:3,concluidas:2});
  });
  it('não aceita lacuna no prefixo, duplicidade ou período excedente',()=>{
    expect(avaliar(registros.slice(1)).completa).toBe(false);
    expect(avaliar([...registros,registros[1]]).completa).toBe(false);
    expect(avaliar([...registros,o('2026-12-04','2026-12-04','CONCLUIDO')]).completa).toBe(false);
  });
  it('não aceita encurtar o fim da obrigação',()=>expect(avaliar(registros,'2026-12-04').completa).toBe(false));
});
