import {useState} from 'react';
export type EstadoCalendario={mes:string;dia:string;setMes:(mes:string)=>void;setDia:(dia:string)=>void};
export function hojeCalendario(agora=new Date()){const partes=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(agora);return ['year','month','day'].map(tipo=>partes.find(p=>p.type===tipo)?.value).join('-');}
export function useEstadoCalendario(inicial?:string):EstadoCalendario{const [mes,setMes]=useState(()=> (inicial??hojeCalendario()).slice(0,7));const [dia,setDia]=useState(()=>inicial??hojeCalendario());return {mes,dia,setMes,setDia};}
