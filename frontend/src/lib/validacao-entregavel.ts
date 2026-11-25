import type { Entregavel, EvidenciaEsperada, PeriodicidadeEntregavel, TipoEntregavel } from './entregaveis';

/** O formulário mantém strings decimais, evitando arredondamentos de Number no envio. */
export type ItemChecklistFormulario = Pick<EvidenciaEsperada, 'tipoEvidencia' | 'descricao' | 'obrigatoria'> & {
  id?: string; chave: string;
};
export type RascunhoEntregavel = {
  etapaId: string; nome: string; codigo: string; descricao: string; tipo: TipoEntregavel;
  responsavelId: string; inicioPrevisto: string; terminoPrevisto: string;
  quantidadePrevista: string; unidadeMedida: string; periodicidade: PeriodicidadeEntregavel | '';
  modoRecorrente?: 'DESCRITIVO' | 'QUANTITATIVO';
  peso: string; criterioConclusao: string; observacoes: string;
  evidenciasEsperadas: ItemChecklistFormulario[];
};
export type DadosPlanejamentoEntregavel = {
  versaoPlanejamento?: string; etapaId: string; nome: string; tipo: TipoEntregavel; codigo: string | null; descricao: string | null;
  responsavelId: string | null; inicioPrevisto: string | null; terminoPrevisto: string | null;
  quantidadePrevista: string | null; unidadeMedida: string | null;
  periodicidade: PeriodicidadeEntregavel | null; configuracaoPeriodicidade: Entregavel['configuracaoPeriodicidade'] | null;
  peso: string | null; criterioConclusao: string | null; observacoes: string | null;
  evidenciasEsperadas: { id?: string; tipoEvidencia: string; descricao: string | null; obrigatoria: boolean }[];
};
export type ErrosEntregavel = Record<string, string>;
export const TIPOS: TipoEntregavel[] = ['UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO'];
export const PERIODICIDADES: PeriodicidadeEntregavel[] = ['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];
export const DESCRICOES_TIPO: Record<TipoEntregavel, string> = {
  UNICO: 'Uma obrigação pontual. O andamento será registrado pelo módulo de execução.',
  QUANTITATIVO: 'Obrigação mensurável. Informe meta e unidade; registre a execução diretamente ou por ocorrências, sem duplicar quantidades.',
  RECORRENTE: 'Serviço periódico. Defina frequência e período para gerar a agenda de ocorrências.',
  CONTINUO: 'Atividade mantida ao longo do período. O tempo decorrido não representa progresso automático.',
  MARCO: 'Marco contratual atingido em uma condição verificável. A data efetiva será tratada na execução.',
};
const opcional = (texto: string): string | null => texto.trim() || null;
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data.startsWith('0000-')) return false;
  const d = new Date(`${data}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}
const decimal = (n: string, inteiros: number, casas: number) =>
  new RegExp(`^(?:0|[1-9]\\d{0,${inteiros - 1}})(?:\\.\\d{1,${casas}})?$`).test(n);
const uuid4 = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export function inicialEntregavel(etapaId: string, item?: Entregavel): RascunhoEntregavel {
  return {
    etapaId, nome: item?.nome ?? '', codigo: item?.codigo ?? '', descricao: item?.descricao ?? '',
    tipo: item?.tipo ?? 'UNICO', responsavelId: item?.responsavelId ?? '',
    inicioPrevisto: item?.inicioPrevisto ?? '', terminoPrevisto: item?.terminoPrevisto ?? '',
    quantidadePrevista: item?.quantidadePrevista ?? '', unidadeMedida: item?.unidadeMedida ?? '',
    periodicidade: item?.periodicidade ?? '', modoRecorrente: item ? item.configuracaoPeriodicidade?.modoRegistro : 'DESCRITIVO', peso: item?.peso == null ? '' : normalizarDecimalPlanejamento(item.peso),
    criterioConclusao: item?.criterioConclusao ?? '', observacoes: item?.observacoes ?? '',
    evidenciasEsperadas: (item?.evidenciasEsperadas ?? []).map((e, indice) => ({ ...e, chave: `existente-${indice}-${e.id}` })),
  };
}
export function mudouEstrutura(r: RascunhoEntregavel, inicial?: Entregavel): boolean {
  return !!inicial && (r.tipo !== inicial.tipo ||
    (r.tipo === 'RECORRENTE' && (r.periodicidade !== (inicial.periodicidade ?? '') || r.modoRecorrente !== inicial.configuracaoPeriodicidade?.modoRegistro)) ||
    r.inicioPrevisto !== (inicial.inicioPrevisto ?? '') || r.terminoPrevisto !== (inicial.terminoPrevisto ?? '') ||
    r.etapaId !== inicial.etapaId);
}
export function validarEntregavel(r: RascunhoEntregavel, inicial?: Entregavel): { sucesso: true; dados: DadosPlanejamentoEntregavel } | { sucesso: false; erros: ErrosEntregavel } {
  const erros: ErrosEntregavel = {};
  const nome = r.nome.trim();
  if (!nome) erros.nome = 'Informe o nome do entregável.';
  else if ([...nome].length > 42 && nome !== inicial?.nome) erros.nome = 'O nome do entregável deve ter no máximo 42 caracteres.';
  for (const [campo, maximo] of [['codigo', 15], ['descricao', 200], ['unidadeMedida', 40], ['criterioConclusao', 200], ['observacoes', 100]] as const) {
    const t = r[campo];
    if (t && (!t.trim() || ([...t].length > maximo && t !== (inicial?.[campo] ?? '')))) erros[campo] = `Revise o campo (até ${maximo} caracteres e sem valor somente com espaços).`;
  }
  if (!TIPOS.includes(r.tipo)) erros.tipo = 'Escolha um tipo de entregável válido.';
  if (r.responsavelId.trim() && !uuid4(r.responsavelId.trim())) erros.responsavelId = 'Selecione um funcionário ativo ou deixe em branco.';
  if (!r.inicioPrevisto) erros.inicioPrevisto = 'Informe a data de início prevista.';
  else if (!dataValida(r.inicioPrevisto)) erros.inicioPrevisto = 'Data civil inválida.';
  if (r.terminoPrevisto && !dataValida(r.terminoPrevisto)) erros.terminoPrevisto = 'Data civil inválida.';
  if (r.inicioPrevisto && r.terminoPrevisto && r.terminoPrevisto < r.inicioPrevisto) erros.terminoPrevisto = 'O término não pode anteceder o início.';
  if (r.tipo === 'QUANTITATIVO') {
    if (!decimal(r.quantidadePrevista.trim().replace(',', '.'), 15, 3) || normalizarDecimalPlanejamento(r.quantidadePrevista) === '0')
      erros.quantidadePrevista = 'Informe quantidade prevista positiva (até três casas).';
    if (!r.unidadeMedida.trim()) erros.unidadeMedida = 'Informe a unidade de medida.';
  }
  if (r.tipo === 'CONTINUO' && !r.terminoPrevisto) erros.terminoPrevisto = 'Informe o término previsto do serviço contínuo.';
  if (r.tipo === 'RECORRENTE') {
    if (!r.modoRecorrente && !(inicial?.tipo === 'RECORRENTE' && inicial.configuracaoPeriodicidade?.modoRegistro === undefined && !mudouEstrutura(r,inicial))) erros.periodicidade = 'Defina a modalidade de medição recorrente.';
    if (r.modoRecorrente === 'QUANTITATIVO' && !r.unidadeMedida.trim()) erros.unidadeMedida = 'Informe a unidade de medida.';
    if (!r.periodicidade || !PERIODICIDADES.includes(r.periodicidade)) erros.periodicidade = 'Selecione uma periodicidade válida.';
    if (!r.inicioPrevisto || !r.terminoPrevisto)
      erros.inicioPrevisto = 'Defina início e término da agenda recorrente.';
  }
  if (['CONTINUO', 'MARCO'].includes(r.tipo) && !r.criterioConclusao.trim()) {
    erros.criterioConclusao = 'O critério textual é obrigatório para Contínuo e Marco.';
  }
  if (!(inicial && inicial.peso == null && !r.peso.trim()) && (!r.peso.trim() || !decimal(r.peso.trim().replace(',', '.'), 3, 4) || Number(r.peso.trim().replace(',', '.')) > 100)) {
    erros.peso = 'Informe peso entre zero e 100%, com até quatro casas decimais.';
  }
  if (r.evidenciasEsperadas.length > 10) erros.evidenciasEsperadas = 'Máximo de 10 itens.';
  r.evidenciasEsperadas.forEach((e, indice) => {
    if (!e.tipoEvidencia.trim() || (e.tipoEvidencia.length > 50 && e.tipoEvidencia !== inicial?.evidenciasEsperadas.find(item => item.id === e.id)?.tipoEvidencia)) erros[`evidencias.${indice}.tipoEvidencia`] = 'Informe o tipo da evidência (até 50 caracteres).';
    if (e.descricao && (!e.descricao.trim() || (e.descricao.length > 65 && e.descricao !== inicial?.evidenciasEsperadas.find(item => item.id === e.id)?.descricao))) erros[`evidencias.${indice}.descricao`] = 'Orientações inválidas (até 65 caracteres).';
  });
  if (Object.keys(erros).length) return { sucesso: false, erros };
  return { sucesso: true, dados: {
    etapaId: r.etapaId, nome, tipo: r.tipo, codigo: opcional(r.codigo), descricao: opcional(r.descricao),
    responsavelId: opcional(r.responsavelId), inicioPrevisto: opcional(r.inicioPrevisto),
    terminoPrevisto: opcional(r.terminoPrevisto),
    quantidadePrevista: r.tipo === 'QUANTITATIVO' ? opcional(r.quantidadePrevista.replace(',', '.')) : null,
    unidadeMedida: ['QUANTITATIVO', 'RECORRENTE'].includes(r.tipo) ? opcional(r.unidadeMedida) : null,
    periodicidade: r.tipo === 'RECORRENTE' && r.periodicidade ? r.periodicidade as PeriodicidadeEntregavel : null,
    configuracaoPeriodicidade: r.tipo === 'RECORRENTE' && r.periodicidade ? { versao: 1, ...(r.modoRecorrente ? {modoRegistro:r.modoRecorrente} : {}) } : null,
    peso: opcional(r.peso.replace(',', '.')), criterioConclusao: opcional(r.criterioConclusao), observacoes: opcional(r.observacoes),
    evidenciasEsperadas: r.evidenciasEsperadas.map((e) => ({
      ...(e.id ? { id: e.id } : {}), tipoEvidencia: e.tipoEvidencia.trim(), descricao: opcional(e.descricao ?? ''), obrigatoria: e.obrigatoria,
    })),
  } };
}

/** Canonicalização textual sem perda de precisão, inclusive NUMERIC(18,3). */
export function normalizarDecimalPlanejamento(valor: string): string {
  const texto = valor.trim().replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(texto)) return texto;
  const [inteiro, fracao = ''] = texto.split('.');
  const parte = fracao.replace(/0+$/, '');
  return inteiro.replace(/^0+(?=\d)/, '') + (parte ? '.'+parte : '');
}
const CAMPOS_PLANEJAMENTO = ['etapaId','nome','tipo','codigo','descricao','responsavelId','inicioPrevisto','terminoPrevisto','quantidadePrevista','unidadeMedida','periodicidade','configuracaoPeriodicidade','peso','criterioConclusao','observacoes'] as const;
export function prepararEdicaoEntregavel(base: Entregavel, dados: DadosPlanejamentoEntregavel, secao = 'completo'): Partial<DadosPlanejamentoEntregavel> {
  const alteracoes: Partial<DadosPlanejamentoEntregavel> = {};
  const permitidos = secao === 'informacoes' ? ['codigo','nome','responsavelId','descricao','observacoes'] : secao === 'planejamento' ? ['tipo','quantidadePrevista','unidadeMedida','inicioPrevisto','terminoPrevisto','peso','criterioConclusao','periodicidade','configuracaoPeriodicidade'] : CAMPOS_PLANEJAMENTO;
  for (const campo of CAMPOS_PLANEJAMENTO) {
    if (!(permitidos as readonly string[]).includes(campo)) continue;
    const atual = base[campo], novo = dados[campo];
    const config = (v: typeof base.configuracaoPeriodicidade | null) => v == null ? null : JSON.stringify([v.versao,v.modoRegistro ?? null]);
    const igual = campo === 'configuracaoPeriodicidade' ? config(base.configuracaoPeriodicidade) === config(dados.configuracaoPeriodicidade)
      : (campo === 'peso' || campo === 'quantidadePrevista') && typeof atual === 'string' && typeof novo === 'string'
        ? normalizarDecimalPlanejamento(atual) === normalizarDecimalPlanejamento(novo) : (atual ?? null) === (novo ?? null);
    if (!igual) (alteracoes as Record<string, unknown>)[campo] = novo;
  }
  if (Object.keys(alteracoes).length && base.versaoPlanejamento) alteracoes.versaoPlanejamento = base.versaoPlanejamento;
  return alteracoes;
}
