import { IsEnum, IsString, Matches } from 'class-validator';
import { ModoCalculo } from '../contratos/modo-calculo.enum.js';

export class AtualizarModoCalculoDto {
  @IsEnum(ModoCalculo)
  modoCalculo!: ModoCalculo;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  versao!: string;
}
