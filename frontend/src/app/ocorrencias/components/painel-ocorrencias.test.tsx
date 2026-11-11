import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PainelOcorrencias } from './painel-ocorrencias';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useOcorrencias } from '@/hooks/use-ocorrencias';

jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn() }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn() }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-ocorrencias', () => ({ useOcorrencias: jest.fn() }));
jest.mock('@/app/contratos/components/modal-etapa', () => ({ ModalEtapa: ({ titulo, children, estadoContextual }: { titulo: string; children: ReactNode; estadoContextual?: string }) => <section role="dialog" aria-label={titulo} data-estado={estadoContextual}>{children}</section> }));

const ocorrencias = useOcorrencias as jest.Mock;
const ocorrencia = { id: 'oc-1', contratoId: 'c-1', entregavelId: 'e-1', titulo: 'Medição de outubro',
  origem: 'MANUAL_QUANTITATIVA', periodoInicio: '2026-10-01', periodoFim: '2026-10-31', dataPrevista: '2026-11-05',
  dataRealizada: null, status: 'EM_ANDAMENTO', quantidadeRealizada: null, observacoes: null };

beforeEach(() => {
  jest.clearAllMocks();
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { podeEditar: true }, erro: null });
  (useMeuPerfil as jest.Mock).mockReturnValue({ dados: { perfil: 'GESTOR', ativo: true } });
  (useEtapas as jest.Mock).mockReturnValue({ dados: [{ id: 'etapa-1', status: 'PLANEJADA', arquivadoEm: null }] });
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'QUANTITATIVO', nome: 'Medições', statusExecucao: 'EM_EXECUCAO', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [ocorrencia], loading: false, erro: null, criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
});

test('agenda vinculada usa cores do status real e abre detalhes pelo cartão', () => {
  render(<PainelOcorrencias contratoId="c-1" embutido />);
  expect(screen.getByRole('heading', { name: /Ocorrências do contrato/ })).toBeInTheDocument();
  const card = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(card).toHaveClass('border-[#65813b]/65');
  expect(card.className).not.toContain('teal');
  expect(card.className).not.toContain('violet');
  fireEvent.click(card);
  expect(screen.getByRole('dialog', { name: 'Medição de outubro' })).toHaveAttribute('data-estado', 'andamento');
});

test('situação não iniciada mantém cores neutras sem confundir com conclusão', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'NAO_INICIADO' }], loading: false, erro: null,
    criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
  render(<PainelOcorrencias contratoId="c-1" />);
  const card = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(card).toHaveClass('border-neutral-400/50');
  expect(card.className).not.toContain('border-violet');
  expect(screen.getByText('Não iniciada')).toBeInTheDocument();
});

test('somente a ocorrência realmente concluída recebe o estilo violeta', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'CONCLUIDO' }], loading: false, erro: null,
    criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
  render(<PainelOcorrencias contratoId="c-1" />);
  const card = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(card).toHaveClass('border-violet-400/45');
  expect(screen.getByText('Concluída')).toBeInTheDocument();
});

test('painel somente leitura preserva consulta e não permite cadastro nem edição', () => {
  render(<PainelOcorrencias contratoId="c-1" somenteLeitura />);
  expect(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Nova ocorrência/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.queryByRole('button', { name: 'Editar ocorrência' })).not.toBeInTheDocument();
});

test('filtro de situação usa enum do backend, não valores antigos de frontend', () => {
  render(<PainelOcorrencias contratoId="c-1" />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar situação das ocorrências' }), { target: { value: 'CONCLUIDO' } });
  expect(screen.queryByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Nenhuma ocorrência corresponde/)).toBeInTheDocument();
});


test('contrato em revisão colore painel e cadastro; filho não iniciado tem estado neutro próprio', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'NAO_INICIADO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" estadoContextual="revisao" embutido />);
  expect(screen.getByRole('region', { name: 'Ocorrências do contrato' })).toHaveAttribute('data-tec08-estado', 'revisao');
  const cadastrar = screen.getByRole('button', { name: /Nova ocorrência/ });
  expect(cadastrar).toHaveAttribute('data-pi-acao', 'primaria');
  fireEvent.click(cadastrar);
  expect(screen.getByRole('dialog', { name: 'Nova ocorrência' })).toHaveAttribute('data-estado', 'revisao');
});

test('ocorrência concluída mantém ações contextuais roxas ao editar, cancelar e salvar', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'CONCLUIDO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" estadoContextual="revisao" embutido />);
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.getByRole('dialog', { name: ocorrencia.titulo })).toHaveAttribute('data-estado', 'concluido');
  const editar = screen.getByRole('button', { name: 'Editar ocorrência' });
  expect(editar).toHaveAttribute('data-pi-acao', 'secundaria');
  fireEvent.click(editar);
  expect(screen.getByRole('button', { name: 'Cancelar edição' })).toHaveAttribute('data-pi-acao', 'secundaria');
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveAttribute('data-pi-acao', 'primaria');
});

test('entregável de etapa concluída não permite gerar ou cadastrar; explica o impedimento', () => {
  (useEtapas as jest.Mock).mockReturnValue({ dados: [{ id: 'etapa-1', status: 'CONCLUIDA', arquivadoEm: null }] });
  render(<PainelOcorrencias contratoId="c-1" />);
  expect(screen.queryByRole('button', { name: /Nova ocorrência/ })).not.toBeInTheDocument();
  expect(screen.getByText(/crie ou reabra um entregável/)).toBeInTheDocument();
});

test('gestor com edição genérica mas sem permissão efetiva de criar/editar não recebe ações', () => {
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { podeEditar: true, permissoes: { criarEntregaveis: false, editarEntregaveis: false } }, erro: null });
  render(<PainelOcorrencias contratoId="c-1" />);
  expect(screen.queryByRole('button', { name: /Nova ocorrência/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.queryByRole('button', { name: 'Editar ocorrência' })).not.toBeInTheDocument();
});
