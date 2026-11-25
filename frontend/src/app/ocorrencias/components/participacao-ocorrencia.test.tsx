import {render,screen} from '@testing-library/react';
import {ParticipacaoOcorrencia} from './participacao-ocorrencia';

test('participação da meta quantitativa é calculada, não digitada',()=>{
 const mudar=jest.fn();
 const {rerender}=render(<ParticipacaoOcorrencia total={100} outras={40} meta="20" onMeta={mudar}/>);
 expect(screen.getByText('20%')).toBeInTheDocument();
 expect(screen.getByText('Disponível: 40%')).toBeInTheDocument();
 expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
 rerender(<ParticipacaoOcorrencia total={100} outras={40} meta="30" onMeta={mudar}/>);
 expect(screen.getByText('30%')).toBeInTheDocument();
 expect(screen.getByText('Disponível: 30%')).toBeInTheDocument();
});
