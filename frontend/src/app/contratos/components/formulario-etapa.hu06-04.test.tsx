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

test('formulário não executa encerramento direto e limita nome, código e texto', () => {
  render(<FormularioEtapa onSalvar={jest.fn()} onCancelar={jest.fn()} />);
  expect(screen.queryByRole('option', { name: 'Encerrada' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Nome *')).toHaveAttribute('maxlength', '100');
  expect(screen.getByLabelText('Código')).toHaveAttribute('maxlength', '30');
  expect(screen.getByLabelText('Descrição')).toHaveAttribute('maxlength', '1000');
  expect(screen.getByLabelText('Observações')).toHaveAttribute('maxlength', '1000');
  expect(screen.queryByRole('button', { name: /encerramento/i })).not.toBeInTheDocument();
});


test('editar etapa usa identidade visual do registro e sinaliza envio em andamento', async () => {
  const etapa = {
    id: '11111111-1111-4111-8111-111111111111', contratoId: '22222222-2222-4222-8222-222222222222',
    nome: 'Etapa reaberta', codigo: null, descricao: null, sequencia: 1,
    inicioPrevisto: null, terminoPrevisto: null, status: 'EM_ANDAMENTO' as const, observacoes: null,
    reabertoEm: '2026-11-09T10:00:00Z',
    vigenciaContrato: { inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' }, avisoVigencia: false,
  };
  let finalizar!: () => void;
  const pendente = new Promise<void>(resolve => { finalizar = resolve; });
  const salvar = jest.fn().mockReturnValue(pendente);
  render(<FormularioEtapa inicial={etapa} onSalvar={salvar} onCancelar={jest.fn()} />);
  const form = screen.getByRole('form', { name: 'Editar etapa Etapa reaberta' });
  expect(form).toHaveAttribute('data-tec08-edicao', 'true');
  expect(form).not.toHaveAttribute('data-tec08-criacao');
  fireEvent.submit(form);
  expect(screen.getByRole('button', { name: /Salvando etapa/ })).toHaveAttribute('aria-busy', 'true');
  await act(async () => { finalizar(); await pendente; });
  expect(screen.getByRole('button', { name: 'Salvar etapa' })).toHaveAttribute('aria-busy', 'false');
});
