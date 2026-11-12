import { IsString, Length } from 'class-validator';

export class EncerrarEtapaDto {
  @IsString()
  @Length(15, 200)
  motivo!: string;
}
