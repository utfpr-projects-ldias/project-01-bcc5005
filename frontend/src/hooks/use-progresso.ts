import { useState, useEffect, useCallback } from 'react';

export interface ProgressoEntregable {
  entregavelId: string;
  tipo: 'QUANTITATIVO' | 'RECORRENTE' | 'MARCO' | 'UNICO' | 'CONTINUO';
  realizado: number;
  previsto: number;
  percentualExecucao: number; // 0 a 100 (teto 100%)
  percentualComprovação: number; // Independente
  pesoOperacional?: number;
  dataEfetivaMarco?: string;
}

export interface ProgressoContrato {
  contratoId: string;
  avancoSimples: number;
  avancoPonderado: number;
  pesosValidos: boolean; // Soma dos pesos == 100%
  entregaveis: ProgressoEntregable[];
}

export function useProgresso(contratoId?: string) {
  const [progresso, setProgresso] = useState<ProgressoContrato | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const buscarProgresso = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    setErro(null);

    try {
      const res = await fetch(`${API_URL}/contratos/${contratoId}/progresso`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Erro ao carregar os dados de progresso e execução.');
      }

      const dados = await res.json();
      setProgresso(dados);
    } catch (err: any) {
      setErro(err.message || 'Erro desconhecido ao carregar progresso.');
    } finally {
      setLoading(false);
    }
  }, [contratoId, API_URL]);

  useEffect(() => {
    if (contratoId) {
      buscarProgresso();
    }
  }, [contratoId, buscarProgresso]);

  const atualizarExecucao = async (
    entregavelId: string,
    payload: { realizado?: number; dataEfetivaMarco?: string; pesoOperacional?: number }
  ) => {
    setErro(null);
    try {
      const res = await fetch(`${API_URL}/entregaveis/${entregavelId}/execucao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Erro ao atualizar execução do entregável.');
      }

      // Recarrega o cálculo determinístico do contrato
      await buscarProgresso();
    } catch (err: any) {
      setErro(err.message || 'Falha ao registrar atualização.');
      throw err;
    }
  };

  return {
    progresso,
    loading,
    erro,
    buscarProgresso,
    atualizarExecucao,
  };
}