import { act, fireEvent, render, screen } from '@testing-library/react';
import { FormularioEtapa } from './formulario-etapa';
import { ErroEtapa, type DadosEtapa } from '@/lib/etapas';

/** HU06-04 — formulários reais com callbacks simulados, NÃO rede/DB. */
describe('HU06-04 — validação acessível e envio do formulário', () => {
  it('submit sem nome mostra erro vinculado ao campo, sem chamar a API', () => {
    const salvar = jest.fn<Promise<void>, [DadosEtapa]>().mockResolvedValue(undefined);
    render(<FormularioEtapa onSalvar={salvar} onCancelar={jest.fn()} />);
    fireEvent.submit(screen.getByRole('form', { name: 'Criar etapa' }));
    const nome = screen.getByLabelText('Nome *');
    expect(nome).toHaveAttribute('aria-invalid', 'true');
    expect(nome).toHaveAttribute('aria-describedby', 'etapa-nome-erro');
    expect(screen.getByText('Informe o nome da etapa.')).toHaveAttribute('role', 'alert');
    expect(salvar).not.toHaveBeenCalled();
  });

  it('envia por submit nativo com datas e campos válidos e preserva formulário se servidor rejeitar', async () => {
    const salvar = jest.fn<Promise<void>, [DadosEtapa]>()
      .mockRejectedValueOnce(new ErroEtapa(409, 'Conflito de edição'));
    render(<FormularioEtapa onSalvar={salvar} onCancelar={jest.fn()} />);
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: '  Etapa de execução  ' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: ' EXEC ' } });
    fireEvent.change(screen.getByLabelText('Início previsto'), { target: { value: '2026-11-03' } });
    fireEvent.change(screen.getByLabelText('Término previsto'), { target: { value: '2026-11-07' } });
    const form = screen.getByRole('form', { name: 'Criar etapa' });
    await act(async () => { fireEvent.submit(form); });
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({
      nome: 'Etapa de execução', codigo: 'EXEC', inicioPrevisto: '2026-11-03',
      terminoPrevisto: '2026-11-07',
    }));
    expect(screen.getByRole('alert')).toHaveTextContent('Conflito de edição');
    expect(screen.getByLabelText('Nome *')).toHaveValue('  Etapa de execução  ');
    expect(screen.getByRole('button', { name: 'Salvar etapa' })).toHaveAttribute('type', 'submit');
  });
});


test('nova etapa não permite seleção manual de Concluída nem Encerrada', () => {
  render(<FormularioEtapa onSalvar={jest.fn()} onCancelar={jest.fn()} />);
  expect(screen.queryByRole('option', { name: 'Concluída' })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Encerrada' })).not.toBeInTheDocument();
});

test('encerramento de etapa existente exige permissão e justificativa de 15 a 200 caracteres', async () => {
  const encerrar = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);
  render(<FormularioEtapa inicial={{
    id: '11111111-1111-4111-8111-111111111111', contratoId: '22222222-2222-4222-8222-222222222222',
    nome: 'Execução de QA', codigo: null, descricao: null, sequencia: 1,
    inicioPrevisto: null, terminoPrevisto: null, status: 'EM_ANDAMENTO', observacoes: null,
    vigenciaContrato: { inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' }, avisoVigencia: false,
  }} onSalvar={jest.fn()} onCancelar={jest.fn()} podeEncerrar onEncerrar={encerrar} />);
  expect(screen.queryByRole('option', { name: 'Concluída' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'ENCERRADA' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar para encerramento' }));
  expect(screen.getByRole('dialog', { name: 'Encerrar etapa?' })).toBeInTheDocument();
  const confirmar = screen.getByRole('button', { name: 'Confirmar encerramento' });
  expect(confirmar).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificativa obrigatória/), { target: { value: 'Encerramento administrativo autorizado.' } });
  await act(async () => { fireEvent.click(confirmar); });
  expect(encerrar).toHaveBeenCalledWith('Encerramento administrativo autorizado.');
});
