import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AlterarMeuNomeDto {
  @IsString() @MinLength(3) @MaxLength(25) nome!: string;
}

/** A senha atual é sempre obrigatória e nunca persiste no banco/auditoria. */
export class AlterarMeuEmailDto {
  @Transform(({ value }: {value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(1) senhaAtual!: string;
}

export class AlterarMinhaSenhaDto {
  @IsString() @MinLength(1) senhaAtual!: string;
  @IsString() @MinLength(12) @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/)
  novaSenha!: string;
}
