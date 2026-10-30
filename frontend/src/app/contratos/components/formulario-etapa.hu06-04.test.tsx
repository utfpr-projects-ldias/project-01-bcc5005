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
