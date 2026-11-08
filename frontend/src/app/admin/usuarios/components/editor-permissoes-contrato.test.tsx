import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EditorPermissoesContrato } from './editor-permissoes-contrato';

test('ADMIN configura permissões específicas inclusive obrigatoriedade, sem afetar contratos diferentes', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  render(<EditorPermissoesContrato
    perfil="GESTOR" vinculo={{ contratoId: 'contrato-a', podeEditar: true, permissoesDetalhadas: null }}
    salvando={false} onSalvar={salvar} />);
  fireEvent.click(screen.getByText('Ver permissões completas'));
  expect(screen.getByRole('dialog', { name: 'Permissões do contrato' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Permissões: Contrato' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências' }));
  expect(screen.getByRole('region', { name: 'Permissões: Evidências' })).toBeInTheDocument();
  const obrigatoriedade = screen.getByRole('checkbox', { name: 'Alterar obrigatoriedade de evidências' });
  expect(obrigatoriedade).not.toBeChecked();
  fireEvent.click(obrigatoriedade);
  expect(obrigatoriedade).toBeChecked();
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis' }));
  fireEvent.click(screen.getByRole('tab', { name: /Arquivamento e exclusão/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Arquivar entregáveis' }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledWith(expect.objectContaining({
    alterarObrigatoriedade: true, arquivarEntregaveis: false,
  })));
});
test('COLABORADOR recebe ações restritas por padrão, mas administrador pode delegar pontualmente', () => {
  render(<EditorPermissoesContrato perfil="COLABORADOR"
    vinculo={{ contratoId: 'contrato-b', podeEditar: false }} salvando={false}
    onSalvar={async () => undefined} />);
  fireEvent.click(screen.getByText('Ver permissões completas'));
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByRole('checkbox', { name: 'Criar etapas' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências' }));
  fireEvent.click(screen.getByRole('tab', { name: /Comprovação e revisão/ }));
  expect(screen.getByRole('checkbox', { name: 'Enviar comprovantes' })).toBeChecked();
  fireEvent.click(screen.getByRole('tab', { name: /Cadastro e critérios/ }));
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências' }));
  expect(screen.getByRole('checkbox', { name: 'Alterar obrigatoriedade de evidências' })).not.toBeChecked();
});

test('permissões são editadas em modal: fechar por Escape não persiste alterações', () => {
  const salvar = jest.fn();
  render(<EditorPermissoesContrato perfil="GESTOR" vinculo={{ contratoId: 'contrato-c', podeEditar: true }}
    salvando={false} onSalvar={salvar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver permissões completas' }));
  const modal = screen.getByRole('dialog', { name: 'Permissões do contrato' });
  fireEvent.click(within(modal).getByRole('tab', { name: 'Evidências' }));
  fireEvent.click(within(modal).getByRole('checkbox', { name: 'Alterar obrigatoriedade de evidências' }));
  const voltar = jest.spyOn(window.history, 'back').mockImplementation(() => {});
  fireEvent.keyDown(modal, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Permissões do contrato' })).not.toBeInTheDocument();
  voltar.mockRestore();
  expect(salvar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Ver permissões completas' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências' }));
  expect(screen.getByRole('checkbox', { name: 'Alterar obrigatoriedade de evidências' })).not.toBeChecked();
});
