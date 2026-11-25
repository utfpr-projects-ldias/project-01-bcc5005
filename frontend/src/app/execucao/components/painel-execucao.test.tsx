import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PainelExecucao } from './painel-execucao';
import { useProgresso } from '@/hooks/use-progresso';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato } from '@/hooks/use-contratos';

jest.mock('@/hooks/use-entregaveis', () => ({ useResumoDocumentalContrato: () => ({ dados: {} }) }));
jest.mock('@/hooks/use-progresso', () => ({ useProgresso: jest.fn() }));
jest.mock('@/hooks/use-ocorrencias', () => ({ useOcorrencias: jest.fn() }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: jest.fn() }));
jest.mock('@/app/contratos/components/modal-etapa', () => ({
  ModalEtapa: ({ titulo, children, onFechar, estadoContextual }: { titulo: string; children: ReactNode; onFechar: () => void; estadoContextual: string }) =>
    <section role="dialog" aria-label={titulo} data-estado={estadoContextual}>{children}<button onClick={onFechar}>Fechar</button></section>,
}));

const item = {
  entregavelId: 'e-1', nome: 'Serviços mensais', tipo: 'RECORRENTE', realizado: '0', previsto: null,
  percentualExecucao: null, pesoOperacional: '22.0000', dataEfetivaMarco: null, fonte: 'AGENDA',
  statusFisico: 'NAO_AVALIADO', editavel: true, inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-12-31',
};
const resultado = {
  contratoId: 'c-1', modoCalculo: 'SIMPLES', avanco: null, avancoSimples: null, avancoPonderado: null,
  versaoPesos: 'versao', configuracaoPendente: false, editavelPesos: true,
  pesosValidos: false, somaPesos: 22, entregaveis: [item],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useProgresso as jest.Mock).mockReturnValue({ progresso: resultado, loading: false, erro: null,
    atualizarPesos: jest.fn(), atualizarModoCalculo: jest.fn(), atualizarExecucao: jest.fn() });
  (useOcorrencias as jest.Mock).mockReturnValue({ ocorrencias: [], loading: false, erro: null });
  (useMeuPerfil as jest.Mock).mockReturnValue({ dados: { perfil: 'ADMINISTRADOR', ativo: true } });
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { permissoes: { editarContrato: true, editarEntregaveis: true } }, erro: null });
});

