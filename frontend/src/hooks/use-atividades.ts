import { useState, useEffect, useCallback } from 'react';

export interface Atividade {
  id: string;
  contratoId: string;
  titulo: string;
  dataHora: string;
  descricao: string;
  tipo: string;
  responsavel: string;
  participantes?: string;
  local?: string;
  duracao?: string;
  observacoes?: string;
  entregaveis?: { id: string; titulo?: string; codigoPublico?: string }[];
}

export function useAtividades(contratoId?: string) {
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const buscarAtividades = useCallback(async (filtros?: { dataInicio?: string; dataFim?: string }) => {
    if (!contratoId) return;
    setLoading(true);
    setErro(null);

    try {
      let url = `${API_URL}/atividades?contratoId=${contratoId}`;
      if (filtros?.dataInicio && filtros?.dataFim) {
        url += `&dataInicio=${filtros.dataInicio}&dataFim=${filtros.dataFim}`;
      }

      const res = await fetch(url, {
        credentials: 'include', // Mantém a sessão/cookies do SuperTokens
      });

      if (!res.ok) {
        throw new Error('Erro ao carregar as atividades do diário.');
      }

      const resultado = await res.json();
      // Compatível com retorno paginado ou array direto
      setAtividades(resultado.data || resultado);
    } catch (err: any) {
      setErro(err.message || 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [contratoId, API_URL]);

  useEffect(() => {
    if (contratoId) {
      buscarAtividades();
    }
  }, [contratoId, buscarAtividades]);

  const criarAtividade = async (dados: Omit<Atividade, 'id'>) => {
    const res = await fetch(`${API_URL}/atividades`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(dados),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Erro ao registrar atividade.');
    }

    const novaAtividade = await res.json();
    setAtividades((prev) => [novaAtividade, ...prev]);
    return novaAtividade;
  };

  return {
    atividades,
    loading,
    erro,
    buscarAtividades,
    criarAtividade,
  };
}