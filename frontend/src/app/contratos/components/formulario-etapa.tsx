'use client';

import { useState, type FormEvent } from 'react';
import { ErroEtapa, STATUS_ETAPA, type DadosEtapa, type Etapa } from '@/lib/etapas';
import { DADOS_ETAPA_INICIAIS, validarEtapa, type ErrosCamposEtapa } from '@/lib/validacao-etapa';

const campoClasse = 'w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-green aria-invalid:border-red-500/70';

type Campo = keyof DadosEtapa;

export function FormularioEtapa({ inicial, onSalvar, onCancelar, onSalvandoMudou }: {
  inicial?: Etapa; onSalvar: (dados: DadosEtapa) => Promise<void>; onCancelar: () => void;
  onSalvandoMudou?: (salvando: boolean) => void;
}) {
  const [dados, setDados] = useState<DadosEtapa>(() => inicial ? {
    nome: inicial.nome, codigo: inicial.codigo, descricao: inicial.descricao,
    inicioPrevisto: inicial.inicioPrevisto, terminoPrevisto: inicial.terminoPrevisto,
    status: inicial.status, observacoes: inicial.observacoes,
  } : { ...DADOS_ETAPA_INICIAIS });
  const [erros, setErros] = useState<ErrosCamposEtapa>({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  function mudar<K extends Campo>(campo: K, valor: DadosEtapa[K]) {
    setDados((atual) => ({ ...atual, [campo]: valor }));
    setErros((atual) => ({ ...atual, [campo]: undefined }));
    setErroGeral('');
  }
  const erroCampo = (campo: Campo) => ({
    'aria-invalid': !!erros[campo],
    'aria-describedby': erros[campo] ? `etapa-${campo}-erro` : undefined,
  });
  function mensagem(campo: Campo) {
    return erros[campo] ? <p role="alert" id={`etapa-${campo}-erro`} className="mt-1 text-xs text-red-400">{erros[campo]}</p> : null;
  }
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (salvando) return;
    const resultado = validarEtapa(dados);
    if (!resultado.sucesso) {
      setErros(resultado.erros); setErroGeral('Confira os campos destacados.');
      return;
    }
    setErros({}); setErroGeral(''); setSalvando(true); onSalvandoMudou?.(true);
    try { await onSalvar(resultado.dados); }
    catch (erro) {
      setErroGeral(erro instanceof ErroEtapa ? erro.message : 'Não foi possível salvar a etapa. Seus dados foram mantidos.');
    } finally { setSalvando(false); onSalvandoMudou?.(false); }
  }
  return <form noValidate aria-label={inicial ? `Editar etapa ${inicial.nome}` : 'Criar etapa'} onSubmit={(e) => void enviar(e)}
    className="min-w-0 space-y-4 rounded-2xl border border-brand-green/40 bg-brand-darkgreen/10 p-4 md:p-5">
    <h4 className="text-lg font-semibold text-brand-neon">{inicial ? 'Editar etapa' : 'Nova etapa'}</h4>
    <p className="text-sm text-foreground/65">Somente o nome é obrigatório. A posição é definida pelo sistema.</p>
    <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
      <div><label htmlFor="etapa-codigo" className="mb-1 block text-sm font-medium">Código</label>
        <input id="etapa-codigo" maxLength={50} className={campoClasse} value={dados.codigo ?? ''} {...erroCampo('codigo')}
          onChange={(e) => mudar('codigo', e.target.value || null)} />{mensagem('codigo')}</div>
      <div><label htmlFor="etapa-nome" className="mb-1 block text-sm font-medium">Nome *</label>
        <input id="etapa-nome" maxLength={255} required className={campoClasse} value={dados.nome} {...erroCampo('nome')}
          onChange={(e) => mudar('nome', e.target.value)} />{mensagem('nome')}</div>
    </div>
    <div><label htmlFor="etapa-descricao" className="mb-1 block text-sm font-medium">Descrição</label>
      <textarea id="etapa-descricao" rows={3} className={campoClasse} value={dados.descricao ?? ''}
        onChange={(e) => mudar('descricao', e.target.value || null)} />{mensagem('descricao')}</div>
    <div className="grid gap-4 md:grid-cols-3">
      <div><label htmlFor="etapa-inicioPrevisto" className="mb-1 block text-sm font-medium">Início previsto</label>
        <input type="date" id="etapa-inicioPrevisto" className={campoClasse} value={dados.inicioPrevisto ?? ''} {...erroCampo('inicioPrevisto')}
          onChange={(e) => mudar('inicioPrevisto', e.target.value || null)} />{mensagem('inicioPrevisto')}</div>
      <div><label htmlFor="etapa-terminoPrevisto" className="mb-1 block text-sm font-medium">Término previsto</label>
        <input type="date" id="etapa-terminoPrevisto" className={campoClasse} value={dados.terminoPrevisto ?? ''} {...erroCampo('terminoPrevisto')}
          onChange={(e) => mudar('terminoPrevisto', e.target.value || null)} />{mensagem('terminoPrevisto')}</div>
      <div><label htmlFor="etapa-status" className="mb-1 block text-sm font-medium">Status</label>
        <select id="etapa-status" className={campoClasse} value={dados.status} {...erroCampo('status')}
          onChange={(e) => mudar('status', e.target.value as DadosEtapa['status'])}>
          {Object.entries(STATUS_ETAPA).map(([valor, rotulo]) => <option value={valor} key={valor}>{rotulo}</option>)}
        </select>{mensagem('status')}</div>
    </div>
    <div><label htmlFor="etapa-observacoes" className="mb-1 block text-sm font-medium">Observações</label>
      <textarea id="etapa-observacoes" rows={2} className={campoClasse} value={dados.observacoes ?? ''}
        onChange={(e) => mudar('observacoes', e.target.value || null)} />{mensagem('observacoes')}</div>
    {erroGeral && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{erroGeral}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" onClick={onCancelar} disabled={salvando} className="rounded-lg border border-brand-green/40 px-4 py-2 text-sm transition-colors hover:bg-brand-green/10 disabled:opacity-50">Voltar sem salvar</button>
      <button type="submit" disabled={salvando} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
        {salvando ? 'Salvando etapa...' : 'Salvar etapa'}
      </button>
    </div>
  </form>;
}
