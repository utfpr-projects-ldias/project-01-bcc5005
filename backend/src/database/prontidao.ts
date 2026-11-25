import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';

import { verificarSchema } from './historico-migrations.js';
export { verificarSchema } from './historico-migrations.js';

/** Cache curto + single flight: indisponibilidade não dispara uma consulta por requisição. */
export function criarProntidao(db: DataSource, verificarIdentidade: () => Promise<boolean>) {
  const logger = new Logger('Prontidao');
  let ultima: boolean | undefined;
  let ate = 0;
  let emCurso: Promise<boolean> | undefined;
  return async (): Promise<boolean> => {
    if (emCurso) return emCurso;
    if (Date.now() < ate) return ultima === true;
    emCurso = (async () => {
      let pronta = false;
      try {
        pronta = await verificarSchema(db) && await verificarIdentidade();
      } catch (erro) {
        // Somente código técnico: SQL, parâmetros e credenciais não vão para logs.
        if (ultima !== false) logger.warn(`Dependência indisponível (código: ${(erro as { code?: string })?.code ?? 'sem código'}).`);
      }
      if (pronta !== ultima) {
        if (pronta) logger.log('Schema e serviço de identidade disponíveis.');
        else logger.warn('API temporariamente indisponível: confira migrations e serviço de identidade.');
      }
      ultima = pronta;
      ate = Date.now() + 2000;
      return pronta;
    })().finally(() => { emCurso = undefined; });
    return emCurso;
  };
}
