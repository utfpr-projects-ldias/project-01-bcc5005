import { chaveInicioTemporal, podeIniciarTemporal, avisarMudancaAgendaOcorrencias, EVENTO_AGENDA_OCORRENCIAS_ALTERADA } from './inicio-temporal-ocorrencias';

describe('R24 — ativação temporal idempotente e recuperável', () => {
  it('usa o dia de São Paulo e muda a chave na virada do dia local',()=>{
    expect(chaveInicioTemporal('c',new Date('2026-11-23T02:30:00Z'))).toBe('c:2026-11-22');
    expect(chaveInicioTemporal('c',new Date('2026-11-23T03:01:00Z'))).toBe('c:2026-11-23');
  });
  it('não repete sucesso nem requisição em andamento',()=>{
    const chave='c:2026-11-22';
    expect(podeIniciarTemporal({chave,estado:'SUCESSO',instante:100},chave,300000)).toBe(false);
    expect(podeIniciarTemporal({chave,estado:'EXECUTANDO',instante:100},chave,300000)).toBe(false);
  });
  it('permite retry limitado depois da falha e na mudança de dia',()=>{
    const chave='c:2026-11-22';
    expect(podeIniciarTemporal({chave,estado:'FALHA',instante:100},chave,120099)).toBe(false);
    expect(podeIniciarTemporal({chave,estado:'FALHA',instante:100},chave,120100)).toBe(true);
    expect(podeIniciarTemporal({chave,estado:'SUCESSO',instante:100},'c:2026-11-23',101)).toBe(true);
  });
  it('notifica o contrato alterado para permitir nova ativação no mesmo dia', () => {
    const contratos: string[] = [];
    const listener = (evento: Event) => contratos.push((evento as CustomEvent<{contratoId:string}>).detail.contratoId);
    window.addEventListener(EVENTO_AGENDA_OCORRENCIAS_ALTERADA, listener);
    try {
      avisarMudancaAgendaOcorrencias('contrato-1');
      expect(contratos).toEqual(['contrato-1']);
      expect(podeIniciarTemporal(null, 'contrato-1:2026-11-22', 200)).toBe(true);
    } finally {
      window.removeEventListener(EVENTO_AGENDA_OCORRENCIAS_ALTERADA, listener);
    }
  });
});
