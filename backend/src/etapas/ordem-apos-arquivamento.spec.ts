import { describe, expect, it } from '@jest/globals';
import { ordemAposArquivamento } from './ordem-apos-arquivamento.js';
const nao = null;
const arquivada = new Date('2026-11-05T16:00:00Z');

describe('ordem de etapas após arquivamento', () => {
  it('retira etapa da posição 3 e compacta as ativas', () => {
    const todas = [
      { id: '1', arquivadoEm: nao }, { id: '2', arquivadoEm: nao },
      { id: '3', arquivadoEm: arquivada }, { id: '4', arquivadoEm: nao },
    ];
    const resultado = ordemAposArquivamento(todas, todas[2], true);
    expect(resultado.map(e => e.id)).toEqual(['1','2','4','3']);
    expect(resultado.slice(0,3).map((e,i) => [e.id,i+1])).toEqual([['1',1],['2',2],['4',3]]);
  });
  it('reativa sempre no final da sequência ativa e preserva arquivadas depois', () => {
    const todas = [
      { id: '1', arquivadoEm: nao }, { id: '2', arquivadoEm: nao },
      { id: '3', arquivadoEm: arquivada }, { id: '4', arquivadoEm: arquivada },
    ];
    const resultado = ordemAposArquivamento(todas, { id:'3', arquivadoEm: nao }, false);
    expect(resultado.map(e => e.id)).toEqual(['1','2','3','4']);
    expect(resultado[2].arquivadoEm).toBeNull();
  });
});
