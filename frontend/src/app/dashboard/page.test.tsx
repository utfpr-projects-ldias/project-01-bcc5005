import { screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { renderComConsultas } from '@/test-utils';
import DashboardPage from './page';
import { consultarCarteiraDashboard, consultarDetalheDashboard, type CarteiraDashboard, type DetalheDashboard, type LinhaDashboard } from '@/lib/dashboard';
jest.mock('./components/consulta-dashboard',()=>({ConsultaDashboard:({contratoId,destino,fechar}:{contratoId:string;destino:{tipo:string;id:string};fechar:()=>void})=><div role="dialog" aria-label={destino.tipo==='CONTRATO'?'Consulta do contrato':'Consulta operacional'}>{contratoId}<span>{destino.tipo}:{destino.id}</span><button onClick={fechar}>Fechar contrato</button></div>}));
jest.mock('@/lib/dashboard',()=>({...jest.requireActual('@/lib/dashboard'),consultarCarteiraDashboard:jest.fn(),consultarDetalheDashboard:jest.fn()}));
const consultar=jest.mocked(consultarCarteiraDashboard);
const consultarDetalhe=jest.mocked(consultarDetalheDashboard);
const vazio:CarteiraDashboard={versao:1,hoje:'2026-11-25',limiteDias:30,indicadores:{ativos:0,planejamento:0,encerramento:0,atrasados:0,concluidos:0,pendentes:0,proximas:0,avanco:null,baseAvanco:0},totalCarteira:0,total:0,pagina:1,paginas:1,linhas:[]};
beforeEach(()=>{consultar.mockReset();consultar.mockResolvedValue(vazio);consultarDetalhe.mockReset();});
test('dashboard apresenta indicadores reais e não duplica navegação nem logout',async()=>{
  renderComConsultas(<DashboardPage/>);
  expect(await screen.findByText('Nenhum contrato disponível na sua carteira.')).toBeInTheDocument();
  expect(screen.getByText('Sem base para cálculo')).toBeInTheDocument();
  expect(screen.queryByRole('navigation',{name:'Navegação móvel'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Sair'})).not.toBeInTheDocument();
});
test('filtros consultam o servidor e reiniciam a paginação',async()=>{
  renderComConsultas(<DashboardPage/>);
  await screen.findByText('Nenhum contrato disponível na sua carteira.');
  fireEvent.change(screen.getByRole('combobox',{name:'Situação'}),{target:{value:'atrasados'}});
  await waitFor(()=>expect(consultar).toHaveBeenLastCalledWith('','atrasados',1,30,expect.anything()));
  fireEvent.change(screen.getByRole('combobox',{name:'Prazo próximo'}),{target:{value:'7'}});
  await waitFor(()=>expect(consultar).toHaveBeenLastCalledWith('','atrasados',1,7,expect.anything()));
  fireEvent.change(screen.getByRole('searchbox',{name:'Buscar por'}),{target:{value:'Contrato A'}});
  fireEvent.click(screen.getByRole('button',{name:'Pesquisar'}));
  await waitFor(()=>expect(consultar).toHaveBeenLastCalledWith('Contrato A','atrasados',1,7,expect.anything()));
});
test('falha da API não é apresentada como carteira vazia',async()=>{
  consultar.mockRejectedValue(new Error('Consulta não autorizada'));
  renderComConsultas(<DashboardPage/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Consulta não autorizada');
  expect(screen.queryByText('Nenhum contrato disponível na sua carteira.')).not.toBeInTheDocument();
});

const linha:LinhaDashboard={
  contrato:{id:'contrato-a',numeroContrato:'Contrato A',codigoPublico:'00001',objeto:'Serviços de manutenção',orgaoContratante:'Órgão A',inicioVigencia:'2026-01-01',terminoVigencia:'2026-12-31',status:'EM_EXECUCAO'},
  responsavel:'Responsável A',ativo:true,diasRestantes:36,avanco:42,configuracaoPendente:false,
  etapas:{total:2,concluidas:1},entregaveis:{total:3,pendentes:2,concluidos:1,emAndamento:1,atrasados:0},
  atividades:{total:4,verificadas:2},evidencias:{feitas:1,total:2},comprovacao:{feitas:1,total:2},
  proxima:null,proximas:0,atrasos:0,totalAlertas:1,alertas:[{tipo:'EVIDENCIA_PENDENTE',severidade:'Atenção',objeto:'ENTREGAVEL',id:'e1',entregavelId:'e1',data:null,motivo:'Relatório pendente'}],
};
const carteira:CarteiraDashboard={...vazio,indicadores:{...vazio.indicadores,ativos:1,pendentes:2,avanco:42,baseAvanco:1},total:1,totalCarteira:1,linhas:[linha]};
const detalhe:DetalheDashboard={...linha,versao:1,prazos:[{tipo:'ENTREGAVEL',id:'e1',entregavelId:'e1',nome:'Relatório mensal',data:'2026-12-01',aberto:true,atrasado:false}],matriz:[]};
function pendente<T>(){let resolver!:(v:T)=>void;let rejeitar!:(e:unknown)=>void;const promessa=new Promise<T>((resolve,reject)=>{resolver=resolve;rejeitar=reject;});return {promessa,resolver,rejeitar};}

test('trocar indicador mantém cards e tabela montados enquanto a API responde',async()=>{
  const pedido=pendente<CarteiraDashboard>();
  consultar.mockResolvedValueOnce(carteira).mockReturnValueOnce(pedido.promessa);
  renderComConsultas(<DashboardPage/>);
  await screen.findByText('Contrato A');
  const card=screen.getByRole('button',{name:'Contratos ativos: 1'});
  const tabela=screen.getByRole('table',{name:'Carteira de contratos'});
  const linhaAnterior=within(tabela).getByText('Contrato A');
  fireEvent.click(screen.getByRole('button',{name:/Contratos com atraso:/}));
  await waitFor(()=>expect(consultar).toHaveBeenLastCalledWith('','atrasados',1,30,expect.anything()));
  expect(card).toBeInTheDocument();
  expect(linhaAnterior).toBeInTheDocument();
  expect(tabela.parentElement).toHaveAttribute('aria-busy','true');
  expect(tabela.parentElement).toHaveAttribute('inert');
  expect(screen.getByRole('button',{name:/Contratos com atraso:/})).toHaveAttribute('aria-pressed','true');
  await act(async()=>{pedido.resolver({...carteira,total:0,linhas:[]});});
  expect(screen.getByRole('table',{name:'Carteira de contratos'})).toBe(tabela);
  expect(screen.getByRole('button',{name:'Contratos ativos: 1'})).toBe(card);
  expect(screen.getByText('Nenhum contrato encontrado.')).toBeInTheDocument();
  expect(tabela.parentElement).not.toHaveAttribute('inert');
});

test('resposta de filtro antigo não substitui a seleção mais recente',async()=>{
  const antigo=pendente<CarteiraDashboard>(), novo=pendente<CarteiraDashboard>();
  consultar.mockResolvedValueOnce(carteira).mockReturnValueOnce(antigo.promessa).mockReturnValueOnce(novo.promessa);
  renderComConsultas(<DashboardPage/>);
  await screen.findByText('Contrato A');
  fireEvent.click(screen.getByRole('button',{name:/Contratos com atraso:/}));
  await waitFor(()=>expect(consultar).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button',{name:/Entregáveis pendentes:/}));
  await waitFor(()=>expect(consultar).toHaveBeenCalledTimes(3));
  await act(async()=>{novo.resolver({...carteira,linhas:[{...linha,contrato:{...linha.contrato,numeroContrato:'Contrato B'}}]});});
  expect(screen.getByText('Contrato B')).toBeInTheDocument();
  await act(async()=>{antigo.resolver(carteira);});
  expect(screen.queryByText('Contrato A')).not.toBeInTheDocument();
  expect(screen.getByText('Contrato B')).toBeInTheDocument();
});

test('erro de autorização remove dados retidos, sem reaproveitar contratos anteriores',async()=>{
  const pedido=pendente<CarteiraDashboard>();
  consultar.mockResolvedValueOnce(carteira).mockReturnValueOnce(pedido.promessa);
  renderComConsultas(<DashboardPage/>);
  await screen.findByText('Contrato A');
  fireEvent.click(screen.getByRole('button',{name:/Contratos ativos:/}));
  await waitFor(()=>expect(consultar).toHaveBeenCalledTimes(2));
  await act(async()=>{pedido.rejeitar(Object.assign(new Error('Consulta não autorizada'),{status:403}));});
  expect(screen.getByRole('alert')).toHaveTextContent('Consulta não autorizada');
  expect(screen.queryByText('Contrato A')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Contratos ativos: 1'})).not.toBeInTheDocument();
});

test('detalhe abre em modal, mantém carteira e alterna abas sem requisições',async()=>{
  const pedido=pendente<DetalheDashboard>();
  consultar.mockResolvedValue(carteira);consultarDetalhe.mockReturnValue(pedido.promessa);
  renderComConsultas(<DashboardPage/>);
  const botao=await screen.findByRole('button',{name:'Ver dashboard de Contrato A'});
  fireEvent.click(botao);
  const dialogo=screen.getByRole('dialog',{name:'Dashboard do contrato'});
  const painel=within(dialogo).getByRole('region',{name:'Dashboard individual'});
  expect(screen.getByRole('table',{name:'Carteira de contratos'})).toBeVisible();
  expect(within(dialogo).queryByRole('button',{name:'Voltar à carteira'})).not.toBeInTheDocument();
  expect(within(painel).getByRole('heading',{name:'Contrato A'})).toBeInTheDocument();
  expect(within(painel).getByText('42%')).toBeInTheDocument();
  await act(async()=>{pedido.resolver(detalhe);});
  fireEvent.click(within(painel).getByRole('button',{name:'Cronograma'}));
  expect(within(painel).getByText('Relatório mensal')).toBeInTheDocument();
  fireEvent.click(within(painel).getByRole('button',{name:/Alertas/}));
  expect(within(painel).getByText('Relatório pendente')).toBeInTheDocument();
  expect(consultarDetalhe).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialogo).getByRole('button',{name:'Fechar dashboard do contrato'}));
  expect(screen.queryByRole('dialog',{name:'Dashboard do contrato'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Ver dashboard de Contrato A'})).toBe(botao);
  expect(consultar).toHaveBeenCalledTimes(1);
});


test('dashboard atualiza automaticamente sem botão manual nem desmontar a carteira',async()=>{
  const pedido=pendente<CarteiraDashboard>();
  consultar.mockResolvedValueOnce(carteira).mockReturnValueOnce(pedido.promessa);
  renderComConsultas(<DashboardPage/>);
  await screen.findByText('Contrato A');
  const tabela=screen.getByRole('table',{name:'Carteira de contratos'});
  expect(screen.queryByRole('button',{name:'Atualizar indicadores'})).not.toBeInTheDocument();
  const agora=jest.spyOn(Date,'now').mockReturnValue(Date.now()+60_000);
  try {
    fireEvent.focus(window);
    await waitFor(()=>expect(consultar).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('table',{name:'Carteira de contratos'})).toBe(tabela);
    await act(async()=>{pedido.resolver(carteira);});
    expect(screen.getByRole('table',{name:'Carteira de contratos'})).toBe(tabela);
  } finally { agora.mockRestore(); }
});

test('alertas da carteira abrem somente o diálogo com todos os alertas, sem navegar',async()=>{
  consultar.mockResolvedValue({...carteira,linhas:[{...linha,totalAlertas:4}]});
  consultarDetalhe.mockResolvedValue({...detalhe,alertas:[...detalhe.alertas,...[2,3,4].map(n=>({...detalhe.alertas[0],id:`e${n}`,motivo:`Alerta ${n}`}))]});
  renderComConsultas(<DashboardPage/>);
  const gatilho=await screen.findByRole('button',{name:'4 alertas do contrato Contrato A'});
  const tabela=screen.getByRole('table',{name:'Carteira de contratos'});
  fireEvent.click(gatilho);
  const modal=screen.getByRole('dialog',{name:'Alertas'});
  expect(await within(modal).findByText('Alerta 4')).toBeInTheDocument();
  expect(within(modal).queryByRole('button',{name:'Voltar à carteira'})).not.toBeInTheDocument();
  expect(within(modal).queryByRole('button',{name:'Matriz de execução'})).not.toBeInTheDocument();
  expect(tabela).toBeVisible();
  expect(tabela.closest('[inert]')).not.toBeNull();
  fireEvent.change(within(modal).getByRole('combobox',{name:'Prioridade'}),{target:{value:'Prioritário'}});
  expect(within(modal).getByText('Nenhum alerta.')).toBeInTheDocument();
  fireEvent.click(within(modal).getByRole('button',{name:'Fechar alertas'}));
  expect(screen.queryByRole('dialog',{name:'Alertas'})).not.toBeInTheDocument();
  expect(screen.getByRole('table',{name:'Carteira de contratos'})).toBe(tabela);
  expect(tabela.closest('[inert]')).toBeNull();
  expect(consultar).toHaveBeenCalledTimes(1);
});


test('abrir contrato reutiliza a consulta modal sem sair do dashboard',async()=>{
  consultar.mockResolvedValue(carteira);
  renderComConsultas(<DashboardPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Abrir contrato Contrato A'}));
  const modal=screen.getByRole('dialog',{name:'Consulta do contrato'});
  expect(modal).toHaveTextContent('contrato-a');
  fireEvent.click(within(modal).getByRole('button',{name:'Fechar contrato'}));
  expect(screen.queryByRole('dialog',{name:'Consulta do contrato'})).not.toBeInTheDocument();
  expect(screen.getByRole('table',{name:'Carteira de contratos'})).toBeInTheDocument();
});


test('cronograma consulta os registros em modal, sem links para outras páginas',async()=>{
  consultar.mockResolvedValue(carteira);
  consultarDetalhe.mockResolvedValue({...detalhe,prazos:[...detalhe.prazos,{tipo:'ETAPA',id:'etapa-a',entregavelId:null,nome:'Etapa A',data:'2026-12-02',aberto:true,atrasado:false},{tipo:'OCORRENCIA',id:'ocorrencia-a',entregavelId:'e1',nome:'Ocorrência A',data:'2026-12-03',aberto:true,atrasado:false}]});
  renderComConsultas(<DashboardPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Ver dashboard de Contrato A'}));
  fireEvent.click(screen.getByRole('button',{name:'Cronograma'}));
  for(const [nome,destino] of [['Relatório mensal','ENTREGAVEL:e1'],['Etapa A','ETAPA:etapa-a'],['Ocorrência A','OCORRENCIA:ocorrencia-a']]){
    fireEvent.click(await screen.findByRole('button',{name:nome}));
    const modal=screen.getByRole('dialog',{name:'Consulta operacional'});
    expect(modal).toHaveTextContent(destino);
    fireEvent.click(within(modal).getByRole('button',{name:'Fechar contrato'}));
    expect(screen.getByRole('region',{name:'Dashboard individual'})).toBeInTheDocument();
  }
});
test('abrir um alerta consulta o registro correto e retorna aos alertas',async()=>{
  consultar.mockResolvedValue(carteira);consultarDetalhe.mockResolvedValue(detalhe);
  renderComConsultas(<DashboardPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'1 alertas do contrato Contrato A'}));
  const rota=window.location.href;
  const alertas=screen.getByRole('dialog',{name:'Alertas'});
  fireEvent.change(within(alertas).getByRole('combobox',{name:'Prioridade'}),{target:{value:'Atenção'}});
  fireEvent.click(await screen.findByRole('button',{name:'Relatório pendente'}));
  const modal=screen.getByRole('dialog',{name:'Consulta operacional'});
  expect(window.location.href).toBe(rota);
  expect(modal).toHaveTextContent('ENTREGAVEL:e1');
  fireEvent.click(within(modal).getByRole('button',{name:'Fechar contrato'}));
  expect(await screen.findByRole('dialog',{name:'Alertas'})).toBe(alertas);
  expect(within(alertas).getByRole('combobox',{name:'Prioridade'})).toHaveValue('Atenção');
  expect(window.location.href).toBe(rota);
});

test('matriz abre o entregável no modal sem trocar de rota',async()=>{
  consultar.mockResolvedValue(carteira);
  consultarDetalhe.mockResolvedValue({...detalhe,matriz:[{entregavelId:'e1',nome:'Entrega matriz',tipo:'UNICO',realizado:null,previsto:null,percentualExecucao:42,pesoOperacional:null,dataEfetivaMarco:null,fonte:'MANUAL',statusFisico:'EM_ANDAMENTO',editavel:true,inicioPrevisto:null,terminoPrevisto:null,etapa:'Etapa A',unidadeMedida:null,comprovacao:null,exigenciasDocumentais:null}]});
  renderComConsultas(<DashboardPage/>);
  fireEvent.click(await screen.findByRole('button',{name:'Ver dashboard de Contrato A'}));
  fireEvent.click(await screen.findByRole('button',{name:'Entrega matriz'}));
  expect(screen.getByRole('dialog',{name:'Consulta operacional'})).toHaveTextContent('ENTREGAVEL:e1');
});
