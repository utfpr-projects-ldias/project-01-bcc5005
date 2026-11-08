import { IsBoolean, IsObject, IsOptional, IsUUID } from 'class-validator';
import type { PermissoesGranulares } from '../permissoes-granulares.js';
export class ConcederPermissaoDto {
  @IsUUID('4') contratoId!: string;
  @IsBoolean() podeEditar!: boolean;
  @IsOptional() @IsObject() permissoesDetalhadas?: PermissoesGranulares;
}
