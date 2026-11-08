import { Module } from '@nestjs/common';
import { ARMAZENAMENTO_ARQUIVOS } from './contrato-armazenamento.js';
import { ArmazenamentoLocal } from './armazenamento-local.js';
import { lerInteiroPositivo, POLITICA_PROVISORIA } from './politica-arquivos.js';

/** TEC08-01: provider exportável; sem controller, sem API pública, sem entidade de documento. */
@Module({
  providers: [
    {
      provide: ARMAZENAMENTO_ARQUIVOS,
      useFactory: () => {
        const diretorio = process.env.ARQUIVOS_DIRETORIO;
        if (!diretorio) throw new Error('ARQUIVOS_DIRETORIO não configurado (fail-closed)');
        return new ArmazenamentoLocal(diretorio, {
          maxArquivoBytes: lerInteiroPositivo(process.env.ARQUIVOS_MAX_ARQUIVO_BYTES, POLITICA_PROVISORIA.maxArquivoBytes),
          maxTotalBytes: lerInteiroPositivo(process.env.ARQUIVOS_MAX_TOTAL_BYTES, POLITICA_PROVISORIA.maxTotalBytes),
        });
      },
    },
  ],
  exports: [ARMAZENAMENTO_ARQUIVOS],
})
export class ArmazenamentoModule {}
