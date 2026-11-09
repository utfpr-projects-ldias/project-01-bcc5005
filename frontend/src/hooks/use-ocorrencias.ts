import { useState, useEffect, useCallback } from 'react';

export interface Ocorrencia {
  id: string;
  contratoId: string;
  entregavelId: string;
  titulo: string;
  periodoInicio: string;
  periodoFim: string;
  prazo: string;
  dataRealizada?: string;
  estado: 'PENDENTE' | 'EXECUTADO' | 'ATRASADO' | 'CANCELADO';
  quantidade: number;
  observacoes?: string;
  tipo?: string;
}

export function useOcorrencias(contratoId?: string) {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const buscarOcorrencias = useCallback(async () => {
    if (!contratoId) return;
    setLoading(true);
    setErro(null);

    try {
      const res = await fetch(`${API_URL}/contratos/${contratoId}/ocorrencias`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Erro ao carregar as ocorrências do contrato.');
      }

      const dados = await res.json();
      setOcorrencias(Array.isArray(dados) ? dados : dados.data || []);
    } catch (err: any) {
      setErro(err.message || 'Erro desconhecido ao carregar ocorrências.');
    } finally {
      setLoading(false);
    }
  }, [contratoId, API_URL]);

  useEffect(() => {
    if (contratoId) {
      buscarOcorrencias();
    }
  }, [contratoId, buscarOcorrencias]);

  const criarOcorrenciaManual = async (payload: {
    contratoId: string;
    entregavelId: string;
    titulo: string;
    periodoInicio: string;
    periodoFim: string;
    prazo: string;
    quantidade: number;
    observacoes?: string;
  }) => {
    setErro(null);
    try {
      const res = await fetch(`${API_URL}/ocorrencias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Erro ao criar ocorrência quantitativa manual.');
      }

      await buscarOcorrencias();
    } catch (err: any) {
      setErro(err.message || 'Falha ao registrar ocorrência.');
      throw err;
    }
  };

  return {
    ocorrencias,
    loading,
    erro,
    buscarOcorrencias,
    criarOcorrenciaManual,
  };
}