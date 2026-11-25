export function ContadoresVinculos({itens}:{itens:readonly {rotulo:string;total:number|null}[]}) {
  return <span className="pi-contadores-vinculos" aria-label="Vínculos do registro">{itens.map(({rotulo,total})=><span key={rotulo} className="pi-contador-vinculo" data-vazio={total===0||total===null}><span>{rotulo}</span><strong aria-label={`${rotulo}: ${total??'indisponível'}`}>{total??'—'}</strong></span>)}</span>;
}
