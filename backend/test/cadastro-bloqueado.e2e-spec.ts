import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('TEC07-04: signup NestJS bloqueado (E2E)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('nega requisição de cadastro público sem criar usuário', async () => {
    await request(app.getHttpServer()).post('/auth/signup').send({
      email: 'nao-criar@example.com', password: 'SenhaForte!123', role: 'ADMINISTRADOR',
    }).expect(403);
  });
});
