'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useContrato } from '@/hooks/use-contratos';
import { useOcorrencias, Ocorrencia } from '@/hooks/use-ocorrencias';
import { useEntregaveis } from '@/hooks/use-entregaveis';

export default function OcorrenciasPage() {
  const { contratos = [], carregando: loadingContratos } = useContrato('' as any) as any;
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string>('');

  const { ocorrencias, loading, erro, criarOcorrenciaManual } = useOcorrencias(contratoSelecionadoId);
  
  // Busca entregáveis para o select do formulário de criação manual
  const hookEntregaveis = useEntregaveis(contratoSelecionadoId) as any;
  const entregaveis = hookEntregaveis?.entregaveis || hookEntregaveis?.dados || [];

  // Estados do Formulário de Criação de Ocorrência Quantitativa Manual
  const [formData, setFormData] = useState({
    entregavelId: '',
    titulo: '',
    periodoInicio: '',
    periodoFim: '',
    prazo: '',
    quantidade: 1,
    observacoes: '',
  });

  const [formErro, setFormErro] = useState<string | null>(null);
  const [sucessoMsg, setSucessoMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Seleciona o primeiro contrato automaticamente quando a lista carregar
  useEffect(() => {
    if (contratos && contratos.length > 0 && !contratoSelecionadoId) {
      setContratoSelecionadoId(contratos[0].id);
    }
  }, [contratos, contratoSelecionadoId]);

  const handleSubmitCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);
    setSucessoMsg(null);
    setIsSubmitting(true);

    try {
      await criarOcorrenciaManual({
        contratoId: contratoSelecionadoId,
        ...formData,
      });

      setSucessoMsg('Ocorrência quantitativa manual registrada com sucesso!');
      setFormData({
        entregavelId: '',
        titulo: '',
        periodoInicio: '',
        periodoFim: '',
        prazo: '',
        quantidade: 1,
        observacoes: '',
      });
    } catch (err: any) {
      setFormErro(err.message || 'Erro ao criar ocorrência manual.');
    } finally {
      setIsSubmitting(false);
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
              PRD <span className="text-foreground font-normal text-base ml-1">/ Gestão de Ocorrências</span>
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
              Agenda e Ocorrências <span className="text-brand-neon">Quantitativas</span>
            </h1>
            <p className="text-foreground/70 mt-1 max-w-2xl">
              Gerencie a agenda e registre ocorrências quantitativas sob demanda vinculadas aos entregáveis do contrato autorizado.
            </p>
          </div>

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

        {/* Mensagens de Erro Globais em Vermelho */}
        {erro && (
          <div className="bg-red-500/10 border border-red-500/40 text-red-500 dark:text-red-400 p-4 rounded-xl text-sm font-semibold flex items-center gap-3 shadow-xs">
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{erro}</span>
          </div>
        )}

        {/* Grid Principal: Formulário de Criação Manual e Agenda / Listagem */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Formulário de Criação de Ocorrência Manual */}
          <div className="bg-card border border-brand-green/20 rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-green inline-block"></span>
              Nova Ocorrência Quantitativa Manual
            </h2>

            {formErro && (
              <div className="bg-red-500/10 border border-red-500/40 text-red-500 dark:text-red-400 p-4 rounded-xl mb-6 text-sm font-semibold flex items-center gap-3">
                <span>{formErro}</span>
              </div>
            )}

            {sucessoMsg && (
              <div className="bg-brand-green/10 border border-brand-green/40 text-brand-neon p-4 rounded-xl mb-6 text-sm font-medium">
                {sucessoMsg}
              </div>
            )}

            <form onSubmit={handleSubmitCriar} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-foreground/90">Entregável Vinculado *</label>
                <select
                  required
                  className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                  value={formData.entregavelId}
                  onChange={(e) => setFormData({ ...formData, entregavelId: e.target.value })}
                >
                  <option value="">Selecione um entregável...</option>
                  {entregaveis.map((ent: any) => (
                    <option key={ent.id} value={ent.id}>
                      {ent.titulo || `Entregável ${ent.id.substring(0, 8)}`} ({ent.tipo || 'QUANTITATIVO'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-foreground/90">Título da Ocorrência *</label>
                <input
                  type="text"
                  required
                  className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  placeholder="Ex: Execução de Tubulação - Lote 01"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Período Início *</label>
                  <input
                    type="date"
                    required
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.periodoInicio}
                    onChange={(e) => setFormData({ ...formData, periodoInicio: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Período Fim *</label>
                  <input
                    type="date"
                    required
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.periodoFim}
                    onChange={(e) => setFormData({ ...formData, periodoFim: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Prazo *</label>
                  <input
                    type="date"
                    required
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.prazo}
                    onChange={(e) => setFormData({ ...formData, prazo: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Quantidade *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.quantidade}
                    onChange={(e) => setFormData({ ...formData, quantidade: parseFloat(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-foreground/90">Observações</label>
                <textarea
                  rows={2}
                  className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none resize-none"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Notas adicionais sobre a ocorrência..."
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 inline-flex items-center justify-center rounded-xl bg-brand-green px-8 py-3.5 text-sm font-semibold text-on-brand-green shadow-lg hover:scale-[1.01] transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Registrando...' : 'Criar Ocorrência Manual'}
              </button>
            </form>
          </div>

          {/* Listagem / Agenda de Ocorrências */}
          <div className="bg-card border border-brand-green/20 rounded-2xl p-8 shadow-sm flex flex-col">
            <h2 className="text-xl font-bold tracking-tight mb-6 text-foreground">Agenda e Histórico de Ocorrências</h2>

            {loading ? (
              <div className="py-20 text-center text-sm text-foreground/60 animate-pulse">Carregando ocorrências...</div>
            ) : ocorrencias.length === 0 ? (
              <div className="py-16 text-center text-sm text-foreground/50 border border-dashed border-brand-green/30 rounded-2xl">
                Nenhuma ocorrência registrada para este contrato.
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-[700px] pr-2">
                {ocorrencias.map((occ: Ocorrencia) => (
                  <div key={occ.id} className="border border-brand-green/20 rounded-2xl p-5 bg-background shadow-xs space-y-3 hover:border-brand-green/50 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base text-foreground">{occ.titulo}</h3>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium shrink-0 border ${
                        occ.estado === 'EXECUTADO' ? 'bg-brand-green/10 text-brand-neon border-brand-green/20' :
                        occ.estado === 'ATRASADO' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                        'bg-amber-500/10 text-amber-500 border-amber-500/20'
                      }`}>
                        {occ.estado}
                      </span>
                    </div>

                    {occ.observacoes && (
                      <p className="text-sm text-foreground/80 leading-relaxed">{occ.observacoes}</p>
                    )}

                    <div className="text-xs text-foreground/60 grid grid-cols-2 gap-2 pt-3 border-t border-brand-green/10">
                      <div><strong>Período:</strong> {occ.periodoInicio} até {occ.periodoFim}</div>
                      <div><strong>Prazo:</strong> {occ.prazo}</div>
                      <div><strong>Quantidade:</strong> {occ.quantidade}</div>
                      <div><strong>Entregável:</strong> {occ.entregavelId.substring(0, 8)}...</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      <footer className="w-full py-6 border-t border-brand-green/10 bg-background text-center mt-12">
        <p className="text-sm text-foreground/50">&copy; 2026 Project-01. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}