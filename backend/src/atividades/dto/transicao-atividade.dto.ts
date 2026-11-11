import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** A verificação não exige motivo; demais transições exigem justificativa no serviço. */
export class TransicaoAtividadeDto {
  @IsOptional() @IsString() @MinLength(15) @MaxLength(200) justificativa?: string;
}
