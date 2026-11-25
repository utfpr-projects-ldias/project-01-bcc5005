import {useState} from 'react';
export type EstadoCalendario={mes:string;dia:string;setMes:(mes:string)=>void;setDia:(dia:string)=>void};
export function hojeCalendario(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function useEstadoCalendario():EstadoCalendario{const [mes,setMes]=useState(()=>hojeCalendario().slice(0,7));const [dia,setDia]=useState(hojeCalendario);return {mes,dia,setMes,setDia};}
