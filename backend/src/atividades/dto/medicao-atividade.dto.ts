import { IsString, IsUUID, Matches } from 'class-validator';
/** Cada ocorrência possui sua quantidade própria; zero registra participação sem avanço. */
export class MedicaoAtividadeDto {
  @IsUUID() ocorrenciaId!: string;
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/, { message: 'Quantidade inválida: use até três casas decimais.' }) quantidade!: string;
}
