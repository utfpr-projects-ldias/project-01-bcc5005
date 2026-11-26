'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type OpcaoResponsavel = { id: string; email: string; nome?: string | null };
type Pagina = { itens: OpcaoResponsavel[]; total: number };
export function SeletorResponsavel({ valor, onChange, itens = [], pesquisar, selecionado, desabilitado = false,
  rotulo = 'Responsável pelo contrato (opcional)', erro, id, semprePesquisar = false }: {
  valor: string | null; onChange: (id: string | null, usuario?: OpcaoResponsavel) => void;
  itens?: OpcaoResponsavel[]; pesquisar?: (termo: string, signal: AbortSignal) => Promise<Pagina>;
  selecionado?: OpcaoResponsavel | null; desabilitado?: boolean; rotulo?: string; erro?: string; id?: string; semprePesquisar?: boolean;
}) {
  const interno = useId().replace(/:/g, '');
  const identificador = id ?? `responsavel-${interno}`;
  const raiz=useRef<HTMLDivElement>(null);
  const [busca, setBusca] = useState('');
  const [aberta, setAberta] = useState(false);
  const [acima, setAcima] = useState(false);
  function abrirLista() {
    const campo = raiz.current?.querySelector('input');
    const area = raiz.current?.closest('[data-tec08-corpo-modal]');
    if (campo) { const r = campo.getBoundingClientRect(); const limite = area?.getBoundingClientRect(); setAcima((limite?.bottom ?? window.innerHeight) - r.bottom < 190 && r.top - (limite?.top ?? 0) > 190); }
    setDestacado(-1);
    setAberta(true);
  }
  const [remotos, setRemotos] = useState<OpcaoResponsavel[]>([]);
  const [termoEmConsulta, setTermoEmConsulta] = useState<string|null>(null);
  const [erroBusca, setErroBusca] = useState('');
  const [concluida, setConcluida] = useState<string | null>(null);
  const [destacado, setDestacado] = useState(-1);
  const [total, setTotal] = useState(0);
  useEffect(()=>{if(!aberta)return;const fora=(e:PointerEvent)=>{if(!raiz.current?.contains(e.target as Node))setAberta(false);};document.addEventListener('pointerdown',fora);return()=>document.removeEventListener('pointerdown',fora);},[aberta]);
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  useEffect(() => {
    if (!pesquisar || !aberta || termo.length === 1) return;
    const controle = new AbortController();
    const tempo = setTimeout(() => {
      void (async () => {
        setTermoEmConsulta(termo);
        try {
          const resposta = await pesquisar(termo, controle.signal);
          if (!controle.signal.aborted) { setRemotos(resposta.itens); setTotal(resposta.total); setConcluida(termo); setErroBusca(''); }
        } catch {
          if (!controle.signal.aborted) { setRemotos([]); setTotal(0); setConcluida(termo); setErroBusca('Não foi possível consultar os usuários.'); }
        } finally { if (!controle.signal.aborted) setTermoEmConsulta(null); }
      })();
    }, 280);
    return () => { clearTimeout(tempo); controle.abort(); };
  }, [termo, pesquisar, aberta]);
  const opcoes = useMemo(() => pesquisar ? (concluida === termo && termo.length !== 1 ? remotos : []) : itens.filter(u => `${u.nome ?? ''} ${u.email}`.toLocaleLowerCase('pt-BR').includes(termo)), [pesquisar, remotos, itens, termo, concluida]);
  const escolhido = (valor ? itens.find(u => u.id === valor) ?? (selecionado?.id === valor ? selecionado : null) : null);
  const carregando = Boolean(pesquisar && aberta && termo.length!==1 && termoEmConsulta===termo);
  const aguardando = Boolean(pesquisar && aberta && termo.length !== 1 && concluida !== termo);
  function escolher(usuario: OpcaoResponsavel) {
    onChange(usuario.id, usuario); setBusca(''); setAberta(false); setDestacado(-1);
  }
  return <div ref={raiz} className="pi-seletor-responsavel min-w-0 space-y-1.5"><label htmlFor={identificador} className="block text-sm font-medium">{rotulo}</label>
    {escolhido && !semprePesquisar ? <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-current/20 bg-foreground/5 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={escolhido.email}>{escolhido.email || 'Usuário cadastrado'}</span>
      <button type="button" disabled={desabilitado} onClick={() => { onChange(null); setBusca(''); }} className="shrink-0 rounded-lg border border-current/20 px-3 py-2 text-xs hover:bg-foreground/10 disabled:opacity-40">Remover atribuição</button>
    </div> : valor && !semprePesquisar ? <div className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-current/20 p-2 text-xs text-foreground/70">
      <span className="min-w-0 break-words">Responsável existente (fora da lista atual). Vínculo preservado.</span>
      <button type="button" disabled={desabilitado} onClick={() => onChange(null)} className="shrink-0 rounded-lg border px-2 py-1">Remover atribuição</button>
    </div> : <div className="relative">
      <div className="flex min-w-0 items-stretch rounded-lg border border-current/20 bg-background focus-within:ring-2 focus-within:ring-current/25">
        <input id={identificador} type="text" inputMode="search" data-pi-campo-com-icone="separado" title={!aberta ? escolhido?.email : undefined} role="combobox" autoComplete="off" aria-label={rotulo}
          aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={aberta} aria-controls={`${identificador}-lista`}
          aria-activedescendant={aberta && destacado >= 0 && opcoes[destacado] ? `${identificador}-opcao-${opcoes[destacado]?.id}` : undefined}
          aria-invalid={Boolean(erro)} disabled={desabilitado} value={semprePesquisar&&!aberta ? escolhido?.email ?? '' : busca} placeholder="Buscar por nome ou e-mail" maxLength={100}
          className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2.5 text-sm text-foreground outline-none"
          onFocus={() => { if(!aberta){setBusca('');abrirLista();} }} onClick={() => {if(!aberta){setBusca('');abrirLista();}}} onChange={e => { setBusca(e.target.value); if(!aberta)abrirLista(); setDestacado(-1); }}
          onKeyDown={e => {
            if (e.key === 'Escape' && aberta) { e.preventDefault(); e.stopPropagation(); setAberta(false); }
            if (e.key === 'ArrowDown') { e.preventDefault(); if(!aberta)abrirLista(); if (opcoes.length) setDestacado(i => (i + 1) % opcoes.length); }
            if (e.key === 'ArrowUp') { e.preventDefault(); if(!aberta)abrirLista(); if (opcoes.length) setDestacado(i => i <= 0 ? opcoes.length - 1 : i - 1); }
            if (e.key === 'Enter' && aberta && !aguardando && !carregando && (Boolean(opcoes[destacado]) || opcoes.length === 1)) { e.preventDefault(); escolher(opcoes[destacado] ?? opcoes[0]); }
          }} />
        <button type="button" disabled={desabilitado} aria-label={aberta ? 'Fechar lista de responsáveis' : 'Abrir lista de responsáveis'} aria-haspopup="listbox" aria-expanded={aberta} aria-controls={`${identificador}-lista`} onClick={() => { if(!aberta){setBusca('');abrirLista();}else setAberta(false); setDestacado(-1); }} className="w-11 shrink-0 rounded-r-lg border-l border-current/20 text-foreground hover:bg-foreground/10 disabled:opacity-40">⌄</button>
      </div>
      {aberta && <div id={`${identificador}-lista`} role="listbox" data-pi-opcoes-texto aria-label="Responsáveis encontrados" data-acima={acima} className="pi-responsavel-opcoes max-h-44 w-full overflow-y-auto rounded-lg border p-1">
        {(carregando || aguardando) && <p role="status" className="px-3 py-2 text-xs text-foreground/65">Buscando responsáveis...</p>}
        {concluida===termo && erroBusca && <p role="alert" className="px-3 py-2 text-xs text-error-text">{erroBusca}</p>}
        {!carregando && !aguardando && !(concluida===termo&&erroBusca) && !opcoes.length && <p className="px-3 py-2 text-xs text-foreground/65">{termo.length === 1 ? 'Digite mais um caractere para pesquisar.' : 'Nenhum usuário encontrado.'}</p>}
        {!aguardando && opcoes.map((usuario,indice) => <button key={usuario.id} type="button" role="option" id={`${identificador}-opcao-${usuario.id}`} aria-selected={usuario.id === valor} data-pi-realce={indice === destacado} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setDestacado(indice)} onMouseLeave={() => setDestacado(-1)} onClick={() => escolher(usuario)} title={usuario.nome ? `${usuario.nome} — ${usuario.email}` : usuario.email} className="block w-full min-w-0 rounded-md px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-current">{usuario.nome ? `${usuario.nome} — ${usuario.email}` : usuario.email}</button>)}
        {pesquisar && !aguardando && total > opcoes.length && <p className="border-t border-current/15 px-3 py-2 text-xs text-foreground/60">Refine a busca pelo nome ou e-mail para encontrar mais usuários.</p>}
      </div>}
    </div>}
    {erro && <p role="alert" className="text-xs text-error-text">{erro}</p>}
  </div>;
}
