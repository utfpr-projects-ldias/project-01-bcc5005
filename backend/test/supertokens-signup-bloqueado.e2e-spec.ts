import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import supertokens from 'supertokens-node';
import { middleware } from 'supertokens-node/framework/express';
import { AppModule } from '../src/app.module.js';
import { superTokensConfig } from '../src/auth/supertokens.config.js';

/** Monta o middleware REAL usado no main.ts. Não cria usuário. */
describe('TEC07-04: SuperTokens signup público desligado (E2E)', () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    supertokens.init(superTokensConfig);
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({ bodyParser: false });
    app.useBodyParser('json');
    app.use(middleware());
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it('não publica POST /auth/st/signup mesmo com role falsificado', async () => {
    await request(app.getHttpServer()).post('/auth/st/signup').send({
      formFields: [
        { id: 'email', value: 'nunca-criar@empresa.test' },
        { id: 'password', value: 'SenhaForte!1234' },
        { id: 'role', value: 'ADMINISTRADOR' },
      ],
    }).expect(404);
  });
});
