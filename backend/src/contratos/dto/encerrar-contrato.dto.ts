import { IsString, Length } from 'class-validator';

/** Justificativa obrigatória para terminar execução incompleta sem marcar 100%. */
export class EncerrarContratoDto {
  @IsString()
  @Length(15, 200)
  motivo!: string;
}
