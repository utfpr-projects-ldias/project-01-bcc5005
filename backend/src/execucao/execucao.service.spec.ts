import { jest } from '@jest/globals';
import { ExecucaoService } from './execucao.service.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { ModoCalculo } from '../contratos/modo-calculo.enum.js';
const ator={id:'u',perfil:PerfilUsuario.ADMINISTRADOR,email:'qa@example.invalid',supertokensUserId:'qa'};
function cenario(){const c={id:'c',status:'EM_EXECUCAO',modoCalculo:'SIMPLES',arquivadoEm:null};const et={id:'t',status:'PLANEJADA',arquivadoEm:null};const e={id:'e',contratoId:'c',etapaId:'t',nome:'Serviço',tipo:'UNICO',percentualExecucao:null as string|null,peso:null as string|null,statusExecucao:null as string|null,situacaoComprovacao:null,quantidadeRealizada:null as string|null,quantidadePrevista:null as string|null,arquivadoEm:null};
const find=async(k:unknown)=>k===Contrato?c:k===Etapa?et:k===Entregavel?e:null;const m={findOne:jest.fn(find),findOneBy:jest.fn(find),findBy:jest.fn(async(k:unknown)=>k===Entregavel?[e]:k===Etapa?[et]:k===Ocorrencia?[]:[]),save:jest.fn(async(_k:unknown,v:unknown)=>v),countBy:jest.fn(async()=>0),query:jest.fn(async()=>[]),update:jest.fn(async(k:unknown,_f:unknown,campos:object)=>{Object.assign(k===Etapa?et:e,campos);return {affected:1};})};const audit={registrarNaTransacao:jest.fn(async()=>undefined)};const ds={transaction:async (...args:unknown[])=>{const fn=args.at(-1) as (x:typeof m)=>Promise<unknown>;return fn(m);}};return {c,e,m,audit,service:new ExecucaoService(ds as never,audit as never)};}
test('100% físico não fecha comprovação e grava auditoria',async()=>{const x=cenario();const r=await x.service.atualizar('c','e',{percentualManual:100},ator);expect(r.avancoSimples).toBe(100);expect(r.entregaveis[0].statusEntregavel).toBe('EM_ANDAMENTO');expect(x.e.statusExecucao).toBe('EM_ANDAMENTO');expect(x.e.situacaoComprovacao).toBeNull();expect(x.audit.registrarNaTransacao).toHaveBeenCalledTimes(3);});
test('peso inválido e versão antiga não escrevem',async()=>{const x=cenario();const r=await x.service.consultar('c');await expect(x.service.atualizarPesos('c',{versao:r.versaoPesos,pesos:[{entregavelId:'e',peso:'101'}]},ator)).rejects.toThrow();await expect(x.service.atualizarPesos('c',{versao:'antiga',pesos:[{entregavelId:'e',peso:'100'}]},ator)).rejects.toThrow();expect(x.m.save).not.toHaveBeenCalled();});
test('contrato suspenso recusa atualização física',async()=>{const x=cenario();x.c.status='SUSPENSO';await expect(x.service.atualizar('c','e',{percentualManual:50},ator)).rejects.toThrow();expect(x.m.save).not.toHaveBeenCalled();});

test('modo simples e ponderado persistem, com versão e validação de pesos', async () => {
  const x = cenario();
  const v0 = (await x.service.consultar('c')).versaoPesos;
  const parcial = await x.service.atualizarModoCalculo('c', { versao: v0, modoCalculo: ModoCalculo.PONDERADO }, ator);
  expect(parcial.configuracaoPendente).toBe(true);
  expect(parcial.avanco).toBe(0);
  expect(x.c.modoCalculo).toBe('PONDERADO');
  x.e.peso = '100';
  const v1 = (await x.service.consultar('c')).versaoPesos;
  await expect(x.service.atualizarModoCalculo('c', { versao: 'antiga', modoCalculo: ModoCalculo.PONDERADO }, ator)).rejects.toThrow();
  const ponderado = await x.service.atualizarModoCalculo('c', { versao: v1, modoCalculo: ModoCalculo.PONDERADO }, ator);
  expect(ponderado.modoCalculo).toBe('PONDERADO');
  expect(x.audit.registrarNaTransacao).toHaveBeenCalledTimes(1);
  const simples = await x.service.atualizarModoCalculo('c', { versao: ponderado.versaoPesos, modoCalculo: ModoCalculo.SIMPLES }, ator);
  expect(simples.modoCalculo).toBe('SIMPLES');
  expect(x.e.peso).toBe('100');
  expect(x.audit.registrarNaTransacao).toHaveBeenCalledTimes(2);
});


