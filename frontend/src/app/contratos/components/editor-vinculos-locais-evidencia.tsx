'use client';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {useConsulta} from '@/app/components/provedor-consultas';
import {useAcessoContrato} from '@/hooks/use-contratos';
import {useMeuPerfil} from '@/hooks/use-meu-perfil';
import {useOcorrencias} from '@/hooks/use-ocorrencias';
import {listarAtividadesVinculaveis} from '@/hooks/use-atividades';
import {SeletorVinculosMultiplos} from '@/app/atividades/components/seletor-vinculos-multiplos';
import {editarVinculosEvidencia,type DetalheEvidencia} from '@/lib/comprovantes';
import {ModalEtapa} from './modal-etapa';

/** Edita o vínculo local sem tocar nos outros destinos nem substituir o comprovante. */
export function EditorVinculosLocaisEvidencia({dados,fechar,atualizar,abaInicial='ocorrencias'}:{dados:DetalheEvidencia;abaInicial?:'ocorrencias'|'atividades';fechar:()=>void;atualizar:()=>void|Promise<void>}){
 const c=dados.contratoId,e=dados.entregavelId,versao=dados.versoes[0];
 const acesso=useAcessoContrato(c),perfil=useMeuPerfil();
 const admin=perfil.dados?.perfil==='ADMINISTRADOR',p=acesso.dados?.permissoes;
 const podeO=Boolean(admin||p?.vincularEvidenciasOcorrencia),podeA=Boolean(admin||p?.editarAtividades);
 const [aba,setAba]=useState<'ocorrencias'|'atividades'>(abaInicial);
 const [ocupado,setOcupado]=useState(false),[erro,setErro]=useState('');
 const vinculos=dados.vinculosAtuais??[],origem=versao??dados.declaracaoPreliminar;
 const fixas=[origem?.ocorrenciaQuantidadeId,origem?.ocorrenciaPercentualId].filter((v):v is string=>Boolean(v));
 const iniciaisO=[...new Set([...vinculos.filter(v=>v.tipo==='ocorrencia').map(v=>v.id),...fixas])],iniciaisA=vinculos.filter(v=>v.tipo==='atividade').map(v=>v.id);
 const [os,setOs]=useState(iniciaisO),[asIds,setAsIds]=useState(iniciaisA);
 const agenda=useOcorrencias(c,podeO);
 const atividades=useConsulta(['atividades',c,'vinculaveis-evidencia',e],signal=>listarAtividadesVinculaveis(c,e,signal,true),{habilitada:podeA});
 const opcoesO=agenda.ocorrencias.filter(o=>o.entregavelId===e&&!o.substituidaEm).map(o=>({id:o.id,nome:o.titulo,fixo:fixas.includes(o.id)}));
 const opcoesA=(atividades.dados?.data??[]).map(a=>({id:a.id,nome:a.titulo,fixo:false}));
 for(const v of vinculos){const lista=v.tipo==='ocorrencia'?opcoesO:opcoesA;if(!lista.some(x=>x.id===v.id))lista.push({id:v.id,nome:v.titulo,fixo:fixas.includes(v.id)});}
 const mudou=(a:string[],b:string[])=>a.length!==b.length||a.some(id=>!b.includes(id));
 const mudouO=podeO&&mudou(os,iniciaisO),mudouA=podeA&&mudou(asIds,iniciaisA);
 async function salvar(){if(ocupado||(!mudouO&&!mudouA))return;setOcupado(true);setErro('');try{await editarVinculosEvidencia(c,e,dados.id,{comprovanteId:versao?.id,...(mudouO?{ocorrencias:os}:{}),...(mudouA?{atividades:asIds}:{})});await atualizar();fechar();}catch(f){setErro(f instanceof Error?f.message:'Não foi possível salvar os vínculos.');}finally{setOcupado(false);}}
 return createPortal(<ModalEtapa titulo="Editar vínculos" contexto={`${dados.entregavel??'Entregável'} · Contrato ${dados.contrato??'atual'}`} camada="edicao" larguraFormulario="registro" ocupado={ocupado} onFechar={fechar}>
 <div className="space-y-3"><p className="text-xs text-foreground/65">Altere os vínculos deste entregável. A ocorrência da contribuição permanece selecionada; outros destinos não serão alterados.</p><div className="pi-atividade-vinculos-abas" role="group" aria-label="Tipos de vínculo"><button type="button" aria-pressed={aba==='ocorrencias'} onClick={()=>setAba('ocorrencias')}>Ocorrências <span>{os.length}</span></button><button type="button" aria-pressed={aba==='atividades'} onClick={()=>setAba('atividades')}>Atividades <span>{asIds.length}</span></button></div>
 {aba==='ocorrencias'?(podeO?<SeletorVinculosMultiplos itens={opcoesO.map(o=>({...o,fixo:o.fixo||ocupado}))} valores={os} onChange={setOs} rotulo="Ocorrências vinculadas" placeholder="Localizar ocorrência…"/>:<p className="text-sm">Sem autorização para editar ocorrências vinculadas.</p>):(podeA?<SeletorVinculosMultiplos itens={opcoesA.map(a=>({...a,fixo:a.fixo||ocupado}))} valores={asIds} onChange={setAsIds} rotulo="Atividades vinculadas" placeholder="Localizar atividade…"/>:<p className="text-sm">Sem autorização para editar atividades vinculadas.</p>)}
 {Boolean((agenda.erro||atividades.erro))&&<p role="alert" className="text-xs text-error-text">Não foi possível carregar todos os vínculos disponíveis.</p>}{erro&&<p role="alert" className="text-sm text-error-text">{erro}</p>}
 <div className="flex justify-end gap-2"><button type="button" className="rounded-lg border border-current/25 px-3 py-2 text-sm" onClick={fechar} disabled={ocupado}>Cancelar</button><button type="button" data-pi-acao="primaria" className="rounded-lg px-3 py-2 text-sm font-semibold" disabled={ocupado||(!mudouO&&!mudouA)} onClick={()=>void salvar()}>Salvar vínculos</button></div></div></ModalEtapa>,document.body);
}
