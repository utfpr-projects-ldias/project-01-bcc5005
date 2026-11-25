import { IsUUID, IsString, Matches } from 'class-validator';
export class MedicaoDiretaAtividadeDto {
  @IsUUID() entregavelId!:string;
  @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidade!:string;
}
