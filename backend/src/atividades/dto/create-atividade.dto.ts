import { IsString, IsNotEmpty, IsArray, IsUUID, IsOptional, IsDateString } from 'class-validator';

export class CreateAtividadeDto {
  @IsUUID()
  @IsNotEmpty()
  contratoId: string;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsDateString()
  @IsNotEmpty()
  dataHora: string; // ou data civil

  @IsString()
  @IsNotEmpty()
  descricao: string;

  @IsString()
  @IsNotEmpty()
  tipo: string;

  @IsString()
  @IsNotEmpty()
  responsavel: string;

  @IsArray()
  @IsString({ each: true })
  participantes: string[];

  @IsString()
  @IsNotEmpty()
  local: string;

  @IsString()
  @IsNotEmpty()
  duracao: string;

  @IsOptional()
  @IsString()
  observacoes?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsNotEmpty()
  entregavelIds: string[]; // Relação N:N com múltiplos entregáveis
}
