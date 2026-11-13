import { fireEvent, render, screen } from '@testing-library/react';
import { FormularioRequisitosOcorrencia, ResumoRequisitosOcorrencia, type RequisitosOcorrencia } from './requisitos-ocorrencia';

const inicial: RequisitosOcorrencia = {
  minimoAtividadesVerificadas: 0, minimoEvidenciasVerificadas: 0,
  minimoFotos: 0, minimoRelatorios: 0, minimoEvidenciasLivres: 0,
  evidenciaExigida: 'NENHUMA', permiteEncerramentoExcepcional: true,
};

test('cada exigência inicia com placeholder 0 e controla quantidade separada', () => {
  const onChange = jest.fn();
  render(<FormularioRequisitosOcorrencia valor={inicial} onChange={onChange} />);
  expect(screen.getByRole('spinbutton', { name: 'Atividades verificadas' })).toHaveAttribute('placeholder', '0');
  expect(screen.getByRole('spinbutton', { name: 'Fotografias verificadas' })).toHaveAttribute('placeholder', '0');
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar atividades verificadas' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minimoAtividadesVerificadas: 1 }));
});

test('requisitos de foto e relatório são contabilizados individualmente', () => {
  const onChange = jest.fn();
  render(<FormularioRequisitosOcorrencia valor={inicial} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar fotografias verificadas' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({minimoFotos:1,minimoEvidenciasVerificadas:1,evidenciaExigida:'FOTO'}));
});

test('painel de requisitos não inventa uma obrigação de 0/0', () => {
  render(<ResumoRequisitosOcorrencia minimoAtividades={1} minimoEvidencias={0} formato="NENHUMA" verificadas={0} fotos={0} relatorios={0}/>);
  expect(screen.getByText('0 / 1')).toBeInTheDocument();
  expect(screen.getByText('0 / 0')).toBeInTheDocument();
  expect(screen.getByText('Não exigidas')).toBeInTheDocument();
});
