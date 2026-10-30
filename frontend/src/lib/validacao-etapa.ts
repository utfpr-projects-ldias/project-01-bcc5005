import { type DadosEtapa, type StatusEtapa } from './etapas';

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

export function validarEtapa(valor: DadosEtapa):
  | { sucesso: true; dados: DadosEtapa }
  | { sucesso: false; erros: ErrosCamposEtapa } {
  const erros: ErrosCamposEtapa = {};
  const nome = valor.nome.trim();
  const codigo = valor.codigo?.trim() || null;
  const inicioPrevisto = valor.inicioPrevisto || null;
  const terminoPrevisto = valor.terminoPrevisto || null;
  const statusValidos: StatusEtapa[] = ['PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA'];
  if (!nome) erros.nome = 'Informe o nome da etapa.';
  else if (nome.length > 255) erros.nome = 'O nome deve ter no máximo 255 caracteres.';
  if (codigo && codigo.length > 50) erros.codigo = 'O código deve ter no máximo 50 caracteres.';
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
