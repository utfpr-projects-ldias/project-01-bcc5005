import type { ReactElement } from 'react';
import { ProvedorConsultas } from '@/app/components/provedor-consultas';
jest.mock('@/app/contratos/components/painel-comprovacao-evidencia', () => ({
  PainelComprovacaoEvidencia: ({ contratoId, entregavelId, esperadaId, podeEditar, podeAlterarObrigatoriedade, somenteLeitura, onIntegridadeDetalhe }: {
    contratoId: string; entregavelId: string; esperadaId: string;
    podeEditar: boolean; podeAlterarObrigatoriedade: boolean; somenteLeitura?: boolean;
    onIntegridadeDetalhe?: (id: string, valido: boolean) => void;
  }) => {
    // Resolver os módulos na montagem evita dependências fora do escopo de
    // factories jest.mock hoisted pelo transformador de TypeScript.
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const { consultarEvidencia, validarDetalheEvidencia: verificarResposta } =
      jest.requireMock<typeof import('@/lib/comprovantes')>('@/lib/comprovantes');
    // TS2775: funções de assertion recuperadas dinamicamente pelo Jest
    // precisam de anotação explícita, também no typecheck do build Next.js.
    const validarDetalheEvidencia: (valor: unknown) => asserts valor is import('@/lib/comprovantes').DetalheEvidencia =
      verificarResposta;
    // O mock preserva o contrato de integridade do painel: a edição externa
    // só é liberada após consulta e validação do detalhe HTTP.
    useEffect(() => {
      let ativo = true;
      void consultarEvidencia(contratoId, entregavelId, esperadaId).then(detalhe => {
        validarDetalheEvidencia(detalhe);
        if (detalhe.id !== esperadaId || detalhe.contratoId !== contratoId || detalhe.entregavelId !== entregavelId)
          throw new Error('Evidência de outro entregável.');
        if (ativo) onIntegridadeDetalhe?.(esperadaId, true);
      }).catch(() => { if (ativo) onIntegridadeDetalhe?.(esperadaId, false); });
      return () => { ativo = false; };
    }, [contratoId, entregavelId, esperadaId, onIntegridadeDetalhe, consultarEvidencia, validarDetalheEvidencia]);
    return <div data-testid="comprovacao-esperada">Enviar comprovante · Aguardando envio · {esperadaId}
      {podeEditar && !somenteLeitura && <button type="button" aria-label="Editar tipo da evidência"/>}
      {podeAlterarObrigatoriedade && !somenteLeitura && <label><input type="checkbox" /> Evidência obrigatória</label>}
    </div>;
  },
}));
import { act, fireEvent, render as renderSemProvider, screen } from '@testing-library/react';
import DetalheEntregavelPage from './page';
import { ConteudoEntregavel } from '@/app/contratos/components/conteudo-entregavel';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { useAcessoContrato, useContrato } from '@/hooks/use-contratos';
import { consultarHistoricoEntregavel, type Entregavel } from '@/lib/entregaveis';
import { consultarEvidencia } from '@/lib/comprovantes';
jest.mock('@/lib/entregaveis', () => ({ ...jest.requireActual('@/lib/entregaveis'), consultarHistoricoEntregavel: jest.fn() }));
// O componente busca a situação de cada evidência. O teste não depende de HTTP real.
jest.mock('@/lib/comprovantes', () => ({ ...jest.requireActual('@/lib/comprovantes'), consultarEvidencia: jest.fn() }));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'contrato-a', entregavelId: 'e-1' }) }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useDetalheEntregavel: jest.fn(), useEntregaveis: () => ({ dados: [] }) }));
jest.mock('@/hooks/use-progresso', () => ({ useProgresso: () => ({ progresso: { modoCalculo: 'SIMPLES' } }) }));
jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: jest.fn(), useContrato: jest.fn() }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: () => ({dados:[{id:'etapa-a',contratoId:'contrato-a',status:'EM_ANDAMENTO'}]}) }));
const historico = consultarHistoricoEntregavel as jest.Mock;
const evidenciaConsultada = consultarEvidencia as jest.Mock;
const perfil = useMeuPerfil as jest.Mock;
const detalhe = useDetalheEntregavel as jest.Mock;
const acesso = useAcessoContrato as jest.Mock;
const item: Entregavel = {
  id: 'e-1', contratoId: 'contrato-a', etapaId: 'etapa-a', nome: 'Manutenção mensal', codigo: 'M-01', descricao: 'Execução técnica', tipo: 'RECORRENTE',
  responsavelId: 'pessoa-1', inicioPrevisto: '2026-10-01', terminoPrevisto: '2026-12-31',
  quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null, periodicidade: 'MENSAL',
  configuracaoPeriodicidade: { versao: 1 }, peso: '25.0000', criterioConclusao: 'Entrega dos relatórios assinados',
  statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null, observacoes: null,
  evidenciasEsperadas: [{ id: 'prova-1', tipoEvidencia: 'Relatório', descricao: 'PDF previsto', obrigatoria: true },
    { id: 'prova-2', tipoEvidencia: 'Foto', descricao: null, obrigatoria: false }],
};
const estado = (dados: unknown, extra = {}) => ({ dados, erro: undefined, carregando: false, atualizar: jest.fn(), ...extra });
// A consulta inicial e a verificação do painel são duas chamadas HTTP distintas.
// Liberá-las em act permite verificar também as atualizações do checklist, sem
// que Promise.allSettled notifique o React após o término da asserção.
const consultasPendentes: Array<{ liberar: () => void; pedido: Promise<unknown> }> = [];
function consultarControlado(resposta: unknown): Promise<unknown> {
  let liberar!: () => void;
  const pedido = new Promise(resolve => { liberar = () => resolve(resposta); });
  consultasPendentes.push({ liberar, pedido });
  return pedido;
}
async function concluirConsultas() {
  // É seguro chamar quando não há evidências visíveis (403, conta inativa).
  const atuais = consultasPendentes.splice(0);
  if (!atuais.length) return;
  await act(async () => {
    atuais.forEach(({ liberar }) => liberar());
    await Promise.all(atuais.map(({ pedido }) => pedido));
  });
}
beforeEach(() => {
  consultasPendentes.length = 0;
  evidenciaConsultada.mockClear();
  historico.mockResolvedValue([]);
  evidenciaConsultada.mockImplementation((contratoId: string, entregavelId: string, id: string) =>
    consultarControlado({ id, contratoId, entregavelId, status: 'SEM_ENVIO', versoes: [],
      tipoEvidencia: id === 'prova-1' ? 'Relatório' : 'Foto', descricao: null,
      obrigatoria: id === 'prova-1', podeVerificar: false }));
  perfil.mockReturnValue(estado({ ativo: true }));
  (useContrato as jest.Mock).mockReturnValue(estado({id:'contrato-a',status:'EM_EXECUCAO'}));
  detalhe.mockReturnValue(estado(item));
  acesso.mockReturnValue(estado({ podeEditar: false }));
});
test('visao separa planejamento, criterio proximo de execucao e checklist esperado', async () => {
  await act(async () => { render(<ConteudoEntregavel item={item} />); });
  await concluirConsultas();
  expect(screen.getByText('Informações do entregável', { selector: 'summary' })).toBeInTheDocument();
  expect(screen.getByText('Execução técnica')).toBeInTheDocument();
  expect(screen.getByText('Entrega dos relatórios assinados')).toBeInTheDocument();
  expect(screen.getByText('Mensal')).toBeInTheDocument();
  expect(screen.getByText('31/12/2026')).toBeInTheDocument();
  expect(await screen.findByRole('list', { name: 'Evidências obrigatórias' })).toHaveTextContent('Relatório');
  expect(screen.getByRole('list', { name: 'Evidências opcionais' })).toHaveTextContent('Foto');
  // A prova não é usada como percentual de execução física: o critério permanece identificado no cadastro.
  expect(screen.getByText('Critério operacional')).toBeInTheDocument();
  expect(screen.queryByText('Comprovado')).not.toBeInTheDocument();
});
test('detalhe usa IDs da rota e valida correspondencia com contrato', async () => {
  await act(async () => { render(<DetalheEntregavelPage />); });
  await concluirConsultas();
  expect(detalhe).toHaveBeenCalledWith('contrato-a', 'e-1', true);
  expect(screen.getByRole('heading', { name: 'Manutenção mensal' })).toBeInTheDocument();
});
test('erro 403 nao revela dados mesmo se houver cache', () => {
  detalhe.mockReturnValue(estado(item, { erro: Object.assign(new Error('Sem acesso'), { status: 403 }) }));
  render(<DetalheEntregavelPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Sem acesso');
  expect(screen.queryByText('Manutenção mensal')).not.toBeInTheDocument();
});
test('item de outro contrato nunca aparece e conta inativa desabilita consulta', () => {
  detalhe.mockReturnValue(estado({ ...item, contratoId: 'outro' }));
  const view = render(<DetalheEntregavelPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('não encontrado neste contrato');
  perfil.mockReturnValue(estado({ ativo: false }));
  view.rerender(<DetalheEntregavelPage />);
  expect(detalhe).toHaveBeenLastCalledWith('contrato-a', 'e-1', false);
  expect(screen.queryByText('Manutenção mensal')).not.toBeInTheDocument();
});

test('leitor sem permissão de edição não vê formulário de planejamento', async () => {
  await act(async () => { render(<DetalheEntregavelPage />); });
  await concluirConsultas();
  expect(screen.queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
});
test('gestor autorizado pode alternar editor no próprio botão', async () => {
  perfil.mockReturnValue(estado({ ativo: true, perfil: 'GESTOR' }));
  acesso.mockReturnValue(estado({ podeEditar: true, permissoes: { editarEntregaveis: true } }));
  await act(async () => { render(<DetalheEntregavelPage />); });
  await concluirConsultas();
  fireEvent.click(screen.getByRole('button', { name: 'Editar entregável' }));
  expect(screen.getByRole('form', { name: 'Editar entregável Manutenção mensal' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar edição' }));
  expect(screen.queryByRole('form', { name: 'Editar entregável Manutenção mensal' })).not.toBeInTheDocument();
});

test('checklist esperado abre detalhe sem afirmar comprovação, retornando à visão do entregável', async () => {
  await act(async () => { render(<ConteudoEntregavel item={item} />); });
  await concluirConsultas();
  // Aguarda o resultado da busca de status antes de interagir com os cartões.
  const abrir = await screen.findByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  await act(async () => { fireEvent.click(abrir); });
  await concluirConsultas();
  // O painel de comprovação é mockado aqui. Testar a identidade vinculada, não a descrição que o mock não renderiza.
  expect(screen.getByRole('region', { name: 'Detalhe da evidência esperada' })).toContainElement(screen.getByTestId('comprovacao-esperada'));
  expect(screen.getByTestId('comprovacao-esperada')).toHaveTextContent('prova-1');
  expect(screen.getByText(/Enviar comprovante · Aguardando envio/)).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fechar evidência' })); });
  expect(screen.getByText('Entrega dos relatórios assinados')).toBeInTheDocument();
});


test('ADMIN com permissão explícita consegue editar obrigatoriedade na página completa', async () => {
  acesso.mockReturnValue(estado({ podeEditar: true, permissoes: {
    editarEntregaveis: true, editarEvidencias: true, criarEvidencias: true,
    alterarObrigatoriedade: true, enviarComprovantes: true,
  } }));
  await act(async () => { render(<DetalheEntregavelPage />); });
  await concluirConsultas();
  const abrir = await screen.findByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  await act(async () => { fireEvent.click(abrir); });
  await concluirConsultas();
  expect(screen.queryByRole('button', { name: 'Editar evidência Relatório' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar tipo da evidência' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Evidência obrigatória' })).toBeInTheDocument();
});

test('editar entregável não delega automaticamente edição/obrigatoriedade de evidências', async () => {
  acesso.mockReturnValue(estado({ podeEditar: true, permissoes: {
    editarEntregaveis: true, editarEvidencias: false, criarEvidencias: false,
    alterarObrigatoriedade: false, enviarComprovantes: false,
  } }));
  await act(async () => { render(<DetalheEntregavelPage />); });
  await concluirConsultas();
  const abrir = await screen.findByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  await act(async () => { fireEvent.click(abrir); });
  await concluirConsultas();
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Evidência obrigatória' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nova evidência' })).not.toBeInTheDocument();
});


test('resposta incompleta nunca libera a edição externa, mesmo para ADMIN', async () => {
  acesso.mockReturnValue(estado({ podeEditar: true, permissoes: {
    editarEntregaveis: true, editarEvidencias: true, criarEvidencias: true,
    alterarObrigatoriedade: true, enviarComprovantes: true,
  } }));
  evidenciaConsultada.mockImplementation((contratoId: string, entregavelId: string, id: string) =>
    consultarControlado({ id, contratoId, entregavelId, status: 'SEM_ENVIO', versoes: [],
      // tipoEvidencia ausente: não conceder autorização a partir de dado inválido.
    }));
  await act(async () => { render(<DetalheEntregavelPage />); });
  await concluirConsultas();
  const abrir = await screen.findByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  await act(async () => { fireEvent.click(abrir); });
  await concluirConsultas();
  // Uma consulta serve ao checklist; a outra valida o painel aberto.
  expect(evidenciaConsultada.mock.calls.filter(([, , id]) => id === 'prova-1')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Evidência obrigatória' })).not.toBeInTheDocument();
});

test('B05: rota direta não oferece edição sob contrato suspenso', async () => {
  (useContrato as jest.Mock).mockReturnValue(estado({id:'contrato-a',status:'SUSPENSO'}));
  acesso.mockReturnValue(estado({podeEditar:true,permissoes:{editarEntregaveis:true}}));
  await act(async()=>{render(<DetalheEntregavelPage/>);}); await concluirConsultas();
  expect(screen.queryByRole('button',{name:'Editar entregável'})).not.toBeInTheDocument();
});

function render(elemento: ReactElement) { return renderSemProvider(elemento, { wrapper: ProvedorConsultas }); }
