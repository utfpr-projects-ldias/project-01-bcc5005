import { IsBoolean, IsUUID } from 'class-validator';
export class ConcederPermissaoDto {
  @IsUUID('4') contratoId!: string;
  @IsBoolean() podeEditar!: boolean;
}
