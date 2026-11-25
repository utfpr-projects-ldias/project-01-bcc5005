'use client';
import type { InputHTMLAttributes } from 'react';
/** Mantém a semântica, validação e o calendário nativo, mas exibe a data civil em pt-BR. */
export function CampoDataCivil({className='',value,onClick,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'type'>){
 const partes=typeof value==='string'? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value):null;
 return <span className={`pi-data-civil ${className}`}><input {...props} type="date" value={value} lang="pt-BR" onClick={e=>{onClick?.(e);if(!e.defaultPrevented){try{e.currentTarget.showPicker?.();}catch{/* teclado e calendário nativos permanecem disponíveis */}}}}/><span aria-hidden="true" className="pi-data-civil-valor">{partes?`${partes[3]}/${partes[2]}/${partes[1]}`:'DD/MM/AAAA'}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></svg></span>;
}
