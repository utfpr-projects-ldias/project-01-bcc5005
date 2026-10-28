import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { AtualizarContratoDto } from './atualizar-contrato.dto.js';
import { CriarContratoDto } from './criar-contrato.dto.js';
import { ModoCalculo } from '../modo-calculo.enum.js';
import { StatusContrato } from '../status-contrato.enum.js';

const base = {
  numeroContrato: '2026/001',
  orgaoContratante: 'UTFPR',
  objeto: 'Prestação de serviços',
  inicioVigencia: '2026-10-17',
  terminoVigencia: '2027-10-16',
  status: StatusContrato.PLANEJAMENTO,
  modoCalculo: ModoCalculo.SIMPLES,
};

const validarCriacao = (dados: Record<string, unknown>) =>
  validateSync(plainToInstance(CriarContratoDto, dados), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

const validarAtualizacao = (dados: Record<string, unknown>) =>
  validateSync(plainToInstance(AtualizarContratoDto, dados), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('DTOs de contratos — validação de entrada', () => {
  it('aceita somente os sete campos obrigatórios', () => {
    expect(validarCriacao(base)).toHaveLength(0);
  });

  it.each(Object.keys(base))('rejeita ausência de %s', (campo) => {
    const dados: Record<string, unknown> = { ...base };
    delete dados[campo];
    expect(validarCriacao(dados).length).toBeGreaterThan(0);
  });

  it('aceita campos opcionais sem exigir fiscal ou responsável', () => {
    expect(validarCriacao({
      ...base,
      processoAdministrativo: null,
      unidadeResponsavel: 'Unidade',
      descricao: 'Descrição',
      dataAssinatura: null,
      responsavelInternoId: null,
      fiscalGestor: 'Fiscal',
      observacoes: 'Observações',
    })).toHaveLength(0);
  });

  it('rejeita estados e modos de cálculo fora dos enums', () => {
    expect(validarCriacao({ ...base, status: 'ABERTO' }).length).toBeGreaterThan(0);
    expect(validarCriacao({ ...base, modoCalculo: 'FINANCEIRO' }).length).toBeGreaterThan(0);
  });

  it('rejeita propriedade financeira e ID definidos pelo cliente', () => {
    expect(validarCriacao({ ...base, valorContrato: 1000 }).length).toBeGreaterThan(0);
    expect(validarCriacao({ ...base, id: 'forjado' }).length).toBeGreaterThan(0);
  });

  it('rejeita formato inválido de datas', () => {
    expect(validarCriacao({ ...base, inicioVigencia: '17/10/2026' }).length).toBeGreaterThan(0);
  });

  it('permite PATCH parcial e limpeza explícita de opcionais', () => {
    expect(validarAtualizacao({ objeto: 'Objeto atualizado' })).toHaveLength(0);
    expect(validarAtualizacao({ descricao: null, fiscalGestor: null })).toHaveLength(0);
  });

  it('rejeita null em campo obrigatório e propriedade não prevista no PATCH', () => {
    expect(validarAtualizacao({ objeto: null }).length).toBeGreaterThan(0);
    expect(validarAtualizacao({ senha: 'invasao' }).length).toBeGreaterThan(0);
  });
});
