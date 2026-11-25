/** DTOs transformados pelo class-transformer podem possuir campos de classe
 * com valor undefined, apesar de ausentes do JSON enviado pelo cliente.
 * Em PATCH, somente valores informados podem alterar o estado persistido.
 * null é um valor explicitamente informado e deve ser mantido. */
export function chavesDefinidas<T extends object>(dto: T): string[] {
  return Object.keys(dto).filter(chave =>
    (dto as Record<string, unknown>)[chave] !== undefined);
}