test('conciliação quantitativa troca a fonte em uma transação e preserva o valor anterior na auditoria', async () => {
  const x = cenario();
  x.e.tipo = 'QUANTITATIVO';
  x.e.quantidadeRealizada = '6.500';
  await x.service.usarOcorrencias('c', 'e', ator);
  expect(x.e.quantidadeRealizada).toBeNull();
  expect(x.m.countBy).toHaveBeenCalledWith(Ocorrencia, expect.objectContaining({ contratoId: 'c', entregavelId: 'e' }));
  expect(x.audit.registrarNaTransacao).toHaveBeenCalledWith(expect.anything(), ator,
    expect.objectContaining({ dadosAnteriores: expect.objectContaining({ quantidadeRealizada: '6.500' }),
      dadosPosteriores: expect.objectContaining({ quantidadeRealizada: null, fonte: 'OCORRENCIAS' }) }));
});

test('conciliação não altera o valor quando já existem ocorrências', async () => {
  const x = cenario();
  x.e.tipo = 'QUANTITATIVO';
  x.e.quantidadeRealizada = '6.500';
  x.m.countBy.mockResolvedValueOnce(1);
  await expect(x.service.usarOcorrencias('c', 'e', ator)).rejects.toThrow(/Já existem ocorrências/);
  expect(x.e.quantidadeRealizada).toBe('6.500');
  expect(x.m.save).not.toHaveBeenCalled();
});


test('peso individual grava um entregável sem exigir soma completa no modo simples', async () => {
  const x = cenario();
  const versao = (await x.service.consultar('c')).versaoPesos;
  const resultado = await x.service.atualizarPesoIndividual('c', 'e', { versao, peso: '20' }, ator);
  expect(x.e.peso).toBe('20');
  expect(x.c.modoCalculo).toBe('SIMPLES');
  expect(resultado.somaPesos).toBe(20);
  expect(x.audit.registrarNaTransacao).toHaveBeenCalledTimes(1);
});

test('peso individual rejeita versão antiga sem gravar', async () => {
  const x = cenario();
  await expect(x.service.atualizarPesoIndividual('c', 'e', { versao: '0'.repeat(64), peso: '30' }, ator)).rejects.toThrow();
  expect(x.m.save).not.toHaveBeenCalled();
});

test('redistribuição parcial mantém os pesos e o modo ponderado com auditoria', async () => {
  const x = cenario(); x.e.peso = '100'; x.c.modoCalculo = 'PONDERADO';
  const versao = (await x.service.consultar('c')).versaoPesos;
  const resumo = await x.service.atualizarPesoIndividual('c', 'e', { versao, peso: '20' }, ator);
  expect(x.e.peso).toBe('20');
  expect(x.c.modoCalculo).toBe('PONDERADO');
  expect(resumo.somaPesos).toBe(20);
  expect(resumo.modoCalculo).toBe('PONDERADO');
  expect(resumo.configuracaoPendente).toBe(true);
  expect(x.audit.registrarNaTransacao).toHaveBeenCalledTimes(1);
});


test.each(['UNICO','CONTINUO','QUANTITATIVO','RECORRENTE','MARCO'])('R49: novo %s começa em zero sem execução reconhecida',async tipo=>{
  const x=cenario(); x.e.tipo=tipo;
  if(tipo==='QUANTITATIVO')x.e.quantidadePrevista='100';
  const r=await x.service.consultar('c');
  expect(r.entregaveis[0].percentualExecucao).toBe(0);
  expect(r.avancoSimples).toBe(0);
});
test('R49: participação utiliza o modo de cálculo, não peso cadastral ignorado',async()=>{
  const x=cenario();x.e.peso='20';
  expect((await x.service.consultar('c')).entregaveis[0].participacaoOperacional).toBe(100);
  x.c.modoCalculo='PONDERADO';
  expect((await x.service.consultar('c')).entregaveis[0].participacaoOperacional).toBe(20);
  x.e.peso='100';
  expect((await x.service.consultar('c')).entregaveis[0].participacaoOperacional).toBe(100);
});

test('solicitação de conclusão congela modo de cálculo e pesos', async () => {
  const x = cenario();
  const versao = (await x.service.consultar('c')).versaoPesos;
  Object.assign(x.c, { conclusaoSolicitadaEm: new Date() });
  await expect(x.service.atualizarModoCalculo('c', { versao, modoCalculo: ModoCalculo.PONDERADO }, ator)).rejects.toThrow();
  await expect(x.service.atualizarPesoIndividual('c', 'e', { versao, peso: '20' }, ator)).rejects.toThrow();
  expect(x.m.save).not.toHaveBeenCalled();
});
