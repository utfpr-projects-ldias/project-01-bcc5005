'use client';

import { useState } from 'react';
import { useListaContratos } from '@/hooks/use-contratos';
import { PainelOcorrencias } from './components/painel-ocorrencias';
import { IconeOcorrencias } from '@/app/components/icones-operacionais';
import { SeletorContrato } from '@/app/atividades/components/seletor-contrato';

export default function OcorrenciasPage() {
  const lista = useListaContratos();
  const contratos = lista.dados ?? [];
  const [escolhido, setEscolhido] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('contratoId') ?? '');
  // O contrato somente e selecionado por acao explicita ou por deep-link autorizado.
  const contratoId = contratos.some(c => c.id === escolhido) ? escolhido : '';
  const contrato = contratos.find(c => c.id === contratoId);
  const somenteLeitura = Boolean(contrato && (contrato.arquivadoEm || (contrato.status && !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status))));
  return <main data-tec08-contexto-operacional data-tec08-estado="normal" className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="space-y-1">
      <h2 data-pi-titulo className="flex items-center gap-2 text-2xl font-bold"><IconeOcorrencias tamanho={26} /> Ocorrências</h2>
      <p className="text-sm text-foreground/65">Consulte e registre ocorrências dos entregáveis.</p>
    </header>
    <section data-pi-superficie aria-label="Selecionar contrato da agenda" className="rounded-xl border border-brand-green/20 bg-card p-4 sm:p-5">
      <SeletorContrato contratos={contratos} valor={contratoId} onChange={setEscolhido} carregando={lista.carregando} />
      {Boolean(lista.erro) && <p role="alert" className="mt-2 text-sm text-error-text">Não foi possível consultar os contratos.</p>}
    </section>
    {contratoId ? <PainelOcorrencias key={contratoId} contratoId={contratoId} estadoContextual="normal" somenteLeitura={somenteLeitura} />
      : <p className="rounded-xl border border-dashed border-brand-green/25 p-6 text-sm text-foreground/65">Selecione um contrato para consultar a agenda de ocorrências.</p>}
  </main>;
}
