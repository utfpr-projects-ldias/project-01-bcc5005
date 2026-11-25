import { quantidadeDecimal, milesimos } from '../common/quantidade-exata.js';
import type { CriarLancamentoDto } from './lancamentos.dto.js';
export type PedidoManual = { valor: string; data: string; observacao: string | null; ocorrenciaId: string | null };
export function pedidoManual(dto: CriarLancamentoDto, valor = quantidadeDecimal(milesimos(dto.valor))): PedidoManual {
  return { valor, data: dto.data, observacao: dto.observacao?.trim() || null, ocorrenciaId: dto.ocorrenciaId ?? null };
}
export function mesmoPedido(original: PedidoManual, atual: PedidoManual): boolean {
  return original.valor===atual.valor && original.data===atual.data && original.observacao===atual.observacao && original.ocorrenciaId===atual.ocorrenciaId;
}
