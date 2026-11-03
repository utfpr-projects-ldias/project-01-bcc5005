import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArmazenamentoModule } from '../armazenamento/armazenamento.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';
import { AutorizacaoModule } from '../autorizacao/autorizacao.module.js';
import { DocumentoContratual } from './documento-contratual.entity.js';
import { DocumentosController } from './documentos.controller.js';
import { DocumentosService } from './documentos.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentoContratual]), ArmazenamentoModule, AuditoriaModule, AutorizacaoModule],
  controllers: [DocumentosController],
  providers: [DocumentosService],
})
export class DocumentosModule {}
