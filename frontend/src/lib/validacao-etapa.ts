import { type DadosEtapa, type StatusEtapa } from './etapas';

export const LIMITES_ETAPA = { codigo: 15, nome: 36, descricao: 400, observacoes: 150 } as const;

export const DADOS_ETAPA_INICIAIS: DadosEtapa = {
  codigo: null, nome: '', descricao: null, inicioPrevisto: null,
  terminoPrevisto: null, status: 'PLANEJADA', observacoes: null,
};
export type ErrosCamposEtapa = Partial<Record<keyof DadosEtapa, string>>;

function dataCivilValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const d = new Date(`${data}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === data;
}

export function validarEtapa(valor: DadosEtapa, inicial?: Partial<DadosEtapa>):
  | { sucesso: true; dados: DadosEtapa }
  | { sucesso: false; erros: ErrosCamposEtapa } {
  const erros: ErrosCamposEtapa = {};
  const nome = valor.nome.trim();
  const codigo = valor.codigo?.trim() || null;
  const inicioPrevisto = valor.inicioPrevisto || null;
  const terminoPrevisto = valor.terminoPrevisto || null;
  const statusValidos: StatusEtapa[] = ['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'ENCERRADA'];
  if (!nome) erros.nome = 'Informe o nome da etapa.';
  else if (nome.length > LIMITES_ETAPA.nome && nome !== inicial?.nome) erros.nome = `O nome deve ter no máximo ${LIMITES_ETAPA.nome} caracteres.`;
  if (codigo && codigo.length > LIMITES_ETAPA.codigo && codigo !== inicial?.codigo) erros.codigo = `O código deve ter no máximo ${LIMITES_ETAPA.codigo} caracteres.`;
  if (valor.descricao && valor.descricao.length > LIMITES_ETAPA.descricao && valor.descricao !== inicial?.descricao) erros.descricao = `Descrição: máximo de ${LIMITES_ETAPA.descricao} caracteres.`;
  if (valor.observacoes && valor.observacoes.length > LIMITES_ETAPA.observacoes && valor.observacoes !== inicial?.observacoes) erros.observacoes = `Observações: máximo de ${LIMITES_ETAPA.observacoes} caracteres.`;
  if (inicioPrevisto && !dataCivilValida(inicioPrevisto)) erros.inicioPrevisto = 'Informe uma data de início válida.';
  if (terminoPrevisto && !dataCivilValida(terminoPrevisto)) erros.terminoPrevisto = 'Informe uma data de término válida.';
  if (!erros.inicioPrevisto && !erros.terminoPrevisto && inicioPrevisto && terminoPrevisto && terminoPrevisto < inicioPrevisto) {
    erros.terminoPrevisto = 'O término não pode ocorrer antes do início.';
  }
  if (!statusValidos.includes(valor.status)) erros.status = 'Selecione um status válido.';
  if (Object.keys(erros).length) return { sucesso: false, erros };
  return {
    sucesso: true,
    dados: {
      nome, codigo, descricao: valor.descricao?.trim() || null,
      inicioPrevisto, terminoPrevisto, status: valor.status,
      observacoes: valor.observacoes?.trim() || null,
    },
  };
}
