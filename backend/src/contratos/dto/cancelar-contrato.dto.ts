import { IsString, Length } from 'class-validator';

/** Justificativa auditada; cancelar é uma decisão diferente de arquivar. */
export class CancelarContratoDto {
  @IsString()
  @Length(15, 200)
  motivo!: string;
}
