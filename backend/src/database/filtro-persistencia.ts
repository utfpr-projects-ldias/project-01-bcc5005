import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Response } from 'express';
import { registrarFalhaPersistencia } from './falha-persistencia.js';

export function classificarFalhaPersistencia(codigo?: string): { status: number; mensagem: string } {
  switch (codigo) {
    case '23505': return {status:409,mensagem:'Já existe um registro conflitante. Atualize os dados antes de tentar novamente.'};
    case '23503': return {status:409,mensagem:'Há vínculos incompatíveis ou dependentes. Atualize os dados e confira os relacionamentos.'};
    case '23P01': return {status:409,mensagem:'O período ou registro entra em conflito com outro existente. Atualize os dados.'};
    case '40P01': case '40001': case '55P03':
      return {status:409,mensagem:'Outra operação está alterando estes dados. Atualize a página e tente novamente.'};
    case '23514': case '23502': case '22P02': case '22001': case '22003': case '22007': case '22008':
      return {status:400,mensagem:'Os dados não atendem às regras de integridade. Revise os campos e os vínculos.'};
    case '57014': case '57P01': case '57P02': case '57P03': case '53300':
      return {status:503,mensagem:'Serviço temporariamente indisponível. Confira o resultado da operação antes de reenviar.'};
    default:
      if (codigo?.startsWith('08')) return {status:503,mensagem:'Serviço temporariamente indisponível. Confira o resultado da operação antes de reenviar.'};
      return {status:500,mensagem:'Não foi possível concluir a operação. Tente novamente.'};
  }
}

/** Só intercepta falhas SQL não tratadas pelos serviços. As exceções de domínio,
 * a autorização e a compensação de uploads continuam com seus próprios fluxos. */
@Catch(QueryFailedError)
export class FiltroPersistencia implements ExceptionFilter<QueryFailedError> {
  catch(erro: QueryFailedError, host: ArgumentsHost): void {
    registrarFalhaPersistencia('PersistenciaHTTP',erro);
    const {status,mensagem} = classificarFalhaPersistencia((erro.driverError as {code?:string})?.code);
    const resposta = host.switchToHttp().getResponse<Response>();
    if (status === 503) resposta.set('Retry-After','2');
    resposta.status(status).json({statusCode:status,message:mensagem});
  }
}
