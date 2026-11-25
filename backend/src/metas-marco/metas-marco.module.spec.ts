import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import type { DynamicModule } from '@nestjs/common';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { MetasMarcoModule } from './metas-marco.module.js';

describe('B01 — configuração TypeORM de metas MARCO', () => {
  it('inclui ambas as entidades no forFeature para autoLoadEntities do Nest', () => {
    const imports = (Reflect.getMetadata('imports', MetasMarcoModule) ?? []) as DynamicModule[];
    const feature = imports.find((item) => item.module === TypeOrmModule);
    expect(feature).toBeDefined();
    const providers = feature?.providers ?? [];
    for (const entity of [MetaMarco, VinculoMetaMarco]) {
      const token = getRepositoryToken(entity);
      expect(providers.some((provider) => typeof provider === 'object'
        && provider !== null && 'provide' in provider && provider.provide === token)).toBe(true);
    }
  });
});
