import { jest } from '@jest/globals';
import { ConfiguracaoOcorrenciasService } from './configuracao-ocorrencias.service.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';
import { BadRequestException, ConflictException } from '@nestjs/common';

import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const ator = { id: 'admin', perfil: PerfilUsuario.ADMINISTRADOR, supertokensUserId: 'admin-st', email: 'admin@example.invalid' };
const contrato = { id: 'contrato', arquivadoEm: null, status: 'EM_EXECUCAO', inicioVigencia: '2026-01-01', terminoVigencia: '2027-12-31' };
const entregavel = { id: 'entregavel', contratoId: 'contrato', etapaId:'etapa', arquivadoEm: null, statusExecucao: null,
  tipo: TipoEntregavel.UNICO, inicioPrevisto: null, terminoPrevisto: null, quantidadePrevista: null, unidadeMedida: null,
  periodicidade: null, configuracaoPeriodicidade: null, percentualExecucao: null, quantidadeRealizada: null,
  dataEfetivaMarco: null, criterioConclusao: 'Comprovação textual' };
function ambiente(ocorrencias=0) {
  const e = { ...entregavel };
  const manager = { getRepository: jest.fn(() => ({findOne: jest.fn(async () => ({...ator, ativo:true}))})), findOne: jest.fn(async (tipo: { name: string }) => tipo.name === 'Contrato' ? contrato : e),
    findOneBy: jest.fn(async (tipo:{name:string}) => tipo.name==='Etapa'?{id:'etapa',status:'PLANEJADA',arquivadoEm:null}:null), count: jest.fn(async () => ocorrencias),
    save: jest.fn().mockImplementation((_t, obj) => Promise.resolve(obj)),
    create: jest.fn().mockImplementation((_t, obj) => obj),
  };
  const ds = { transaction: jest.fn((callback: (value: unknown) => Promise<unknown>) => callback(manager)) };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  return { service: new ConfiguracaoOcorrenciasService(ds as never, auditoria as never), manager, auditoria };
}
test('API não altera o tipo persistido do entregável, mesmo com LISTA válida', async () => {
  const { service } = ambiente();
  await expect(service.atualizar('contrato', 'entregavel', { modoVisualizacao: 'LISTA', tipoOperacional: TipoEntregavel.QUANTITATIVO }, ator)).rejects.toBeInstanceOf(ConflictException);
});
test('visualização incompatível com tipo informado continua sendo erro de entrada', async () => {
  const { service } = ambiente();
  await expect(service.atualizar('contrato', 'entregavel', { modoVisualizacao: 'CALENDARIO', tipoOperacional: TipoEntregavel.QUANTITATIVO }, ator)).rejects.toBeInstanceOf(BadRequestException);
});
test('configuração rejeita troca com ocorrências persistidas', async () => {
  const { service, manager } = ambiente(1);
  // O modo é derivado do tipo persistido: a API de configuração não altera planejamento.
  await expect(service.atualizar('contrato', 'entregavel', { modoVisualizacao: 'LISTA', tipoOperacional: TipoEntregavel.QUANTITATIVO, quantidadePrevista: '12', unidadeMedida: 'horas' }, ator)).rejects.toBeInstanceOf(ConflictException);
  expect(manager.save).not.toHaveBeenCalled();
});
test('configuração guarda entrega e configuração numa transação e audita', async () => {
  const { service, manager, auditoria } = ambiente();
  const salvo = await service.atualizar('contrato', 'entregavel', { modoVisualizacao: 'LISTA', tipoOperacional: TipoEntregavel.UNICO }, ator);
  expect(salvo.tipoOperacional).toBe(TipoEntregavel.UNICO);
  // Apenas a configuração é criada; tipo/quantidade do entregável são imutáveis aqui.
  expect(manager.save).toHaveBeenCalledTimes(1);
  expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
});

test('impede configurar a agenda em etapa encerrada', async () => {
  const {service,manager}=ambiente();
  manager.findOneBy.mockImplementation(async tipo=>tipo.name==='Etapa'?{id:'etapa',status:'ENCERRADA',arquivadoEm:null}:null);
  await expect(service.atualizar('contrato','entregavel',{modoVisualizacao:'LISTA',tipoOperacional:TipoEntregavel.UNICO},ator)).rejects.toThrow('Reabra a etapa');
  expect(manager.save).not.toHaveBeenCalled();
});

test('atualiza projeção obsoleta mesmo quando o modo visual permanece LISTA', async () => {
  const {service,manager}=ambiente();
  manager.findOneBy.mockImplementation(async tipo=>tipo.name==='Etapa'?{id:'etapa',status:'PLANEJADA',arquivadoEm:null}: {entregavelId:'entregavel',contratoId:'contrato',modoVisualizacao:'LISTA',tipoOperacional:TipoEntregavel.UNICO,quantidadePrevista:null,unidadeMedida:null,periodicidade:null,inicioPrevisto:'2026-01-01',terminoPrevisto:null} as never);
  await service.atualizar('contrato','entregavel',{modoVisualizacao:'LISTA',tipoOperacional:TipoEntregavel.UNICO},ator);
  expect(manager.save).toHaveBeenCalledWith(expect.anything(),expect.objectContaining({inicioPrevisto:null}));
});
