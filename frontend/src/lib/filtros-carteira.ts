import type { Contrato } from './contratos';
import type { AbaCarteira, CampoCarteira } from './estado-lista-contratos';
import { situacaoVisivelContrato } from './estado-visivel-contrato';

type Opcao = { valor: string; rotulo: string };
const fases: Opcao[] = [
  { valor: 'PLANEJAMENTO', rotulo: 'Planejamento' },
  { valor: 'EM_EXECUCAO', rotulo: 'Em execução' },
];
const pendentes: Opcao[] = [
  { valor: 'PENDENTE_CONCLUSAO', rotulo: 'Pendente de conclusão' },
  { valor: 'PENDENTE_CONCLUSAO_PARCIAL', rotulo: 'Pendente de conclusão parcial' },
  { valor: 'PENDENTE_ENCERRAMENTO', rotulo: 'Pendente de encerramento' },
];
const finais: Opcao[] = [
  { valor: 'CONCLUIDO', rotulo: 'Concluído' },
  { valor: 'CONCLUIDO_PARCIALMENTE', rotulo: 'Concluído parcialmente' },
  { valor: 'ENCERRADO', rotulo: 'Encerrado' },
];
const adicionais: Opcao[] = [{ valor: 'SUSPENSO', rotulo: 'Suspenso' }, { valor: 'CANCELADO', rotulo: 'Cancelado' }, { valor: 'ARQUIVADO', rotulo: 'Arquivado' }];
/** A fase preparatória antiga não é oferecida como filtro. */
export function opcoesStatusCarteira(aba: AbaCarteira): Opcao[] {
  switch (aba) {
    case 'todos': return [...fases, ...pendentes.filter(o => o.valor === 'PENDENTE_ENCERRAMENTO'), ...adicionais.filter(o => o.valor !== 'ARQUIVADO')];
    case 'ativos': return fases;
    case 'revisao': return fases;
    case 'pendentes': return pendentes;
    case 'concluidos': return finais;
    case 'arquivados': return adicionais.filter(o => o.valor === 'ARQUIVADO');
    case 'suspensos': return adicionais.filter(o => o.valor === 'SUSPENSO');
    case 'cancelados': return adicionais.filter(o => o.valor === 'CANCELADO');
  }
}
export function filtroCompativel(aba: AbaCarteira, valor: string): string {
  // Compatibilidade com a preferência salva antes da separação dos filtros.
  const fase = valor.startsWith('REVISAO:') ? valor.slice('REVISAO:'.length) : valor;
  return opcoesStatusCarteira(aba).some(o => o.valor === fase) ? fase : '';
}
export function rotuloPendenteContrato(c: Pick<Contrato, 'conclusaoParcialSolicitada' | 'encerramentoSolicitado'>): string {
  return c.encerramentoSolicitado ? 'Pendente de encerramento' : c.conclusaoParcialSolicitada ? 'Pendente de conclusão parcial' : 'Pendente de conclusão';
}
export function correspondeStatusCarteira(c: Contrato, filtro: string, pendenteRemoto = false): boolean {
  if (!filtro) return true;
  const situacao = situacaoVisivelContrato(c, pendenteRemoto);
  if (situacao === 'arquivados') return filtro === 'ARQUIVADO';
  // A revisão é uma condição sobre a fase persistida, não uma fase concorrente.
  // A aba restringe a situação; o seletor restringe a fase tanto em Todos quanto em Revisão.
  const fase = c.status === 'EM_ENCERRAMENTO' ? 'EM_EXECUCAO' : c.status;
  if (situacao === 'revisao') return fases.some(f => f.valor === filtro) && fase === filtro;
  if (situacao === 'pendentes') return filtro === (c.encerramentoSolicitado ? 'PENDENTE_ENCERRAMENTO' : c.conclusaoParcialSolicitada ? 'PENDENTE_CONCLUSAO_PARCIAL' : 'PENDENTE_CONCLUSAO');
  if (situacao === 'concluidos' && ['FINALIZADO','ENCERRADO'].includes(c.status)) return filtro === 'ENCERRADO';
  return fase === filtro;
}
export function correspondeBuscaCarteira(c: Contrato, busca: string, campo: CampoCarteira): boolean {
  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  if (!termo) return true;
  const valores = { numero: c.numeroContrato, codigo: c.codigoPublico, orgao: c.orgaoContratante, objeto: c.objeto };
  const contem = (chave: keyof typeof valores) => (valores[chave] ?? '').toLocaleLowerCase('pt-BR').includes(chave === 'codigo' && termo.startsWith('#') ? termo.slice(1) : termo);
  return campo === 'todos' ? (Object.keys(valores) as (keyof typeof valores)[]).some(contem) : contem(campo);
}
