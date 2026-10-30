import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';

/** HU07-01: registro das entidades; endpoints e serviços vêm em HU07-02. */
@Module({ imports: [TypeOrmModule.forFeature([Entregavel, EvidenciaEsperada])] })
export class EntregaveisModule {}
