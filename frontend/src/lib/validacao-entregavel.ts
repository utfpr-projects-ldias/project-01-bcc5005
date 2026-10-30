import type { Entregavel, EvidenciaEsperada, PeriodicidadeEntregavel, TipoEntregavel } from './entregaveis';

/** O formulário mantém strings decimais, evitando arredondamentos de Number no envio. */
export type ItemChecklistFormulario = Pick<EvidenciaEsperada, 'tipoEvidencia' | 'descricao' | 'obrigatoria'> & {
  id?: string; chave: string;
};
export type RascunhoEntregavel = {
  etapaId: string; nome: string; codigo: string; descricao: string; tipo: TipoEntregavel;
  responsavelId: string; inicioPrevisto: string; terminoPrevisto: string;
  quantidadePrevista: string; unidadeMedida: string; periodicidade: PeriodicidadeEntregavel | '';
  peso: string; criterioConclusao: string; observacoes: string;
  evidenciasEsperadas: ItemChecklistFormulario[];
};
export type DadosPlanejamentoEntregavel = {
  etapaId: string; nome: string; tipo: TipoEntregavel; codigo: string | null; descricao: string | null;
  responsavelId: string | null; inicioPrevisto: string | null; terminoPrevisto: string | null;
  quantidadePrevista: string | null; unidadeMedida: string | null;
  periodicidade: PeriodicidadeEntregavel | null; configuracaoPeriodicidade: { versao: 1 } | null;
  peso: string | null; criterioConclusao: string | null; observacoes: string | null;
  evidenciasEsperadas: { id?: string; tipoEvidencia: string; descricao: string | null; obrigatoria: boolean }[];
};
export type ErrosEntregavel = Record<string, string>;
export const TIPOS: TipoEntregavel[] = ['UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO'];
export const PERIODICIDADES: PeriodicidadeEntregavel[] = ['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'];
export const DESCRICOES_TIPO: Record<TipoEntregavel, string> = {
  UNICO: 'Uma obrigação pontual. O andamento será registrado pelo módulo de execução.',
  QUANTITATIVO: 'Obrigação mensurável: quantidade prevista positiva e unidade são necessárias.',
  RECORRENTE: 'Obrigação que se repete com frequência fixa. As ocorrências serão geradas na HU09.',
  CONTINUO: 'Atividade mantida ao longo do período. O tempo decorrido não representa progresso automático.',
  MARCO: 'Marco contratual atingido em uma condição verificável. A data efetiva será tratada na execução.',
};
const opcional = (texto: string): string | null => texto.trim() || null;
function dataValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
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
    periodicidade: item?.periodicidade ?? '', peso: item?.peso ?? '',
    criterioConclusao: item?.criterioConclusao ?? '', observacoes: item?.observacoes ?? '',
    evidenciasEsperadas: (item?.evidenciasEsperadas ?? []).map((e, indice) => ({ ...e, chave: `existente-${indice}-${e.id}` })),
  };
}
export function mudouEstrutura(r: RascunhoEntregavel, inicial?: Entregavel): boolean {
  return !!inicial && (r.tipo !== inicial.tipo ||
    (r.tipo === 'RECORRENTE' && r.periodicidade !== (inicial.periodicidade ?? '')) ||
    r.inicioPrevisto !== (inicial.inicioPrevisto ?? '') || r.terminoPrevisto !== (inicial.terminoPrevisto ?? '') ||
    r.etapaId !== inicial.etapaId);
}
export function validarEntregavel(r: RascunhoEntregavel): { sucesso: true; dados: DadosPlanejamentoEntregavel } | { sucesso: false; erros: ErrosEntregavel } {
  const erros: ErrosEntregavel = {};
  const nome = r.nome.trim();
  if (!nome || nome.length > 255) erros.nome = 'Informe o nome (até 255 caracteres).';
  for (const [campo, maximo] of [['codigo', 50], ['descricao', 3000], ['unidadeMedida', 80], ['criterioConclusao', 5000], ['observacoes', 3000]] as const) {
    const t = r[campo];
    if (t && (!t.trim() || t.length > maximo)) erros[campo] = `Revise o campo (até ${maximo} caracteres e sem valor somente com espaços).`;
  }
  if (!TIPOS.includes(r.tipo)) erros.tipo = 'Escolha um tipo de entregável válido.';
  if (r.responsavelId.trim() && !uuid4(r.responsavelId.trim())) erros.responsavelId = 'Informe um UUID v4 válido do usuário ativo ou deixe em branco.';
  if (r.inicioPrevisto && !dataValida(r.inicioPrevisto)) erros.inicioPrevisto = 'Data civil inválida.';
  if (r.terminoPrevisto && !dataValida(r.terminoPrevisto)) erros.terminoPrevisto = 'Data civil inválida.';
  if (r.inicioPrevisto && r.terminoPrevisto && r.terminoPrevisto < r.inicioPrevisto) erros.terminoPrevisto = 'O término não pode anteceder o início.';
  if (r.tipo === 'QUANTITATIVO') {
    const qtd = r.quantidadePrevista.trim();
    if (!decimal(qtd, 15, 3) || Number(qtd) <= 0) erros.quantidadePrevista = 'Informe quantidade maior que zero (até 3 casas decimais).';
    if (!r.unidadeMedida.trim() || r.unidadeMedida.length > 80) erros.unidadeMedida = 'Informe a unidade de medida (até 80 caracteres).';
  }
  if (r.tipo === 'RECORRENTE' && !PERIODICIDADES.includes(r.periodicidade as PeriodicidadeEntregavel)) {
    erros.periodicidade = 'Escolha uma periodicidade fixa suportada.';
  }
  if (['CONTINUO', 'MARCO'].includes(r.tipo) && !r.criterioConclusao.trim()) {
    erros.criterioConclusao = 'O critério textual é obrigatório para Contínuo e Marco.';
  }
  if (r.peso.trim() && (!decimal(r.peso.trim(), 3, 4) || Number(r.peso.trim()) > 100)) {
    erros.peso = 'Peso entre 0 e 100, com até 4 casas decimais.';
  }
  if (r.evidenciasEsperadas.length > 100) erros.evidenciasEsperadas = 'Máximo de 100 itens.';
  r.evidenciasEsperadas.forEach((e, indice) => {
    if (!e.tipoEvidencia.trim() || e.tipoEvidencia.length > 100) erros[`evidencias.${indice}.tipoEvidencia`] = 'Informe o tipo da evidência (até 100 caracteres).';
    if (e.descricao && (!e.descricao.trim() || e.descricao.length > 3000)) erros[`evidencias.${indice}.descricao`] = 'Descrição inválida (até 3000 caracteres).';
  });
  if (Object.keys(erros).length) return { sucesso: false, erros };
  return { sucesso: true, dados: {
    etapaId: r.etapaId, nome, tipo: r.tipo, codigo: opcional(r.codigo), descricao: opcional(r.descricao),
    responsavelId: opcional(r.responsavelId), inicioPrevisto: opcional(r.inicioPrevisto),
    terminoPrevisto: opcional(r.terminoPrevisto),
    quantidadePrevista: r.tipo === 'QUANTITATIVO' ? r.quantidadePrevista.trim() : null,
    unidadeMedida: r.tipo === 'QUANTITATIVO' ? opcional(r.unidadeMedida) : null,
    periodicidade: r.tipo === 'RECORRENTE' ? r.periodicidade as PeriodicidadeEntregavel : null,
    configuracaoPeriodicidade: r.tipo === 'RECORRENTE' ? { versao: 1 } : null,
    peso: opcional(r.peso), criterioConclusao: opcional(r.criterioConclusao), observacoes: opcional(r.observacoes),
    evidenciasEsperadas: r.evidenciasEsperadas.map((e) => ({
      ...(e.id ? { id: e.id } : {}), tipoEvidencia: e.tipoEvidencia.trim(), descricao: opcional(e.descricao ?? ''), obrigatoria: e.obrigatoria,
    })),
  } };
}
