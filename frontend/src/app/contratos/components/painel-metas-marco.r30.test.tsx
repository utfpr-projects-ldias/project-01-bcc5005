import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PainelMetasMarco } from './painel-metas-marco';
import { criarMetaMarco, listarMetasMarco } from '@/lib/metas-marco';
jest.mock('@/hooks/use-meu-perfil',()=>({useMeuPerfil:()=>({dados:null})}));
jest.mock('@/app/components/provedor-consultas',()=>({useRepositorioConsultasOpcional:()=>null}));
jest.mock('@/app/ocorrencias/components/painel-ocorrencias',()=>({PainelOcorrencias:({navegacaoCadastro}: {navegacaoCadastro?:{opcoes:{MANUAL:boolean}}})=>navegacaoCadastro?<button disabled={!navegacaoCadastro.opcoes.MANUAL}>Manual (cadastro nativo)</button>:null}));
jest.mock('@/app/atividades/components/modal-cadastro-atividade',()=>({ModalCadastroAtividade:()=>null}));
jest.mock('@/app/atividades/components/cartao-atividade',()=>({CartaoAtividade:()=>null}));
jest.mock('./registro-contrato-avulso',()=>({RegistroContratoAvulso:({navegacaoExterna}: {navegacaoExterna?:{opcoes:{MANUAL:boolean}}})=>navegacaoExterna?<button disabled={!navegacaoExterna.opcoes.MANUAL}>Manual (cadastro nativo)</button>:null}));
jest.mock('./execucoes-entregavel',()=>({IconeOrigemExecucao:()=>null}));
jest.mock('@/lib/metas-marco',()=>({listarMetasMarco:jest.fn(),criarMetaMarco:jest.fn(),editarMetaMarco:jest.fn(),vincularMetaMarco:jest.fn(),desvincularMetaMarco:jest.fn(),transicionarMetaMarco:jest.fn(),candidatosMetaMarco:jest.fn()}));
const resumo={entregavelId:'marco',metas:[],arquivadas:[],total:0,concluidas:0,pesoDistribuido:0,percentualPreparacao:0,execucaoFisica:0,aptoPelasMetas:false};
beforeEach(()=>{jest.clearAllMocks();(listarMetasMarco as jest.Mock).mockResolvedValue(resumo);(criarMetaMarco as jest.Mock).mockResolvedValue({});});
test('configura Marco vazio e mostra campos quantitativos somente nessa modalidade',async()=>{
 render(<PainelMetasMarco contratoId="contrato" entregavelId="marco" permissoes={{criarMetasMarco:true} as never}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Configurar Marco'}));
 expect(screen.getByRole('heading',{name:'Nova meta'})).toBeInTheDocument();
 expect(screen.queryByText('Unidade quantitativa *')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('radio',{name:/Quantitativa/}));
 expect(screen.getByText('Unidade quantitativa *')).toBeInTheDocument();
 expect(screen.getByText('Meta prevista *')).toBeInTheDocument();
});
test('somente leitura não oferece configuração',async()=>{
 render(<PainelMetasMarco contratoId="contrato" entregavelId="marco" readOnly permissoes={{criarMetasMarco:true} as never}/>);
 await waitFor(()=>expect(screen.getByText('Planejamento do Marco')).toBeInTheDocument());
 expect(screen.queryByRole('button',{name:'Configurar Marco'})).not.toBeInTheDocument();
});

// The contextual registration uses the same four origin tabs, not a preliminary chooser.
const metaAberta=(tipo:'DESCRITIVA'|'QUANTITATIVA')=>({id:'meta',titulo:'Meta de teste',tipo,pesoCentesimos:10000,criterioConclusao:'Executar serviço',quantidadePrevista:tipo==='QUANTITATIVA'?'10':null,unidadeMedida:tipo==='QUANTITATIVA'?'visitas':null,provasExigidas:0,estado:'ABERTA',arquivadoEm:null,quantidadeRealizada:'0',percentualPreparacao:0,provasPrevistas:0,provasValidas:0,pronto:false,fisico:false,documental:true,podeIntegral:false,podeParcial:false,vinculos:[]});
test.each(['DESCRITIVA','QUANTITATIVA'] as const)('abre cadastro nativo imediatamente e controla Manual em %s',async tipo=>{
 const meta=metaAberta(tipo);
 (listarMetasMarco as jest.Mock).mockResolvedValue({...resumo,metas:[meta],total:1,pesoDistribuido:10000});
 render(<PainelMetasMarco contratoId="contrato" entregavelId="marco" permissoes={{vincularMetasMarco:true,criarOcorrencias:true,registrarExecucaoOcorrencia:true} as never}/>);
 fireEvent.click(await screen.findByRole('button',{name:'+ Adicionar'}));
 expect(screen.queryByRole('heading',{name:'Adicionar registro'})).not.toBeInTheDocument();
 const manual=await screen.findByRole('button',{name:tipo==='QUANTITATIVA'?'Manual':'Manual (cadastro nativo)',exact:true});
 if(tipo==='QUANTITATIVA'){expect(manual).toBeEnabled();expect(screen.getByRole('textbox',{name:/Quantidade executada/})).toBeInTheDocument();expect(screen.queryByRole('combobox',{name:/ocorrência/i})).not.toBeInTheDocument();}else expect(manual).toBeDisabled();
});
