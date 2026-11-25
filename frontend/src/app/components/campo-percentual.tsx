'use client';
import type {InputHTMLAttributes} from 'react';
export function limparSufixoPercentual(valor:string){return valor.trim().replace(/\s*%$/, '');}
export function percentualDigitado(valor:string){return /^\d{0,3}(?:[.,]\d{0,2})?$/.test(valor)&&(valor===''||Number(valor.replace(',','.'))<=100);}
export function CampoPercentual({valor,onValor,className='',decimalBR=false,...props}:Omit<InputHTMLAttributes<HTMLInputElement>,'value'|'onChange'|'type'|'onBlur'>&{valor:string;onValor:(valor:string)=>void;decimalBR?:boolean}){
 return <span className="pi-campo-percentual"><input {...props} type="text" inputMode="decimal" className={className} value={valor} onChange={e=>{const v=limparSufixoPercentual(e.target.value);if(percentualDigitado(v))onValor(v);}} onBlur={()=>{if(valor.trim()&&percentualDigitado(valor)&&Number.isFinite(Number(valor.replace(',','.'))))onValor(decimalBR?Number(valor.replace(',','.')).toFixed(2).replace('.',','):Number(valor.replace(',','.')).toFixed(2));}}/><span aria-hidden="true">%</span></span>;
}
