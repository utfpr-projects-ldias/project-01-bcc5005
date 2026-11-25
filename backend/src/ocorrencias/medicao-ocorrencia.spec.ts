import { jest } from '@jest/globals';
import type { EntityManager } from 'typeorm';
import type { Ocorrencia } from './ocorrencia.entity.js';
import { minimoInicialEvidencias, validarDadosOcorrencia, validarEncerramentoOcorrencia } from './ocorrencias.service.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import { proximoStatusAutomatico, resumoMedicao, medicaoAprovadaAtual, medicaoReconhecidaAtual } from './medicao-ocorrencia.js';

/** Cenários puros: não substituem migração/QA com PostgreSQL. */
const ocorrencia = (dados: Partial<Ocorrencia> = {}): Ocorrencia => ({
  id: 'oc-01', contratoId: 'co-01', modoRegistro: 'QUANTITATIVO',
  metaQuantidade: '20', status: StatusOcorrencia.EM_ANDAMENTO, exigeAtividade: true,
  evidenciaExigida: 'NENHUMA', ...dados,
} as Ocorrencia);
const gerente = (manual: number, verificada: number, registrada = verificada,
  verificadas = 1, pendentes = 0, fotos = 0, relatorios = 0): EntityManager => ({
  query: jest.fn<(...args: unknown[]) => Promise<unknown>>(async () => undefined).mockResolvedValueOnce([{ total: String(manual) }])
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
    expect(r.quantidadeDisponivel).toBe(0);
    expect(r.quantidadeDisponivelExata).toBe('0.000');
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
    const o = ocorrencia({status: StatusOcorrencia.EM_REVISAO,exigeAtividade:false});
    const r = await resumoMedicao(gerente(20,0,0,0,0),o);
    expect(proximoStatusAutomatico(o,r)).toBe('EM_REVISAO');
  });
  it('não inventa 100% para uma ocorrência sem quantidade/atividade', async () => {
    const o = ocorrencia({ metaQuantidade:null, modoRegistro:'DESCRITIVO', exigeAtividade:true, status: StatusOcorrencia.NAO_INICIADO });
    const r = await resumoMedicao(gerente(0,0,0,0,0),o);
    expect(r.metaAtingida).toBe(false);
    expect(proximoStatusAutomatico(o,r)).toBe('NAO_INICIADO');
    // Uma ocorrência já iniciada manualmente não deve ser reiniciada por falta de medição.
    expect(proximoStatusAutomatico(Object.assign({}, o, { status: StatusOcorrencia.EM_ANDAMENTO }), r)).toBe('EM_ANDAMENTO');
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


describe('lançamentos excluídos logicamente', () => {
  it('filtra registros excluídos na soma do progresso físico', async () => {
    const m = gerente(7,0,0,0,0);
    const o = ocorrencia({ metaQuantidade: '20', exigeAtividade: false });
    await resumoMedicao(m,o);
    expect((m.query as jest.Mock).mock.calls[0][0]).toContain('excluido_em IS NULL');
  });
});


describe('execução acima da meta preserva a quantidade sem ultrapassar 100%', () => {
  it('registra excedente manual e limita somente a porcentagem', async () => {
    const o = ocorrencia({ metaQuantidade:'20', exigeAtividade:false });
    const r = await resumoMedicao(gerente(25,0,0,0,0),o);
    expect(r.quantidadeExecutada).toBe(25);
    expect(r.quantidadeRegistrada).toBe(25);
    expect(r.quantidadeRestante).toBe(0);
    expect(r.progressoPercentual).toBe(100);
    expect(proximoStatusAutomatico(o,r)).toBe('PENDENTE_CONCLUSAO');
  });
  it('refaz a proporção ao mudar só a meta, não a medição já registrada', async () => {
    const maior = await resumoMedicao(gerente(13,0,0,0,0),ocorrencia({metaQuantidade:'25',exigeAtividade:false}));
    const menor = await resumoMedicao(gerente(13,0,0,0,0),ocorrencia({metaQuantidade:'10',exigeAtividade:false}));
    expect(maior.progressoPercentual).toBe(52);
    expect(menor.progressoPercentual).toBe(100);
    expect(menor.quantidadeExecutada).toBe(13);
  });
});


describe('R41 — contribuição aprovada revalidada', () => {
  it('reduz a medição atual após invalidação, sem alterar a decisão auditada', async () => {
    const o = ocorrencia({status: StatusOcorrencia.CONCLUIDO_PARCIALMENTE, quantidadeAprovada:'25.000', metaQuantidade:'25.000', exigeAtividade:false});
    expect(await medicaoAprovadaAtual(gerente(15,0,0,0,0),o)).toEqual({quantidade:'15.000',apta:false});
    expect(o.status).toBe(StatusOcorrencia.CONCLUIDO_PARCIALMENTE);
    expect(o.quantidadeAprovada).toBe('25.000');
  });
  it('não incorpora unidades adicionais não aprovadas à medição histórica', async () => {
    const o = ocorrencia({status: StatusOcorrencia.CONCLUIDO, quantidadeAprovada:'25.000', metaQuantidade:'25.000', exigeAtividade:false});
    expect(await medicaoAprovadaAtual(gerente(40,0,0,0,0),o)).toEqual({quantidade:'25.000',apta:true});
  });
  it('não contabiliza a ocorrência encerrada ou pendente', async () => {
    const o = ocorrencia({status: StatusOcorrencia.ENCERRADA, quantidadeAprovada:'25.000'});
    expect(await medicaoAprovadaAtual(gerente(25,0),o)).toEqual({quantidade:null,apta:false});
  });
});


describe('R48 — aprovação individual e reserva quantitativa', () => {
  function medicao(manual: {total:string;registrada:string;pendentes:string}, provas: {quantidade:string;pendente_quantidade:string}) {
    return {query: jest.fn<(...args:unknown[])=>Promise<unknown>>()
      .mockResolvedValueOnce([manual]).mockResolvedValueOnce([{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}])
      .mockResolvedValueOnce([{fotos:'0',relatorios:'0',total:'0',...provas}])} as unknown as EntityManager;
  }
  const o=ocorrencia({metaQuantidade:'100',exigeAtividade:false});
  it('não reconhece quantidade manual pendente, mas mantém o valor registrado',async()=>{
    const m=medicao({total:'30',registrada:'100',pendentes:'1'},{quantidade:'0',pendente_quantidade:'0'});
    const r=await resumoMedicao(m,o);
    expect(r.quantidadeExecutada).toBe(30);expect(r.quantidadeRegistrada).toBe(100);
    expect(r.criteriosOperacionaisAtendidos).toBe(false);expect(proximoStatusAutomatico(o,r)).toBe('EM_ANDAMENTO');
    expect((m.query as jest.Mock).mock.calls[0][0]).toContain("WHERE status_execucao='APROVADO'");
  });
  it('reconhece as unidades aprovadas e preserva a aprovação da ocorrência',async()=>{
    const r=await resumoMedicao(medicao({total:'100',registrada:'100',pendentes:'0'},{quantidade:'0',pendente_quantidade:'0'}),o);
    expect(r.quantidadeExecutada).toBe(100);expect(r.quantidadeRestante).toBe(0);expect(proximoStatusAutomatico(o,r)).toBe('PENDENTE_CONCLUSAO');
  });
  it('reserva evidência pendente sem acrescentar unidades reconhecidas',async()=>{
    const r=await resumoMedicao(medicao({total:'60',registrada:'60',pendentes:'0'},{quantidade:'20',pendente_quantidade:'20'}),o);
    expect(r.quantidadeExecutada).toBe(80);expect(r.quantidadeRegistrada).toBe(100);expect(r.criteriosOperacionaisAtendidos).toBe(false);
  });
});


describe('R49 — medição reconhecida não depende de encerramento formal',()=>{
  it.each([StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.ENCERRADA,StatusOcorrencia.PENDENTE_CONCLUSAO])('preserva 40 unidades no estado %s, sem aprovar pendências',async status=>{
    const o=ocorrencia({status,metaQuantidade:'100'});
    expect(await medicaoReconhecidaAtual(gerente(15,25,50),o)).toBe('40.000');
  });
  it('não reconhece quantidade declarada sem aprovação',async()=>{
    expect(await medicaoReconhecidaAtual(gerente(0,0,60),ocorrencia({metaQuantidade:'100'}))).toBe('0.000');
  });
  it('preserva excedente reconhecido, mas não soma ocorrência substituída',async()=>{
    expect(await medicaoReconhecidaAtual(gerente(125,0),ocorrencia({metaQuantidade:'100'}))).toBe('125.000');
    expect(await medicaoReconhecidaAtual(gerente(125,0),ocorrencia({substituidaEm:new Date()}))).toBeNull();
  });
});


it('uma declaração pendente não inicia ocorrência; prova verificada inicia sem inventar avanço', async()=>{
 const o=ocorrencia({status:StatusOcorrencia.NAO_INICIADO});
 const pendente=await resumoMedicao(gerente(0,0,5,0,1),o);
 expect(proximoStatusAutomatico(o,pendente)).toBe('NAO_INICIADO');
 const verificada=await resumoMedicao(gerente(0,0,0,0,0,1),o);
 expect(proximoStatusAutomatico(o,verificada)).toBe('EM_ANDAMENTO');
 expect(verificada.quantidadeExecutada).toBe(0);
});

describe('regularização de ocorrências',()=>{
  it('prova verificada permite iniciar descrição sem inventar percentual ou aprovar conclusão',async()=>{
    const o=ocorrencia({metaQuantidade:null,modoRegistro:'DESCRITIVO',exigeAtividade:false,minimoAtividadesVerificadas:0,status:StatusOcorrencia.NAO_INICIADO});
    const r=await resumoMedicao(gerente(0,0,0,0,0,1,0),o);
    expect(r.metaAtingida).toBe(true);
    expect(r.progressoPercentual).toBeNull();
    expect(proximoStatusAutomatico(o,r)).toBe('EM_ANDAMENTO');
  });
  it('prova sem contribuição não completa meta quantitativa',async()=>{
    const o=ocorrencia({exigeAtividade:false});
    const r=await resumoMedicao(gerente(0,0,0,0,0,1,0),o);
    expect(r.metaAtingida).toBe(false);
    expect(r.progressoPercentual).toBe(0);
  });
  it('revalida atividade obrigatória na decisão descritiva histórica',async()=>{
    const o=ocorrencia({metaQuantidade:null,modoRegistro:'DESCRITIVO',status:StatusOcorrencia.CONCLUIDO,exigeAtividade:true});
    expect(await medicaoAprovadaAtual(gerente(0,0,0,0,0),o)).toEqual({quantidade:null,apta:false});
    expect(o.status).toBe(StatusOcorrencia.CONCLUIDO);
  });
  it('não revoga a aprovação física descritiva apenas pela falta de documento',async()=>{
    const o=ocorrencia({metaQuantidade:null,modoRegistro:'DESCRITIVO',status:StatusOcorrencia.CONCLUIDO,exigeAtividade:false});
    expect(await medicaoAprovadaAtual(gerente(0,0,0,0,0),o)).toEqual({quantidade:null,apta:true});
  });
});

test('requisitos de foto e relatório recebem mínimo coerente',()=>{
  expect(minimoInicialEvidencias({evidenciaExigida:'AMBOS'})).toBe(2);
  expect(minimoInicialEvidencias({minimoFotos:2,minimoRelatorios:1,minimoEvidenciasLivres:2})).toBe(5);
});
test('não aceita data efetiva futura',()=>{
  expect(()=>validarDadosOcorrencia({dataRealizada:'9999-12-31'})).toThrow(/futura/);
});
test('encerramento excepcional não congela contribuições em revisão',async()=>{
  const r=await resumoMedicao(gerente(0,0,0,0,0),ocorrencia({exigeAtividade:false}));
  expect(()=>validarEncerramentoOcorrencia({permiteEncerramentoExcepcional:true},{...r,registrosExecucaoPendentes:true},true)).toThrow(/pendentes ou em revisão/);
  expect(()=>validarEncerramentoOcorrencia({permiteEncerramentoExcepcional:false},r,true)).toThrow(/desabilitado/);
  expect(()=>validarEncerramentoOcorrencia({permiteEncerramentoExcepcional:true},r,true)).not.toThrow();
});

// B07: a ausência de meta não transforma uma aprovação antiga em medição permanente.
describe('B07 — origem da medição aprovada',()=>{
  const legada=ocorrencia({metaQuantidade:null,status:StatusOcorrencia.CONCLUIDO,quantidadeAprovada:'10.000',exigeAtividade:false});
  it('reduz contribuição quando os registros que sustentavam a aprovação são retirados',async()=>{
    const resultado=await medicaoAprovadaAtual(gerente(0,0,0,0,0),{...legada,origemMedicaoAprovada:'REGISTROS'});
    expect(resultado).toEqual({quantidade:'0.000',apta:false});
  });
  it('não aumenta uma medição já aprovada apenas pela chegada de novos registros',async()=>{
    const resultado=await medicaoAprovadaAtual(gerente(12,0,0,0,0),{...legada,origemMedicaoAprovada:'REGISTROS'});
    expect(resultado).toEqual({quantidade:'10.000',apta:true});
  });
  it('preserva declaração sem fontes identificáveis',async()=>{
    expect(await medicaoReconhecidaAtual(gerente(0,0,0,0,0),legada)).toBe('10.000');
  });
  it('reconhece fonte histórica mesmo quando o lançamento está excluído',async()=>{
    const manager={query:jest.fn<(...args:unknown[])=>Promise<unknown>>()
      .mockResolvedValueOnce([{total:'0',registrada:'0',fontes:'1'}])
      .mockResolvedValueOnce([{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}])
      .mockResolvedValueOnce([{total:'0',fotos:'0',relatorios:'0'}])} as unknown as EntityManager;
    expect(await medicaoAprovadaAtual(manager,legada)).toEqual({quantidade:'0.000',apta:false});
  });
});
