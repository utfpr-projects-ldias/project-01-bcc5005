import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { EditarEntregavelDto } from '../entregaveis/dto/planejamento-entregavel.dto.js';
import { AtualizarEtapaDto } from '../etapas/dto/atualizar-etapa.dto.js';
import { AtualizarOcorrenciaDto } from '../ocorrencias/dto/atualizar-ocorrencia.dto.js';
import { chavesDefinidas } from './chaves-definidas.js';

describe('PATCH parcial sobre DTOs TypeScript ES2023', () => {
  it('não confunde campos de classe undefined com dados enviados pelo cliente', () => {
    const dto = plainToInstance(EditarEntregavelDto, { nome: 'Teste', peso: '12.50' });
    expect(Object.hasOwn(dto, 'codigo')).toBe(true);
    expect(chavesDefinidas(dto).sort()).toEqual(['nome', 'peso']);
  });
  it('distingue null explícito de campo omitido', () => {
    const dto = plainToInstance(EditarEntregavelDto, { codigo: null });
    expect(chavesDefinidas(dto)).toEqual(['codigo']);
    expect(chavesDefinidas(plainToInstance(EditarEntregavelDto, {}))).toEqual([]);
  });
  it('autorizações granulares de ocorrência ignoram outros campos opcionais ausentes', () => {
    const dto = plainToInstance(AtualizarOcorrenciaDto, { pesoPeriodo: '10' });
    expect(chavesDefinidas(dto)).toEqual(['pesoPeriodo']);
    expect(Object.hasOwn(dto, 'titulo')).toBe(true);
  });
  it('não aceita PATCH sem conteúdo em etapas transformadas', () => {
    const dto = plainToInstance(AtualizarEtapaDto, { nome: 'Etapa' });
    expect(chavesDefinidas(dto)).toEqual(['nome']);
  });
});
