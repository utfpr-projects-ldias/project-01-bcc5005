import {IsOptional,IsString,IsUUID,Matches} from 'class-validator';
export class ParcelaAtividadeDto {
 @IsUUID() entregavelId!:string;
 @IsOptional() @IsUUID() ocorrenciaId?:string;
 @IsString() @Matches(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/) percentual!:string;
}
