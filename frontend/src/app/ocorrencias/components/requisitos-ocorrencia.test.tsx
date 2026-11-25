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
  expect(screen.getByRole('textbox', { name: 'Atividades' })).toHaveAttribute('placeholder', '0');
  expect(screen.getByRole('textbox', { name: 'Fotografias' })).toHaveAttribute('placeholder', '0');
  fireEvent.change(screen.getByRole('textbox', { name: 'Atividades' }), {target:{value:'1'}});
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minimoAtividadesVerificadas: 1 }));
});

test('requisitos de foto e relatório são contabilizados individualmente', () => {
  const onChange = jest.fn();
  render(<FormularioRequisitosOcorrencia valor={inicial} onChange={onChange} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Fotografias' }), {target:{value:'1'}});
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({minimoFotos:1,minimoEvidenciasVerificadas:1,evidenciaExigida:'FOTO'}));
});

test('painel de requisitos não inventa uma obrigação de 0/0', () => {
  render(<ResumoRequisitosOcorrencia minimoAtividades={1} minimoEvidencias={0} formato="NENHUMA" verificadas={0} fotos={0} relatorios={0}/>);
  expect(screen.getByText('0/1')).toBeInTheDocument();
  expect(screen.queryByText('0/0')).not.toBeInTheDocument();
  expect(screen.queryByText('Não exigidas')).not.toBeInTheDocument();
});

test('cota livre contabiliza ata/laudo válido sem duplicar fotos ou relatórios reservados', () => {
  render(<ResumoRequisitosOcorrencia minimoAtividades={0} minimoEvidencias={3} formato="AMBOS"
    verificadas={0} fotos={1} relatorios={1} outras={1}
    minimoFotos={1} minimoRelatorios={1} minimoEvidenciasLivres={1} />);
  expect(screen.getByRole('progressbar', { name: /Evidências: 3 de 3/ })).toBeInTheDocument();
});

test('cota livre não permite reutilizar a mesma foto reservada duas vezes', () => {
  render(<ResumoRequisitosOcorrencia minimoAtividades={0} minimoEvidencias={2} formato="FOTO"
    fotos={1} relatorios={0} outras={0}
    minimoFotos={1} minimoRelatorios={0} minimoEvidenciasLivres={1} />);
  expect(screen.getByRole('progressbar', { name: /Evidências: 1 de 2/ })).toBeInTheDocument();
});
