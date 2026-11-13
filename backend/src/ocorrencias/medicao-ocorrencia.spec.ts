import type { EntityManager } from 'typeorm';
import type { Ocorrencia } from './ocorrencia.entity.js';
import { proximoStatusAutomatico, resumoMedicao } from './medicao-ocorrencia.js';

/** Cenários puros: não substituem migração/QA com PostgreSQL. */
const ocorrencia = (dados: Partial<Ocorrencia> = {}): Ocorrencia => ({
  id: 'oc-01', contratoId: 'co-01', modoRegistro: 'QUANTITATIVO',
  metaQuantidade: '20', status: 'EM_ANDAMENTO', exigeAtividade: true,
  evidenciaExigida: 'NENHUMA', ...dados,
} as Ocorrencia);
const gerente = (manual: number, verificada: number, registrada = verificada,
  verificadas = 1, pendentes = 0, fotos = 0, relatorios = 0): EntityManager => ({
  query: jest.fn().mockResolvedValueOnce([{ total: String(manual) }])
    .mockResolvedValueOnce([{
      registrada: String(registrada), verificada: String(verificada),
      verificadas: String(verificadas), pendentes: String(pendentes),
    }]).mockResolvedValueOnce([{ fotos: String(fotos), relatorios: String(relatorios) }]),
} as unknown as EntityManager);

describe('Patch38 — medição e critérios para ocorrências', () => {
  it('contabiliza a mesma execução somente após aprovação da atividade', async () => {
    const o = ocorrencia();
    const r = await resumoMedicao(gerente(3, 12, 17, 1, 1), o);
    expect(r.quantidadeExecutada).toBe(15);
    expect(r.quantidadeRegistrada).toBe(20);
    expect(r.quantidadeRestante).toBe(5);
    expect(r.progressoPercentual).toBe(75);
    expect(r.requisitosAtendidos).toBe(false);
    expect(proximoStatusAutomatico(o, r)).toBe('EM_ANDAMENTO');
  });
  it('soma 25 + 19 como parcelas distintas de 74 e recalcula corretamente após correção do primeiro para 20', async () => {
    const o = ocorrencia({ metaQuantidade:'74',exigeAtividade:false });
    const registro = await resumoMedicao(gerente(44,0,0,0,0),o);
    expect(registro.quantidadeExecutada).toBe(44);
    expect(registro.quantidadeRestante).toBe(30);
    const correcao = await resumoMedicao(gerente(39,0,0,0,0),o);
    expect(correcao.quantidadeExecutada).toBe(39);
    expect(correcao.quantidadeRestante).toBe(35);
  });
  it('não promove para pendente quando ainda falta relatório obrigatório', async () => {
    const o = ocorrencia({ evidenciaExigida: 'RELATORIO' });
    const r = await resumoMedicao(gerente(5, 15), o);
    expect(r.progressoPercentual).toBe(100);
    expect(r.situacaoComprovacao).toBe('PARCIAL');
    expect(r.requisitosAtendidos).toBe(false);
    expect(proximoStatusAutomatico(o,r)).toBe('EM_ANDAMENTO');
  });
  it('só solicita conclusão quando meta, atividade e as duas provas exigidas estiverem atendidas', async () => {
    const o = ocorrencia({ evidenciaExigida: 'AMBOS' });
    const r = await resumoMedicao(gerente(5,15,15,1,0,1,1),o);
    expect(r.quantidadeExecutada).toBe(20);
    expect(r.situacaoComprovacao).toBe('APRESENTADA');
    expect(r.requisitosAtendidos).toBe(true);
    expect(proximoStatusAutomatico(o,r)).toBe('PENDENTE_CONCLUSAO');
  });
  it('permite cumprir a meta apenas com lançamento manual quando atividade não é exigida', async () => {
    const o = ocorrencia({ exigeAtividade: false });
    const r = await resumoMedicao(gerente(20,0,0,0,0),o);
    expect(r.metaAtingida).toBe(true);
    expect(r.requisitosAtendidos).toBe(true);
    expect(proximoStatusAutomatico(o,r)).toBe('PENDENTE_CONCLUSAO');
  });
  it('preserva EM_REVISAO sem reenvio automático para aprovação', async () => {
    const o = ocorrencia({status:'EM_REVISAO',exigeAtividade:false});
    const r = await resumoMedicao(gerente(20,0,0,0,0),o);
    expect(proximoStatusAutomatico(o,r)).toBe('EM_REVISAO');
  });
  it('não inventa 100% para uma ocorrência sem quantidade/atividade', async () => {
    const o = ocorrencia({ metaQuantidade:null, modoRegistro:'DESCRITIVO',exigeAtividade:true });
    const r = await resumoMedicao(gerente(0,0,0,0,0),o);
    expect(r.metaAtingida).toBe(false);
    expect(proximoStatusAutomatico(o,r)).toBe('NAO_INICIADO');
  });
  it('exige duas atividades verificadas e três relatórios antes de solicitar conclusão', async () => {
    const o = ocorrencia({ minimoAtividadesVerificadas: 2, minimoEvidenciasVerificadas:3, evidenciaExigida:'RELATORIO' });
    const parcial = await resumoMedicao(gerente(20,0,0,1,0,0,2), o);
    expect(parcial.requisitosAtendidos).toBe(false);
    expect(parcial.situacaoComprovacao).toBe('PARCIAL');
    const completo = await resumoMedicao(gerente(20,0,0,2,0,0,3),o);
    expect(completo.requisitosAtendidos).toBe(true);
    expect(completo.situacaoComprovacao).toBe('APRESENTADA');
    expect(proximoStatusAutomatico(o,completo)).toBe('PENDENTE_CONCLUSAO');
  });
  it('com formato AMBOS exige foto e relatório além do mínimo total', async () => {
    const o = ocorrencia({ minimoAtividadesVerificadas:0, minimoEvidenciasVerificadas:3, evidenciaExigida:'AMBOS' });
    expect((await resumoMedicao(gerente(20,0,0,0,0,3,0),o)).requisitosAtendidos).toBe(false);
    expect((await resumoMedicao(gerente(20,0,0,0,0,2,1),o)).requisitosAtendidos).toBe(true);
  });

});
