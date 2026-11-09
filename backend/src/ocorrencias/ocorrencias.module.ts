import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Ocorrencia } from './ocorrencia.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Ocorrencia,
    ]),
  ],
})
export class OcorrenciasModule {}