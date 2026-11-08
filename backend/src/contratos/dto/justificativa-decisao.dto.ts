import { IsString, Length } from 'class-validator';

/** Decisões de reabertura/retomada não apagam o histórico anterior. */
export class JustificativaDecisaoDto {
  @IsString()
  @Length(15, 200)
  motivo!: string;
}
