import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PainelExecucao } from './painel-execucao';
import { useProgresso } from '@/hooks/use-progresso';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato } from '@/hooks/use-contratos';

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
  expect(screen.getByRole('dialog', { name: 'Configurar pesos' })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Novo peso de Serviços mensais' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Editar peso de Serviços mensais' }));
  const entrada = screen.getByRole('textbox', { name: 'Novo peso de Serviços mensais' });
  expect(entrada).toHaveAttribute('inputmode', 'decimal');
  expect(entrada).toHaveValue('22');
  expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
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
