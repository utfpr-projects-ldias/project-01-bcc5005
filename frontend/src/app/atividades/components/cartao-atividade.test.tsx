import { fireEvent, render, screen, within } from '@testing-library/react';
import { CartaoAtividade } from './cartao-atividade';
import type { Atividade } from '@/hooks/use-atividades';

jest.mock('@/app/components/provedor-consultas', () => ({ useRepositorioConsultasOpcional: () => null }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: () => ({ dados: [], carregando: false, erro: null }) }));
const atividade: Atividade = { id: 'b'.repeat(36), contratoId: 'a'.repeat(36), titulo: 'Reunião semanal', tipo: 'Reunião',
  descricao: 'Relato da equipe', dataHora: '2026-11-09T15:00:00.000Z', responsavel: 'Equipe', participantes: [],
  local: null, duracao: null, observacoes: null, entregaveis: [], status: 'REGISTRADA', verificadaEm: null, arquivadaEm: null };

test('mesmo cartão oferece verificar sem justificativa, somente a quem tem permissão', () => {
  render(<CartaoAtividade atividade={atividade} contratoId={atividade.contratoId} permissoes={{ verificarAtividades: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
  expect(screen.getByRole('dialog', { name: 'Verificar atividade' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Justificativa *')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
});
test('somente arquivada pode mostrar excluir, com autorização explícita', () => {
  const props = { atividade: { ...atividade, status: 'ARQUIVADA' as const }, contratoId: atividade.contratoId };
  const { rerender } = render(<CartaoAtividade {...props} permissoes={{ excluirAtividadesArquivadas: false }} />);
  expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument();
  rerender(<CartaoAtividade {...props} permissoes={{ excluirAtividadesArquivadas: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
  expect(screen.getByLabelText('Justificativa *')).toBeRequired();
});


test('o cartão abre detalhe contextual em modal, sem mudar de rota', () => {
  render(<CartaoAtividade atividade={atividade} contratoId={atividade.contratoId} />);
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da atividade Reunião semanal/ }));
  expect(screen.getByRole('dialog', { name: 'Reunião semanal' })).toBeInTheDocument();
  expect(screen.getAllByText('Relato da equipe').length).toBeGreaterThan(1);
  expect(within(screen.getByRole('dialog', { name: 'Reunião semanal' })).queryByRole('button', { name: /Ver contrato|Editar registro/ })).not.toBeInTheDocument();
});

test('em lista do entregável não mostra botão que reabre o próprio entregável', () => {
  const item = { ...atividade, entregaveis: [{ id: 'entregavel-1', nome: 'Relatório de execução' }] };
  render(<CartaoAtividade atividade={item} contratoId={item.contratoId} dentroEntregavel />);
  expect(screen.queryByRole('button', { name: /Ver entregável Relatório de execução/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da atividade/ }));
  expect(screen.getByRole('dialog', { name: item.titulo })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ver contrato' })).not.toBeInTheDocument();
});

test('o próprio cartão, além de Ver detalhes, abre o diálogo da atividade', () => {
  const { container } = render(<CartaoAtividade atividade={atividade} contratoId={atividade.contratoId} />);
  const cartao = container.querySelector('[data-atividade-id]');
  expect(cartao).not.toBeNull();
  fireEvent.click(cartao!);
  expect(screen.getByRole('dialog', { name: atividade.titulo })).toBeInTheDocument();
});


test('edição permanece apenas no cartão, não no modal de detalhes da atividade', () => {
  const onEditar = jest.fn();
  render(<CartaoAtividade atividade={atividade} contratoId={atividade.contratoId}
    permissoes={{ editarAtividades: true }} onEditar={onEditar} />);
  const editar = screen.getByRole('button', { name: 'Editar' });
  expect(editar).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
  const modal = screen.getByRole('dialog', { name: atividade.titulo });
  expect(within(modal).queryByRole('button', { name: /Editar|Ver contrato/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes da atividade' }));
  fireEvent.click(editar);
  expect(onEditar).toHaveBeenCalledTimes(1);
});

test('cartão mostra até dois vínculos truncados e reticências para os outros, sem links', () => {
  const exemplo = { ...atividade, entregaveis: [
    { id: 'ent-1', nome: 'Entregável de nome muito longo que não deve extrapolar o espaço do cartão' },
    { id: 'ent-2', nome: 'Relatório semanal' },
    { id: 'ent-3', nome: 'Terceiro entregável' },
    { id: 'ent-4', nome: 'Quarto entregável' },
  ] };
  render(<CartaoAtividade atividade={exemplo} contratoId={atividade.contratoId} />);
  const grupo = screen.getByLabelText('Entregáveis vinculados à atividade');
  expect(within(grupo).getByText(/Entregável de nome muito longo/)).toHaveClass('truncate');
  expect(within(grupo).getByText('Relatório semanal')).toBeInTheDocument();
  expect(within(grupo).queryByText('Terceiro entregável')).not.toBeInTheDocument();
  expect(within(grupo).queryByText('Quarto entregável')).not.toBeInTheDocument();
  expect(within(grupo).getByLabelText('2 entregáveis adicionais')).toHaveTextContent('…');
  expect(within(grupo).queryByRole('link')).not.toBeInTheDocument();
  expect(within(grupo).queryByRole('button')).not.toBeInTheDocument();
});

test('Ver entregáveis abre lista completa em segundo modal, fecha por X e fora', () => {
  const exemplo = { ...atividade, entregaveis: [
    { id: 'ent-1', nome: 'Primeiro entregável' },
    { id: 'ent-2', nome: 'Segundo entregável' },
    { id: 'ent-3', nome: 'Terceiro entregável' },
  ] };
  render(<CartaoAtividade atividade={exemplo} contratoId={atividade.contratoId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
  fireEvent.click(screen.getByRole('button', { name: /Ver entregáveis/ }));
  const lista = screen.getByRole('dialog', { name: 'Entregáveis vinculados' });
  expect(within(lista).getByText('Primeiro entregável')).toBeInTheDocument();
  expect(within(lista).getByText('Segundo entregável')).toBeInTheDocument();
  expect(within(lista).getByText('Terceiro entregável')).toBeInTheDocument();
  expect(within(lista).queryByRole('button', { name: /Abrir|Editar|Ver contrato/ })).not.toBeInTheDocument();
  fireEvent.click(within(lista).getByRole('button', { name: 'Fechar lista de entregáveis' }));
  expect(screen.queryByRole('dialog', { name: 'Entregáveis vinculados' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver entregáveis/ }));
  const fundo = screen.getByRole('dialog', { name: 'Entregáveis vinculados' }).parentElement;
  expect(fundo).not.toBeNull();
  fireEvent.mouseDown(fundo!);
  expect(screen.queryByRole('dialog', { name: 'Entregáveis vinculados' })).not.toBeInTheDocument();
});


test('justificativa obrigatória mostra mínimo e máximo com contador e acessibilidade', () => {
  const exemplo = { ...atividade, status: 'VERIFICADA' as const };
  render(<CartaoAtividade atividade={exemplo} contratoId={exemplo.contratoId} permissoes={{ arquivarAtividades: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
  const modal = screen.getByRole('dialog', { name: 'Arquivar atividade' });
  expect(within(modal).getByText('Obrigatória: mínimo de 15 e máximo de 200 caracteres.')).toBeInTheDocument();
  const justificativa = within(modal).getByRole('textbox', { name: 'Justificativa *' });
  expect(justificativa).toHaveAttribute('minlength', '15');
  expect(justificativa).toHaveAttribute('maxlength', '200');
  expect(within(modal).getByText('0/200 caracteres')).toBeInTheDocument();
  fireEvent.change(justificativa, { target: { value: 'Muito breve' } });
  expect(justificativa).toHaveAttribute('aria-invalid', 'true');
  expect(within(modal).getByText('11/200 caracteres')).toBeInTheDocument();
  fireEvent.change(justificativa, { target: { value: 'Justificativa suficiente para arquivar' } });
  expect(justificativa).toHaveAttribute('aria-invalid', 'false');
});

test('lista de entregáveis substitui o detalhe da atividade e devolve ao detalhe ao fechar', () => {
  const exemplo = { ...atividade, entregaveis: [{ id: 'e1', nome: 'Primeiro entregável' }] };
  render(<CartaoAtividade atividade={exemplo} contratoId={exemplo.contratoId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
  const titulo = screen.getByRole('dialog', { name: exemplo.titulo });
  expect(titulo).toBeInTheDocument();
  fireEvent.click(within(titulo).getByRole('button', { name: /Ver entregáveis/ }));
  expect(screen.getByRole('dialog', { name: 'Entregáveis vinculados' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: exemplo.titulo })).not.toBeInTheDocument();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Fechar lista de entregáveis' }));
  expect(screen.getByRole('dialog', { name: exemplo.titulo })).toBeInTheDocument();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});


test('fechar modal clicando fora não reabre o cartão via bubbling de portal', () => {
  render(<CartaoAtividade atividade={atividade} contratoId={atividade.contratoId} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
  const modal = screen.getByRole('dialog', { name: atividade.titulo });
  fireEvent.mouseDown(modal.parentElement!);
  fireEvent.click(modal.parentElement!);
  expect(screen.queryByRole('dialog', { name: atividade.titulo })).not.toBeInTheDocument();
});


test('ícone de vínculo é uma caixa SVG, sem símbolo tipográfico no card', () => {
  const exemplo = { ...atividade, entregaveis: [{ id: 'e1', nome: 'Entregável de teste' }] };
  const { container } = render(<CartaoAtividade atividade={exemplo} contratoId={exemplo.contratoId} />);
  expect(container.querySelector('[aria-label="Entregáveis vinculados à atividade"] [data-tec08-icone-entregavel]')).toBeInTheDocument();
  expect(container.querySelector('[aria-label="Entregáveis vinculados à atividade"]')?.textContent).not.toContain('▣');
});


test('verificada usa paleta própria no cartão, modal, link de detalhes e vínculo', () => {
  const verificada = { ...atividade, status: 'VERIFICADA' as const,
    entregaveis: [{ id: 'entregavel1', nome: 'Entregável validado' }] };
  const { container } = render(<CartaoAtividade atividade={verificada} contratoId={verificada.contratoId}
    estadosEntregaveis={{ entregavel1: 'revisao' }} />);
  const cartao = container.querySelector('[data-atividade-estado="VERIFICADA"]');
  expect(cartao).toHaveClass('border-violet-400/50');
  expect(within(cartao as HTMLElement).getByRole('button', { name: 'Ver detalhes' })).toHaveClass('text-violet-300');
  fireEvent.click(screen.getByRole('button', { name: /Abrir cartão da atividade/ }));
  expect(screen.getByRole('dialog', { name: verificada.titulo })).toHaveAttribute('data-tec08-estado', 'concluido');
  fireEvent.click(screen.getByRole('button', { name: /Ver entregáveis/ }));
  expect(screen.getByRole('dialog', { name: 'Entregáveis vinculados' })).toHaveAttribute('data-tec08-estado', 'concluido');
  expect(container.querySelector('[data-entregavel-estado="revisao"]')).not.toBeInTheDocument(); // modal fica em portal
  expect(document.querySelector('[data-entregavel-estado="revisao"]')).toHaveClass('border-teal-500/45');
});

test('arquivada mantém paleta própria e abre pelo teclado', () => {
  const arquivada = { ...atividade, status: 'ARQUIVADA' as const };
  const { container } = render(<CartaoAtividade atividade={arquivada} contratoId={arquivada.contratoId} />);
  expect(container.querySelector('[data-atividade-estado="ARQUIVADA"]')).toHaveClass('border-amber-500/50');
  fireEvent.keyDown(screen.getByRole('button', { name: /Abrir cartão da atividade/ }), { key: 'Enter' });
  expect(screen.getByRole('dialog', { name: arquivada.titulo })).toHaveAttribute('data-tec08-estado', 'arquivado');
});

test('edição no cartão da aba do entregável abre modal, não navega para /atividades', () => {
  render(<CartaoAtividade atividade={atividade} contratoId={atividade.contratoId}
    dentroEntregavel permissoes={{ editarAtividades: true }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  const modal = screen.getByRole('dialog', { name: 'Editar atividade' });
  expect(modal).toBeInTheDocument();
  expect(within(modal).getByRole('form', { name: 'Formulário de edição da atividade' })).toBeInTheDocument();
  expect(within(modal).getByRole('textbox', { name: 'Descrição *' })).toHaveValue('Relato da equipe');
  expect(screen.queryByRole('link', { name: 'Editar' })).not.toBeInTheDocument();
});
