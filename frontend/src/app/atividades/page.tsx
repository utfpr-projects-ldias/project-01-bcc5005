'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useAtividades, Atividade } from '@/hooks/use-atividades';

export default function AtividadesPage() {
  const { contratos = [], carregando: loadingContratos } = useContrato('' as any) as any;
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState<string>('');

  const hookEntregaveis = useEntregaveis(contratoSelecionadoId) as any;
  const entregaveis = hookEntregaveis?.entregaveis || hookEntregaveis?.dados || [];

  const { atividades, loading, erro, buscarAtividades, criarAtividade } = useAtividades(contratoSelecionadoId);

  // Estados de Filtro por Período
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Estados do Formulário (Preserva dados digitados se a API falhar)
  const [formData, setFormData] = useState({
    titulo: '',
    dataHora: '',
    descricao: '',
    tipo: 'Reunião',
    responsavel: '',
    participantes: '',
    local: '',
    duracao: '',
    observacoes: '',
    entregavelIds: [] as string[],
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

  const handleFiltrar = (e: React.FormEvent) => {
    e.preventDefault();
    if (contratoSelecionadoId) {
      buscarAtividades({ dataInicio, dataFim });
    }
  };

  const handleCheckboxEntregavel = (id: string) => {
    setFormData((prev: typeof formData) => {
      const existe = prev.entregavelIds.includes(id);
      return {
        ...prev,
        entregavelIds: existe
          ? prev.entregavelIds.filter((item: string) => item !== id)
          : [...prev.entregavelIds, id],
      };
    });
  };

  const handleSubmitCriar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErro(null);
    setSucessoMsg(null);
    setIsSubmitting(true);

    try {
      await criarAtividade({
        ...formData,
        contratoId: contratoSelecionadoId,
      });

      setSucessoMsg('Atividade registrada com sucesso no diário!');
      setFormData({
        titulo: '',
        dataHora: '',
        descricao: '',
        tipo: 'Reunião',
        responsavel: '',
        participantes: '',
        local: '',
        duracao: '',
        observacoes: '',
        entregavelIds: [],
      });
    } catch (err: any) {
      setFormErro(err.message || 'Erro ao salvar atividade. Verifique os campos preenchidos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground font-sans">
      {/* Header Fixo com Logo Minimalista */}
      <header className="w-full border-b border-brand-green/20 bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          
          {/* Marca / Logo */}
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
              PRD <span className="text-foreground font-normal text-base ml-1">/ Diário de Atividades</span>
            </span>
          </Link>

        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10 flex flex-col gap-8">
        
        {/* Descrição da Página */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            Acompanhamento e <span className="text-brand-neon">Registro Executivo</span>
          </h1>
          <p className="text-foreground/70 mt-1">
            Gerencie o diário de campo, vistorias, reuniões e alinhamentos vinculados aos contratos autorizados.
          </p>
        </div>

        {/* Seção de Filtros por Período e Seletor de Contrato alinhados à direita */}
        <div className="bg-card border border-brand-green/20 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-end justify-between gap-6">
          
          <form onSubmit={handleFiltrar} className="flex flex-wrap items-end gap-6 flex-1">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-2">Data Início</label>
              <input
                type="date"
                className="border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-foreground/70 mb-2">Data Fim</label>
              <input
                type="date"
                className="border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="rounded-xl bg-brand-green px-6 py-2.5 text-sm font-semibold text-on-brand-green shadow-sm hover:opacity-90 transition-all"
            >
              Filtrar Período
            </button>
          </form>

          {/* Seletor de Contrato Autorizado posicionado junto às datas e orientado à direita */}
          <div className="flex flex-col items-start md:items-end gap-1.5 w-full md:w-auto">
            <label htmlFor="contrato-select" className="text-xs font-semibold uppercase tracking-wider text-foreground/70">
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

        {/* Grid Principal: Formulário e Listagem */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* Formulário de Cadastro */}
          <div className="bg-card border border-brand-green/20 rounded-2xl p-8 shadow-sm">
            <h2 className="text-xl font-bold tracking-tight mb-6 text-foreground flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-green inline-block"></span>
              Nova Atividade
            </h2>

            {/* Aviso de Erro Destacado em Vermelho */}
            {formErro && (
              <div className="bg-red-500/10 border border-red-500/40 text-red-500 dark:text-red-400 p-4 rounded-xl mb-6 text-sm font-semibold flex items-center gap-3 shadow-xs">
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
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
                <label className="block text-sm font-medium mb-1.5 text-foreground/90">Título *</label>
                <input
                  type="text"
                  required
                  className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  placeholder="Ex: Reunião de Alinhamento Inicial"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Data e Hora *</label>
                  <input
                    type="datetime-local"
                    required
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.dataHora}
                    onChange={(e) => setFormData({ ...formData, dataHora: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Tipo *</label>
                  <select
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.tipo}
                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                  >
                    <option value="Reunião">Reunião</option>
                    <option value="Visita Técnica">Visita Técnica</option>
                    <option value="Entrega Parcial">Entrega Parcial</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-foreground/90">Descrição *</label>
                <textarea
                  required
                  rows={3}
                  className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none resize-none"
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descreva o escopo ou pauta executada..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Responsável *</label>
                  <input
                    type="text"
                    required
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.responsavel}
                    onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
                    placeholder="Nome do responsável"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Local</label>
                  <input
                    type="text"
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.local}
                    onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                    placeholder="Sala de reuniões / Online"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Participantes</label>
                  <input
                    type="text"
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.participantes}
                    onChange={(e) => setFormData({ ...formData, participantes: e.target.value })}
                    placeholder="Ex: Equipe técnica e fiscal"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5 text-foreground/90">Duração</label>
                  <input
                    type="text"
                    className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                    value={formData.duracao}
                    onChange={(e) => setFormData({ ...formData, duracao: e.target.value })}
                    placeholder="Ex: 02:00h"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-foreground/90">Observações</label>
                <input
                  type="text"
                  className="w-full border border-brand-green/30 rounded-xl px-4 py-2.5 text-sm bg-background focus:ring-2 focus:ring-brand-green focus:outline-none"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  placeholder="Notas adicionais..."
                />
              </div>

              {/* Seleção Múltipla de Entregáveis do Contrato */}
              <div>
                <label className="block text-sm font-medium mb-2 text-foreground/90">Entregáveis Vinculados</label>
                <div className="border border-brand-green/30 rounded-xl p-4 max-h-40 overflow-y-auto space-y-2.5 bg-background">
                  {entregaveis && entregaveis.length > 0 ? (
                    entregaveis.map((ent: any) => (
                      <label key={ent.id} className="flex items-center gap-3 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={formData.entregavelIds.includes(ent.id)}
                          onChange={() => handleCheckboxEntregavel(ent.id)}
                          className="w-4 h-4 rounded border-brand-green/40 text-brand-green focus:ring-brand-green"
                        />
                        <span className="text-foreground/90">{ent.titulo || `Entregável ${ent.id.substring(0, 8)}`}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-xs text-foreground/50 text-center py-2">Nenhum entregável disponível para este contrato.</p>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 inline-flex items-center justify-center rounded-xl bg-brand-green px-8 py-3.5 text-sm font-semibold text-on-brand-green shadow-lg hover:scale-[1.01] transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'Registrando...' : 'Salvar Atividade'}
              </button>
            </form>
          </div>

          {/* Listagem de Atividades */}
          <div className="bg-card border border-brand-green/20 rounded-2xl p-8 shadow-sm flex flex-col">
            <h2 className="text-xl font-bold tracking-tight mb-6 text-foreground">Histórico do Diário</h2>

            {loading ? (
              <div className="py-20 text-center text-sm text-foreground/60 animate-pulse">Carregando atividades...</div>
            ) : erro ? (
              <div className="py-12 text-center text-sm text-red-500 font-medium">{erro}</div>
            ) : atividades.length === 0 ? (
              <div className="py-16 text-center text-sm text-foreground/50 border border-dashed border-brand-green/30 rounded-2xl">
                Nenhuma atividade registrada para este contrato ou período.
              </div>
            ) : (
              <div className="space-y-4 overflow-y-auto max-h-[700px] pr-2">
                {atividades.map((atv: Atividade) => (
                  <div key={atv.id} className="border border-brand-green/20 rounded-2xl p-5 bg-background shadow-xs space-y-3 hover:border-brand-green/50 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-base text-foreground">{atv.titulo}</h3>
                      <span className="text-xs px-2.5 py-1 bg-brand-green/10 text-brand-neon rounded-full font-medium shrink-0 border border-brand-green/20">
                        {atv.tipo}
                      </span>
                    </div>

                    <p className="text-sm text-foreground/80 leading-relaxed">{atv.descricao}</p>

                    <div className="text-xs text-foreground/60 grid grid-cols-2 gap-2 pt-3 border-t border-brand-green/10">
                      <div><strong>Data:</strong> {new Date(atv.dataHora).toLocaleString()}</div>
                      <div><strong>Responsável:</strong> {atv.responsavel}</div>
                      {atv.local && <div><strong>Local:</strong> {atv.local}</div>}
                      {atv.duracao && <div><strong>Duração:</strong> {atv.duracao}</div>}
                    </div>

                    {atv.entregaveis && atv.entregaveis.length > 0 && (
                      <div className="pt-2 text-xs">
                        <strong className="text-foreground/70 block mb-1">Entregáveis Vinculados:</strong>
                        <div className="flex flex-wrap gap-1.5">
                          {atv.entregaveis.map((e: any) => (
                            <span key={e.id} className="bg-secondary text-secondary-foreground px-2.5 py-1 rounded-md text-[11px] font-medium border border-brand-green/10">
                              {e.titulo || e.id.substring(0, 8)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer simples */}
      <footer className="w-full py-6 border-t border-brand-green/10 bg-background text-center mt-12">
        <p className="text-sm text-foreground/50">&copy; 2026 Project-01. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}