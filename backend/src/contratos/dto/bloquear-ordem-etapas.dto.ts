import { IsBoolean, IsDefined } from 'class-validator';

/** Atualização atômica de regra global, mediante permissão específica. */
export class BloquearOrdemEtapasDto {
  @IsDefined() @IsBoolean() bloqueada!: boolean;
}
