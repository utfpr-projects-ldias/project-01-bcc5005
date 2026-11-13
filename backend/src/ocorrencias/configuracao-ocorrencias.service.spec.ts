import { ConfiguracaoOcorrenciasService } from './configuracao-ocorrencias.service.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';
import { BadRequestException, ConflictException } from '@nestjs/common';

const ator = { id: 'admin', perfil: 'ADMINISTRADOR' } as never;
const contrato = { id: 'contrato', arquivadoEm: null, status: 'EM_EXECUCAO', inicioVigencia: '2026-01-01', terminoVigencia: '2027-12-31' };
const entregavel = { id: 'entregavel', contratoId: 'contrato', arquivadoEm: null, statusExecucao: null,
  tipo: TipoEntregavel.UNICO, inicioPrevisto: null, terminoPrevisto: null, quantidadePrevista: null, unidadeMedida: null,
  periodicidade: null, configuracaoPeriodicidade: null, percentualExecucao: null, quantidadeRealizada: null,
  dataEfetivaMarco: null, criterioConclusao: 'Comprovação textual' };
function ambiente(ocorrencias=0) {
  const e = { ...entregavel };
  const manager = { findOne: jest.fn().mockImplementation((tipo: { name: string }) => Promise.resolve(tipo.name === 'Contrato' ? contrato : e)),
    findOneBy: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(ocorrencias),
    save: jest.fn().mockImplementation((_t, obj) => Promise.resolve(obj)),
    create: jest.fn().mockImplementation((_t, obj) => obj),
  };
  const ds = { transaction: jest.fn((callback: (value: unknown) => Promise<unknown>) => callback(manager)) };
  const auditoria = { registrarNaTransacao: jest.fn().mockResolvedValue(undefined) };
  return { service: new ConfiguracaoOcorrenciasService(ds as never, auditoria as never), manager, auditoria };
}
test('configuração quantitativa exige meta e unidade no serviço (além do DTO)', async () => {
  const { service } = ambiente();
  await expect(service.atualizar('contrato', 'entregavel', { tipoOperacional: TipoEntregavel.QUANTITATIVO }, ator)).rejects.toBeInstanceOf(BadRequestException);
});
test('configuração rejeita troca com ocorrências persistidas', async () => {
  const { service } = ambiente(1);
  await expect(service.atualizar('contrato', 'entregavel', { tipoOperacional: TipoEntregavel.QUANTITATIVO, quantidadePrevista: '12', unidadeMedida: 'horas' }, ator)).rejects.toBeInstanceOf(ConflictException);
});
test('configuração guarda entrega e configuração numa transação e audita', async () => {
  const { service, manager, auditoria } = ambiente();
  const salvo = await service.atualizar('contrato', 'entregavel', { tipoOperacional: TipoEntregavel.QUANTITATIVO, quantidadePrevista: '12.50', unidadeMedida: 'horas' }, ator);
  expect(salvo.tipoOperacional).toBe(TipoEntregavel.QUANTITATIVO);
  expect(manager.save).toHaveBeenCalledTimes(2);
  expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
});
