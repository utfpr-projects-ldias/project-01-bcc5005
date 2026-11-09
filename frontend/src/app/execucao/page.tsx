'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useContrato } from '@/hooks/use-contratos';
import { useProgresso, ProgressoEntregable } from '@/hooks/use-progresso';

export default function ExecucaoProgressoPage() {
  const { contratos = [], carregando: loadingContratos } = useContrato('' as any) as any;
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string>('');

  const { progresso, loading, erro, atualizarExecucao } = useProgresso(contratoSelecionadoId);

  // Estados locais para edição rápida de valores operacionais
  const [edicaoValores, setEdicaoValores] = useState<{ [entregavelId: string]: any }>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  // Seleciona o primeiro contrato automaticamente quando a lista carregar
  useEffect(() => {
    if (contratos && contratos.length > 0 && !contratoSelecionadoId) {
      setContratoSelecionadoId(contratos[0].id);
    }
  }, [contratos, contratoSelecionadoId]);

  const handleInputChange = (entregavelId: string, campo: string, valor: any) => {
    setEdicaoValores((prev) => ({
      ...prev,
      [entregavelId]: {
        ...prev[entregavelId],
        [campo]: valor,
      },
    }));
  };

  const handleSalvarExecucao = async (entregavelId: string) => {
    const dados = edicaoValores[entregavelId];
    if (!dados) return;

    setSalvandoId(entregavelId);
    setSucessoMsg(null);
    setErroLocal(null);

    try {
      await atualizarExecucao(entregavelId, dados);
      setSucessoMsg(`Execução do entregável atualizada com sucesso!`);
    } catch (err: any) {
      setErroLocal(err.message || 'Erro ao registrar atualização de execução.');
    } finally {
      setSalvandoId(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header Fixo com Logo Minimalista */}
      <header className="w-full border-b border-brand-green/20 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/favicon.ico"
              alt="Ícone PRD"
              width={32}
              height={32}
              unoptimized
              className="h-8 w-8 object-contain rounded-md"
            />
            <span className="font-bold text-xl tracking-wide text-brand-neon group-hover:opacity-90 transition-opacity">
              PRD <span className="text-foreground font-normal text-base ml-1">/ Execução</span>
            </span>
          </Link>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 flex flex-col gap-8">
        
        {/* Bloco de Título e Seletor de Contrato Alinhado à Direita */}
        <div className="bg-card border border-brand-green/20 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
              Avanço Físico e <span className="text-brand-neon">Execução Operacional</span>
            </h1>
            <p className="text-foreground/70 mt-1 max-w-2xl">
              Cálculo determinístico por entregável. A comprovação documental é independente (RB-07/08): 100% físico não gera status de “Comprovado” até a TEC10/S05.
            </p>
          </div>

          {/* Rótulo e Select lado a lado orientados à direita */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-start md:justify-end">
            <label htmlFor="contrato-select" className="text-xs font-semibold uppercase tracking-wider text-foreground/70 whitespace-nowrap">
              Contrato:
            </label>
            <select
              id="contrato-select"
              className="border border-brand-green/30 rounded-xl px-4 py-2.5 bg-background text-foreground text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-green transition-all min-w-[240px]"
              value={contratoSelecionadoId}
              onChange={(e) => setContratoSelecionadoId(e.target.value)}
              disabled={loadingContratos}
            >
              {contratos.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.codigoPublico || c.titulo || `Contrato ${c.id.substring(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Mensagens de Erro Globais ou Locais em Vermelho */}
        {(erro || erroLocal) && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-500 dark:text-red-400 p-4 rounded-xl text-sm font-semibold flex items-center gap-3 shadow-xs">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{erro || erroLocal}</span>
          </div>
        )}

        {sucessoMsg && (
          <div className="bg-brand-green/10 border border-brand-green/40 text-brand-neon p-4 rounded-xl text-sm font-medium">
            {sucessoMsg}
          </div>
        )}

        {/* Cards de Resumo Consolidado do Contrato */}
        {progresso && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Avanço Simples */}
            <div className="bg-card border border-brand-green/20 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground/70">Avanço Físico Simples (Média)</span>
                <h3 className="text-4xl font-extrabold text-foreground mt-2">
                  {progresso.avancoSimples.toFixed(1)}%
                </h3>
              </div>
              <div className="w-full bg-background rounded-full h-3 mt-4 overflow-hidden border border-brand-green/20">
                <div 
                  className="bg-brand-green h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(progresso.avancoSimples, 100)}%` }}
                />
              </div>
            </div>

            {/* Avanço Ponderado */}
            <div className="bg-card border border-brand-green/20 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground/70">Avanço Ponderado (Pesos)</span>
                  <h3 className="text-4xl font-extrabold text-brand-neon mt-2">
                    {progresso.avancoPonderado.toFixed(1)}%
                  </h3>
                </div>
                {!progresso.pesosValidos ? (
                  <span className="text-[11px] px-2.5 py-1 bg-amber-500/10 text-amber-500 rounded-full font-medium border border-amber-500/20 text-center">
                    Configuração Pendente (Soma != 100%)
                  </span>
                ) : (
                  <span className="text-[11px] px-2.5 py-1 bg-brand-green/10 text-brand-neon rounded-full font-medium border border-brand-green/20">
                    Pesos Válidos (100%)
                  </span>
                )}
              </div>
              <div className="w-full bg-background rounded-full h-3 mt-4 overflow-hidden border border-brand-green/20">
                <div 
                  className="bg-brand-neon h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(progresso.avancoPonderado, 100)}%` }}
                />
              </div>
            </div>

          </div>
        )}

        {/* Listagem Detalhada por Entregável */}
        <div className="bg-card border border-brand-green/20 rounded-2xl p-8 shadow-sm">
          <h2 className="text-xl font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-green inline-block"></span>
            Detalhamento da Execução por Entregável
          </h2>

          {loading ? (
            <div className="py-20 text-center text-sm text-foreground/60 animate-pulse">Calculando progresso real...</div>
          ) : !progresso || progresso.entregaveis.length === 0 ? (
            <div className="py-16 text-center text-sm text-foreground/50 border border-dashed border-brand-green/30 rounded-2xl">
              Nenhum entregável encontrado ou sem dados para cálculo nesta seleção.
            </div>
          ) : (
            <div className="space-y-6">
              {progresso.entregaveis.map((item: ProgressoEntregable) => (
                <div key={item.entregavelId} className="border border-brand-green/20 rounded-2xl p-6 bg-background shadow-xs space-y-4">
                  
                  {/* Cabeçalho do Entregável */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-xs px-2.5 py-1 bg-brand-green/10 text-brand-neon rounded-full font-semibold border border-brand-green/20">
                        {item.tipo}
                      </span>
                      <h3 className="font-semibold text-base text-foreground">
                        Entregável ID: {item.entregavelId.substring(0, 8)}...
                      </h3>
                      {item.pesoOperacional !== undefined && (
                        <span className="text-xs text-foreground/60 bg-secondary px-2 py-0.5 rounded">
                          Peso: {item.pesoOperacional}%
                        </span>
                      )}
                    </div>

                    {/* Diferenciação Rigorosa: Execução Física vs Comprovação Documental */}
                    <div className="flex items-center gap-4 text-xs font-semibold bg-card/60 border border-brand-green/10 px-4 py-2 rounded-xl">
                      <div className="text-right">
                        <span className="block text-foreground/60 text-[10px] uppercase tracking-wider">Execução Física</span>
                        <span className="text-brand-neon text-sm">{item.percentualExecucao.toFixed(1)}%</span>
                      </div>
                      <div className="h-6 w-px bg-brand-green/20" />
                      <div className="text-right">
                        <span className="block text-foreground/60 text-[10px] uppercase tracking-wider">Comprovação (Dossiê)</span>
                        <span className="text-amber-500 text-xs font-medium" title="Aguardando validação formal (TEC10/S05)">
                          Não avaliada / Pendente
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progresso Físico com Teto de 100% */}
                  <div className="w-full bg-card rounded-full h-2.5 overflow-hidden border border-brand-green/10">
                    <div 
                      className="bg-brand-green h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(item.percentualExecucao, 100)}%` }}
                    />
                  </div>

                  {/* Inputs operacionais restritos por tipo */}
                  <div className="pt-2 flex flex-wrap items-end justify-between gap-4 border-t border-brand-green/10">
                    
                    <div className="text-xs text-foreground/70 space-y-1">
                      <p><strong>Origem / Originais:</strong> Previsto: {item.previsto} | Realizado: {item.realizado}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {/* QUANTITATIVO */}
                      {item.tipo === 'QUANTITATIVO' && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-foreground/70">Qtd Realizada:</label>
                          <input
                            type="number"
                            className="w-24 border border-brand-green/30 rounded-xl px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                            defaultValue={item.realizado}
                            onChange={(e) => handleInputChange(item.entregavelId, 'realizado', parseFloat(e.target.value))}
                          />
                        </div>
                      )}

                      {/* MARCO */}
                      {item.tipo === 'MARCO' && (
                        <div className="flex flex-wrap items-center gap-3">
                          <div>
                            <label className="block text-[10px] text-foreground/70 mb-0.5">Status</label>
                            <select
                              className="border border-brand-green/30 rounded-xl px-3 py-1.5 text-xs bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                              defaultValue={item.percentualExecucao === 100 ? '100' : '0'}
                              onChange={(e) => handleInputChange(item.entregavelId, 'realizado', e.target.value === '100' ? item.previsto : 0)}
                            >
                              <option value="0">Pendente (0%)</option>
                              <option value="100">Alcançado (100%)</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] text-foreground/70 mb-0.5">Data Efetiva</label>
                            <input
                              type="date"
                              className="border border-brand-green/30 rounded-xl px-3 py-1.5 text-xs bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                              defaultValue={item.dataEfetivaMarco}
                              onChange={(e) => handleInputChange(item.entregavelId, 'dataEfetivaMarco', e.target.value)}
                            />
                          </div>
                        </div>
                      )}

                      {/* UNICO ou CONTINUO (Atualização operacional explícita) */}
                      {['UNICO', 'CONTINUO', 'RECORRENTE'].includes(item.tipo) && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-foreground/70">Execução Manual:</label>
                          <input
                            type="number"
                            step="0.1"
                            max={item.previsto}
                            className="w-28 border border-brand-green/30 rounded-xl px-3 py-1.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                            defaultValue={item.realizado}
                            onChange={(e) => handleInputChange(item.entregavelId, 'realizado', parseFloat(e.target.value))}
                          />
                        </div>
                      )}

                      <button
                        onClick={() => handleSalvarExecucao(item.entregavelId)}
                        disabled={salvandoId === item.entregavelId}
                        className="rounded-xl bg-brand-green px-5 py-2 text-xs font-semibold text-on-brand-green shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {salvandoId === item.entregavelId ? 'Salvando...' : 'Salvar Execução'}
                      </button>
                    </div>

                  </div>

                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      <footer className="w-full py-6 border-t border-brand-green/10 bg-background text-center mt-12">
        <p className="text-sm text-foreground/50">&copy; 2026 Project-01. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}