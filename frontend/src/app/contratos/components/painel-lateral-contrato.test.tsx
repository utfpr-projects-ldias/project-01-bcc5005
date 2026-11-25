import { fireEvent, render, screen, within } from '@testing-library/react';
import { NumeroComprovacoes, PainelLateralContrato, precisaPainelExpansivel } from './painel-lateral-contrato';
import { ProgressoCircular } from '@/app/components/progresso-circular';
import { ResumoVinculosEntregavel } from './resumo-vinculos-entregavel';

test('painel reserva espaço real para o conteúdo e não se desloca para baixo', () => {
  expect(precisaPainelExpansivel(1023)).toBe(true);
  expect(precisaPainelExpansivel(1024)).toBe(false);
  for(const largura of [1280,1366,1440,1920,2560]) expect(precisaPainelExpansivel(largura-40)).toBe(false);
  const fechar=jest.fn();
  const conteudo=<><button>Configurar</button><button data-pi-fechar-painel onClick={fechar}>Fechar painel</button></>;
  const view=render(<PainelLateralContrato compacto={false} aberto={false} onFechar={fechar}>{conteudo}</PainelLateralContrato>);
  const painel=screen.getByRole('complementary',{name:'Resumo e execução física do contrato'});
  expect(painel).toHaveAttribute('data-compacto','false');
  view.rerender(<PainelLateralContrato compacto aberto={false} onFechar={fechar}>{conteudo}</PainelLateralContrato>);
  expect(painel).toHaveAttribute('inert');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(<PainelLateralContrato compacto aberto onFechar={fechar}>{conteudo}</PainelLateralContrato>);
  expect(screen.getByRole('dialog')).toBe(painel);
  expect(painel).not.toHaveAttribute('inert');
  expect(painel).toHaveAttribute('aria-modal','true');
  fireEvent.keyDown(painel,{key:'Escape'});
  expect(fechar).toHaveBeenCalledTimes(1);
  const primeiro=within(painel).getByRole('button',{name:'Configurar'});
  const ultimo=within(painel).getByRole('button',{name:'Fechar painel'});
  ultimo.focus();fireEvent.keyDown(ultimo,{key:'Tab'});
  expect(primeiro).toHaveFocus();
  fireEvent.keyDown(primeiro,{key:'Tab',shiftKey:true});
  expect(ultimo).toHaveFocus();
  fireEvent.click(ultimo);
  expect(fechar).toHaveBeenCalledTimes(2);
  view.rerender(<PainelLateralContrato compacto={false} aberto={false} onFechar={fechar}>{conteudo}</PainelLateralContrato>);
  expect(screen.getByRole('complementary')).toBe(painel);
  expect(painel).not.toHaveAttribute('inert');
});

test('comprovações mostram o número real, mudam com a revalidação e não fingem cobertura', () => {
  const view=render(<NumeroComprovacoes feitas={7} total={10}/>);
  expect(screen.getByText('7/10').parentElement).toHaveAttribute('data-pi-comprovacoes','parcial');
  view.rerender(<NumeroComprovacoes feitas={10} total={10}/>);
  expect(screen.getByText('10/10').parentElement).toHaveAttribute('data-pi-comprovacoes','completo');
  view.rerender(<NumeroComprovacoes feitas={0} total={10}/>);
  expect(screen.getByText('0/10').parentElement).toHaveAttribute('data-pi-comprovacoes','insuficiente');
  view.rerender(<NumeroComprovacoes feitas={0} total={0}/>);
  expect(screen.getByText('0/0').parentElement).toHaveAttribute('data-pi-comprovacoes','neutro');
  view.rerender(<NumeroComprovacoes/>);
  expect(screen.getByText('—').parentElement).toHaveAttribute('data-pi-comprovacoes','neutro');
});

test('percentual fica no próprio SVG sem retângulo ou preenchimento de 0%', () => {
  const view=render(<ProgressoCircular nome="Entregável" valor={0}/>);
  const img=screen.getByRole('img',{name:'Progresso físico de Entregável: 0%'});
  expect(img.querySelector('svg text')).toHaveTextContent('0%');
  expect(img.querySelector('span')).toBeNull();
  expect(img.querySelector('.pi-anel-progresso')).toHaveAttribute('stroke-opacity','0');
  view.rerender(<ProgressoCircular nome="Entregável" valor={75}/>);
  expect(img.querySelector('.pi-anel-progresso')).toHaveAttribute('stroke-dasharray','75 100');
  view.rerender(<ProgressoCircular nome="Entregável" valor={100}/>);
  expect(img.querySelector('.pi-anel-progresso')).toHaveAttribute('stroke-dasharray','100 100');
  view.rerender(<ProgressoCircular nome="Entregável" valor={null}/>);
  expect(img).toHaveTextContent('—');
  expect(img.querySelector('.pi-anel-progresso')).toBeNull();
});

test('subindicadores mantêm 0/0 e indisponível discretos, sem barra preenchida', () => {
  const view=render(<ResumoVinculosEntregavel resumo={{obrigatorias:0,verificadas:0,ocorrenciasFinalizadas:0,ocorrenciasTotal:0,atividadesVerificadas:0,atividadesTotal:2}}/>);
  const vazio=screen.getByRole('img',{name:'Ocorrências: 0/0'});
  expect(vazio.parentElement).toHaveAttribute('data-pi-contagem','sem-requisitos');
  expect(vazio.childElementCount).toBe(0);
  expect(screen.getByRole('img',{name:'Atividades: 0/2'}).parentElement).toHaveAttribute('data-pi-contagem','aplicavel');
  expect(screen.getByRole('img',{name:'Evidências: —'}).parentElement).toHaveAttribute('data-pi-contagem','indisponivel');
  view.rerender(<ResumoVinculosEntregavel resumo={{obrigatorias:0,verificadas:0,ocorrenciasFinalizadas:1,ocorrenciasTotal:12}}/>);
  expect(screen.getByRole('img',{name:'Ocorrências: 1/12'}).firstElementChild).toHaveStyle({width:`${100/12}%`});
});


test('R49: exibe participação operacional somente quando fornecida pelo motor',()=>{
  const view=render(<ResumoVinculosEntregavel participacao={10}/>);
  expect(screen.getByText('10% do contrato')).toBeInTheDocument();
  view.rerender(<ResumoVinculosEntregavel participacao={null}/>);
  expect(screen.queryByText(/% do contrato/)).not.toBeInTheDocument();
});
