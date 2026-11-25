import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PreviaContrato } from './cartao-atividade';

jest.mock('@/app/components/provedor-consultas',()=>({useRepositorioConsultasOpcional:()=>null,useConsulta:()=>({dados:{apto:false,aptoParcial:true}})}));
jest.mock('@/hooks/use-contratos',()=>({
  useListaContratos:()=>({dados:[{id:'c',status:'PLANEJAMENTO',codigoPublico:'001',objeto:'Contrato de QA'}]}),
  useAcessoContrato:()=>({dados:{permissoes:{editarContrato:true}}}),
}));
jest.mock('@/hooks/use-meu-perfil',()=>({useMeuPerfil:()=>({dados:{perfil:'GESTOR',ativo:true}})}));
jest.mock('@/hooks/use-progresso',()=>({useProgresso:()=>({progresso:{avanco:0,modoCalculo:'SIMPLES',entregaveis:[{entregavelId:'e',nome:'Entregável com título longo',percentualExecucao:0}]}})}));
jest.mock('@/hooks/use-etapas',()=>({useEtapas:()=>({dados:[]})}));
jest.mock('@/hooks/use-entregaveis',()=>({useEntregaveis:()=>({dados:[]}),useResumoDocumentalContrato:()=>({dados:{}})}));
jest.mock('@/hooks/use-ocorrencias',()=>({useOcorrencias:()=>({ocorrencias:[]})}));

test('R46: o pedido do iframe abre o mesmo painel; Esc não fecha o contrato', async()=>{
  let largura=1200;
  const medida=jest.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(()=>largura);
  const voltar=jest.spyOn(window.history,'back').mockImplementation(()=>{});
  const fechar=jest.fn();
  const view=render(<PreviaContrato contratoId="c" fechar={fechar} foco={null}/>);
  try {
    const frame=screen.getByTitle('Conteúdo do contrato') as HTMLIFrameElement;
    const painel=screen.getByRole('complementary',{name:'Resumo e execução física do contrato'});
    expect(painel).toHaveAttribute('data-compacto','false');
    largura=800;
    act(()=>window.dispatchEvent(new Event('resize')));
    expect(painel).toHaveAttribute('inert');
    const enviar=(contratoId:string,origin=window.location.origin)=>act(()=>window.dispatchEvent(new MessageEvent('message',{
      data:{tipo:'pi:abrir-painel-contrato',contratoId},origin,source:frame.contentWindow,
    })));
    enviar('outro'); enviar('c','https://outro.example');
    expect(painel).toHaveAttribute('inert');
    enviar('c');
    expect(painel).toHaveAttribute('role','dialog');
    expect(frame.parentElement).toHaveAttribute('inert');
    expect(within(painel).getByRole('button',{name:'Fechar painel do contrato'})).toBeInTheDocument();
    expect(within(painel).getByText('Comprovações')).toBeInTheDocument();
    fireEvent.keyDown(painel,{key:'Escape'});
    expect(fechar).not.toHaveBeenCalled();
    expect(painel).toHaveAttribute('inert');
    expect(frame.parentElement).not.toHaveAttribute('inert');
    largura=1200;
    act(()=>window.dispatchEvent(new Event('resize')));
    await waitFor(()=>expect(painel).not.toHaveAttribute('inert'));
    expect(screen.getByRole('complementary')).toBe(painel);
    expect(screen.getByRole('dialog',{name:'Detalhes do contrato'})).toBeInTheDocument();
  } finally {view.unmount(); medida.mockRestore(); voltar.mockRestore();}
});