test('execução usa contexto do contrato, explica pesos e apresenta detalhes em modal, sem navegação', () => {
  render(<PainelExecucao contratoId="c-1" estadoContextual="revisao" />);
  expect(screen.getByRole('region', { name: 'Execução física' })).toHaveAttribute('data-tec08-estado', 'revisao');
  expect(screen.getByRole('button', { name: 'Configurar pesos da execução' })).toBeInTheDocument();
  expect(screen.queryByText('Modo visual')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes da execução de Serviços mensais' }));
  expect(screen.getByRole('dialog', { name: 'Serviços mensais' })).toHaveAttribute('data-estado', 'nao-iniciado');
  expect(screen.getByText('Períodos previstos')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Ir para ocorrências' })).not.toBeInTheDocument();
});

test('pesos têm explicação e campo sem seta nativa, e operações exigem autorização', () => {
  render(<PainelExecucao contratoId="c-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Configurar pesos da execução' }));
  expect(screen.getByRole('dialog', { name: 'Editar execução' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', {name:'Peso operacional de Serviços mensais'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:/Média ponderada/}));
  const entrada=screen.getByRole('textbox',{name:'Peso operacional de Serviços mensais'});
  expect(entrada).toHaveAttribute('inputmode','decimal');
  expect(entrada).toHaveValue('22,0000');
  const salvar=screen.getByRole('button',{name:'Salvar alterações'});
  expect(salvar).toBeEnabled();
  fireEvent.change(entrada,{target:{value:'20'}});
  expect(salvar).toBeEnabled();
  fireEvent.click(salvar);
  expect((useProgresso as jest.Mock).mock.results[0].value.atualizarPesos).toHaveBeenCalledWith('versao',[{entregavelId:'e-1',peso:'20'}]);
});

test('usuário sem permissão apenas consulta o cálculo, sem editar os pesos', () => {
  (useMeuPerfil as jest.Mock).mockReturnValue({ dados: { perfil: 'COLABORADOR', ativo: true } });
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { permissoes: { editarContrato: false, editarEntregaveis: false } }, erro: null });
  render(<PainelExecucao contratoId="c-1" />);
  expect(screen.queryByRole('button', { name: 'Configurar pesos da execução' })).not.toBeInTheDocument();
});


test('no modal do entregável mostra o avanço sem aba duplicada de ocorrências', () => {
  render(<PainelExecucao contratoId="c-1" entregavelId="e-1" estadoContextual="revisao" />);
  expect(screen.getByRole('region', { name: 'Execução física' })).toHaveAttribute('data-tec08-estado', 'revisao');
  expect(screen.queryByRole('button', { name: 'Ver detalhes da execução de Serviços mensais' })).not.toBeInTheDocument();
  expect(screen.getByText('Períodos previstos')).toBeInTheDocument();
  expect(screen.queryByRole('tab', { name: /Ocorrências/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Serviços mensais' })).not.toBeInTheDocument();
});


test('aba geral renderiza a lista e atualiza sua contagem ao filtrar, sem ReferenceError', () => {
  render(<PainelExecucao contratoId="c-1" estadoContextual="revisao" />);
  expect(screen.getByText('1 de 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ver detalhes da execução de Serviços mensais' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Finalizados' }));
  expect(screen.getByText('0 de 1')).toBeInTheDocument();
  expect(screen.getByText('Nenhum entregável corresponde ao filtro selecionado.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Não iniciados' }));
  expect(screen.getByText('1 de 1')).toBeInTheDocument();
});


test('R45: na aba Execução do contrato delega a abertura pelo ID real, sem montar o editor isolado', () => {
  const abrir=jest.fn();
  render(<PainelExecucao contratoId="c-1" onAbrirEntregavel={abrir}/>);
  const card=screen.getByRole('button',{name:'Ver detalhes da execução de Serviços mensais'});
  fireEvent.click(card);
  expect(abrir).toHaveBeenCalledTimes(1);
  expect(abrir).toHaveBeenCalledWith('e-1',card);
  expect(screen.queryByRole('dialog',{name:'Serviços mensais'})).not.toBeInTheDocument();
});

test('R45: editor físico contextual continua acessível a quem pode registrar, sem abrir outro modal', () => {
  (useProgresso as jest.Mock).mockReturnValue({progresso:{...resultado,entregaveis:[{...item,tipo:'UNICO',fonte:'MANUAL',percentualExecucao:25}]},loading:false,erro:null,atualizarExecucao:jest.fn()});
  render(<PainelExecucao contratoId="c-1" entregavelId="e-1"/>);
  expect(screen.getByLabelText('Percentual físico realizado (0 a 100)')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('R45: contexto bloqueado não permite editar o avanço mesmo para administrador', () => {
  (useProgresso as jest.Mock).mockReturnValue({progresso:{...resultado,entregaveis:[{...item,tipo:'UNICO',fonte:'MANUAL',percentualExecucao:25}]},loading:false,erro:null});
  render(<PainelExecucao contratoId="c-1" entregavelId="e-1" somenteLeitura/>);
  expect(screen.queryByLabelText('Percentual físico realizado (0 a 100)')).not.toBeInTheDocument();
});


test('R45 revisado: revisão, pendência e avanço físico integral sem aprovação permanecem nas categorias corretas', () => {
  const registros = [
    {...item, entregavelId:'rev', nome:'Reaberto', statusEntregavel:'CONCLUIDO', reabertoEm:'2026-11-24', percentualExecucao:100, statusFisico:'CONCLUIDO'},
    {...item, entregavelId:'pend', nome:'Aguardando aprovação', statusEntregavel:'PENDENTE_ENCERRAMENTO', percentualExecucao:25, statusFisico:'EM_ANDAMENTO'},
    {...item, entregavelId:'int', nome:'Integral sem decisão', statusEntregavel:'EM_ANDAMENTO', percentualExecucao:100, statusFisico:'CONCLUIDO'},
    {...item, entregavelId:'fim', nome:'Aprovado', statusEntregavel:'CONCLUIDO', percentualExecucao:100, statusFisico:'CONCLUIDO'},
  ];
  (useProgresso as jest.Mock).mockReturnValue({progresso:{...resultado,entregaveis:registros},loading:false,erro:null});
  render(<PainelExecucao contratoId="c-1"/>);
  for (const [aba,nome] of [['Em revisão','Reaberto'],['Pendentes','Aguardando aprovação'],['Em andamento','Integral sem decisão'],['Finalizados','Aprovado']]) {
    fireEvent.click(screen.getByRole('tab',{name:aba}));
    expect(screen.getByText('1 de 4')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:`Ver detalhes da execução de ${nome}`})).toBeInTheDocument();
  }
});

test('recorrente iniciado com 0% e prazo vencido permanece em andamento', () => {
  (useProgresso as jest.Mock).mockReturnValue({progresso:{...resultado,entregaveis:[{...item,statusEntregavel:'EM_ANDAMENTO',statusFisico:'NAO_INICIADO',percentualExecucao:0,atrasado:true}]},loading:false,erro:null});
  render(<PainelExecucao contratoId="c-1"/>);
  fireEvent.click(screen.getByRole('tab',{name:'Em andamento'}));
  expect(screen.getByRole('button',{name:'Ver detalhes da execução de Serviços mensais'})).toBeInTheDocument();
  expect(screen.getByText('Atrasado')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:'Não iniciados'}));
  expect(screen.queryByRole('button',{name:'Ver detalhes da execução de Serviços mensais'})).not.toBeInTheDocument();
});
