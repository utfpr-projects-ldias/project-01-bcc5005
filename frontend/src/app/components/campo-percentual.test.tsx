import {fireEvent,render,screen} from '@testing-library/react';
import {useState} from 'react';
import {CampoPercentual,percentualDigitado,limparSufixoPercentual} from './campo-percentual';
test.each(['','0','12','12.50','12,50','100.00'])('aceita percentual %s',v=>expect(percentualDigitado(v)).toBe(true));
test.each(['101','-1','1e2','abc','10.123','100.01'])('rejeita percentual %s',v=>expect(percentualDigitado(v)).toBe(false));
test('normaliza duas casas e mantém o sufixo separado do valor',()=>{function Form(){const [v,setV]=useState('');return <CampoPercentual aria-label="Percentual" valor={v} onValor={setV}/>;}render(<Form/>);const input=screen.getByRole('textbox',{name:'Percentual'});fireEvent.change(input,{target:{value:'12'}});fireEvent.blur(input);expect(input).toHaveValue('12.00');fireEvent.change(input,{target:{value:'101'}});expect(input).toHaveValue('12.00');});

test.each(["0.01","0,01","100%"])("aceita entrada percentual %s", v=>expect(percentualDigitado(limparSufixoPercentual(v))).toBe(true));
