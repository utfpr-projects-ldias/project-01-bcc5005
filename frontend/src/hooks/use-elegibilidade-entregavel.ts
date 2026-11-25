"use client";
import { useConsulta } from '@/app/components/provedor-consultas';
import { consultarElegibilidadeEntregavel } from '@/lib/entregaveis';
export function useElegibilidadeEntregavel(contratoId: string, id: string, habilitada = true) {
  return useConsulta(['entregaveis','contrato',contratoId,'elegibilidade-conclusao',id], signal => consultarElegibilidadeEntregavel(contratoId,id,signal), { habilitada: habilitada && Boolean(id), validadeMs: 0 });
}
