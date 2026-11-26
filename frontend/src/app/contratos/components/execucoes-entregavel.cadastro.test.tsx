import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ExecucoesEntregavel, type OrigemExecucao, type Resumo } from './execucoes-entregavel';
import type { Entregavel } from '@/lib/entregaveis';

let mockCarregando = false;
let mockAdministrador = true;
const resumoVazio:Resumo = {saldo:4500,reconhecido:5500,reservado:0,base:0,itens:[],quantitativas:[],ocorrencias:[]};
let mockResumo:Resumo = resumoVazio;
let mockAtualizando = false;
jest.mock('@/app/components/provedor-consultas', () => ({
  useRepositorioConsultasOpcional: () => ({ invalidar: jest.fn() }),
  useConsulta: () => ({ dados: mockResumo, atualizando: mockAtualizando, atualizar: jest.fn() }),
}));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: () => ({ carregando: mockCarregando, dados: mockCarregando ? undefined : { id: 'qa', ativo: true, perfil: mockAdministrador ? 'ADMINISTRADOR' : 'COLABORADOR' } }) }));
jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: () => ({ carregando: false, dados: { permissoes: {} } }) }));
jest.mock('@/hooks/use-progresso', () => ({ useProgresso: () => ({ loading: false, progresso: null }) }));
jest.mock('@/hooks/use-ocorrencias', () => ({ useOcorrencias: () => ({ loading: false, ocorrencias: [] }) }));
jest.mock('@/hooks/use-pedido-execucao-pendente', () => ({ usePedidoExecucaoPendente: () => ({ pronto: true, pedido: null, definir: jest.fn() }) }));

const item: Entregavel = {
  id: 'entregavel-qa', contratoId: 'contrato-qa', etapaId: 'etapa-qa', nome: 'Entregável QA',
  codigo: 'QA-E1', descricao: null, tipo: 'CONTINUO', responsavelId: null,
  inicioPrevisto: null, terminoPrevisto: null, quantidadePrevista: null, quantidadeRealizada: null,
  unidadeMedida: null, periodicidade: null, configuracaoPeriodicidade: null, peso: null,
  criterioConclusao: null, statusExecucao: null, percentualExecucao: null,
  situacaoComprovacao: null, observacoes: null, evidenciasEsperadas: [],
};
const semAcao = () => {};
function cenario(origemRegistro: OrigemExecucao, onCadastro = jest.fn()) {
  return <ExecucoesEntregavel item={item} aba="geral" origemRegistro={origemRegistro}
    focoCadastroAvulso={document.body} somenteLeitura={false} podeEvidencia={mockAdministrador} podeEnviar={mockAdministrador}
    onCadastro={onCadastro} onAbrir={semAcao} onGeral={semAcao} onOcorrencias={semAcao}/>;
}
beforeEach(() => { mockCarregando = false; mockAdministrador = true; mockResumo = resumoVazio; mockAtualizando = false; });

test.each(['ATIVIDADE','EVIDENCIA','OCORRENCIA'] as const)('origem %s escolhida no contrato abre diretamente seu formulário', async origem => {
  const abrir = jest.fn();
  render(cenario(origem, abrir));
  await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
  expect(abrir).toHaveBeenCalledWith(origem, {}, document.body, expect.objectContaining({ voltarManual: expect.any(Function) }));
  expect(screen.queryByRole('dialog', { name: 'Novo registro' })).not.toBeInTheDocument();
});

test('aguarda permissões sem exibir um botão de cadastro vazio', async () => {
  mockCarregando = true;
  const abrir = jest.fn();
  const view = render(cenario('ATIVIDADE', abrir));
  const modal = screen.getByRole('dialog', { name: 'Novo registro' });
  expect(within(modal).queryByRole('button', { name: 'Cadastrar' })).not.toBeInTheDocument();
  expect(within(modal).getByRole('status')).toHaveTextContent('Abrindo formulário');
  expect(abrir).not.toHaveBeenCalled();
  mockCarregando = false;
  view.rerender(cenario('ATIVIDADE', abrir));
  await waitFor(() => expect(abrir).toHaveBeenCalledTimes(1));
});

