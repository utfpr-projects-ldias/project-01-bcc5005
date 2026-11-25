'use client';

import { useState } from 'react';
import { useListaContratos } from '@/hooks/use-contratos';
import { SeletorContrato } from '@/app/atividades/components/seletor-contrato';
import { PainelExecucao } from './components/painel-execucao';
export default function ExecucaoPage() {
  const lista = useListaContratos();
  const contratos = lista.dados ?? [];
  const [escolhido, setEscolhido] = useState('');
  const contratoId = contratos.some(c => c.id === escolhido) ? escolhido : '';
  return <main data-tec08-contexto-operacional data-tec08-estado="normal" className="mx-auto max-w-6xl space-y-5 pb-12">
    <header><h2 data-pi-titulo className="text-2xl font-bold">Execução física</h2><p className="text-sm text-foreground/70">Acompanhe o avanço dos entregáveis.</p></header>
    <section data-pi-superficie className="rounded-xl border p-4"><SeletorContrato contratos={contratos} valor={contratoId} onChange={setEscolhido} carregando={lista.carregando} />
    {Boolean(lista.erro) && <p role="alert">Não foi possível consultar os contratos.</p>}</section>
    {contratoId ? <PainelExecucao key={contratoId} contratoId={contratoId} /> : <p>Selecione um contrato.</p>}
  </main>;
}
