import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { EditarReferenciasAtividadeDto } from './dto/referencias-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';
import { MedicaoAtividadeDto } from './dto/medicao-atividade.dto.js';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('B08 — edição explícita de referências e quantidades',()=>{
  it('permite remover referências sem acrescentar execução',async()=>{
    expect(await validate(plainToInstance(EditarReferenciasAtividadeDto,{quantitativas:[],percentuais:[]}))).toHaveLength(0);
  });
  it('recusa referência duplicada, UUID inválido e listas nulas',async()=>{
    const v={ocorrenciaId:id,referencia:`manual:${id}`};
    for(const dados of [{quantitativas:[v,v]},{quantitativas:[{...v,referencia:'manual:invalido'}]},{percentuais:null}])
      expect(await validate(plainToInstance(EditarReferenciasAtividadeDto,dados))).not.toHaveLength(0);
  });
  it('permite editar ou retirar a identidade do responsável e preserva precisão de NUMERIC(18,3)',async()=>{
    for(const responsavelId of [id,null])expect(await validate(plainToInstance(UpdateAtividadeDto,{responsavelId}))).toHaveLength(0);
    expect(await validate(plainToInstance(MedicaoAtividadeDto,{ocorrenciaId:id,quantidade:'999999999999999.999'}))).toHaveLength(0);
    expect(await validate(plainToInstance(MedicaoAtividadeDto,{ocorrenciaId:id,quantidade:'9999999999999999.999'}))).not.toHaveLength(0);
  });
});