test('origem não autorizada não muda silenciosamente para manual', () => {
  mockAdministrador = false;
  const abrir = jest.fn();
  render(cenario('ATIVIDADE', abrir));
  const modal = screen.getByRole('dialog', { name: 'Novo registro' });
  expect(within(modal).getByRole('alert')).toHaveTextContent('Esta origem não está disponível');
  expect(within(modal).queryByLabelText('Percentual (%)')).not.toBeInTheDocument();
  expect(abrir).not.toHaveBeenCalled();
});

test('manual mantém formulário e rodapé; aba de atividade abre seu cadastro sem envio manual', () => {
  const abrir = jest.fn();
  render(cenario('MANUAL', abrir));
  const modal = screen.getByRole('dialog', { name: 'Novo registro' });
  expect(modal).toHaveAttribute('data-pi-registro-cadastro', 'true');
  expect(within(modal).getByLabelText('Percentual (%)')).toBeInTheDocument();
  expect(within(modal).getByRole('button', { name: 'Cadastrar' })).toBeDisabled();
  fireEvent.click(within(modal).getByRole('button', { name: 'Atividade' }));
  expect(abrir).toHaveBeenCalledWith('ATIVIDADE', {}, document.body, expect.any(Object));
});


const manual:Resumo['itens'][number] = {id:'manual-1',versao:'1',origem:'MANUAL',origemId:null,ocorrenciaId:null,titulo:'Execução manual',centesimos:200,reconhecido:0,reservado:200,situacao:'PENDENTE',dataExecucao:'2026-11-25',observacao:null,autorNome:'Operador',referenciaId:null};
const evidencia:Resumo['itens'][number] = {...manual,id:'parcela-evidencia',origem:'EVIDENCIA',origemId:'comprovante-1',evidenciaId:'esperada-1',titulo:'Relatório.pdf'};
function painel(aba:'geral'|'execucoes',abrir=jest.fn()){
  return <ExecucoesEntregavel item={item} aba={aba} somenteLeitura={false} podeEvidencia podeEnviar onCadastro={semAcao} onAbrir={abrir} onGeral={semAcao} onOcorrencias={semAcao}/>;
}
test.each(['geral','execucoes'] as const)('registros em %s abrem detalhe manual, não exibem decisões no cartão',aba=>{
  mockResumo={...resumoVazio,itens:[manual,evidencia]};
  render(painel(aba));
  expect(screen.queryByRole('button',{name:'Aprovar'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Execução manual/}));
  const modal=screen.getByRole('dialog',{name:'Execução manual'});
  expect(within(modal).getByRole('button',{name:'Aprovar'})).toBeInTheDocument();
  expect(within(modal).getByRole('button',{name:'Editar execução manual'})).toBeInTheDocument();
  fireEvent.click(within(modal).getByRole('button',{name:'Fechar registro de execução'}));
  expect(screen.queryByRole('dialog',{name:'Execução manual'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:/Execução manual/})).toBeInTheDocument();
});
test.each(['geral','execucoes'] as const)('evidência em %s usa ID da evidência esperada, não o comprovante',aba=>{
  mockResumo={...resumoVazio,itens:[evidencia]};
  const abrir=jest.fn(); render(painel(aba,abrir));
  const cartao=screen.getByRole('button',{name:/Relatório.pdf/});
  fireEvent.click(cartao);
  expect(abrir).toHaveBeenCalledWith('EVIDENCIA','esperada-1',cartao);
});
test('revalidação preserva o detalhe e bloqueia decisão obsoleta',()=>{
  mockResumo={...resumoVazio,itens:[manual]};
  const v=render(painel('execucoes'));
  fireEvent.click(screen.getByRole('button',{name:/Execução manual/}));
  const modal=screen.getByRole('dialog',{name:'Execução manual'});
  mockAtualizando=true; v.rerender(painel('execucoes'));
  expect(screen.getByRole('dialog',{name:'Execução manual'})).toBe(modal);
  expect(within(modal).getByRole('button',{name:'Aprovar'})).toBeDisabled();
});
