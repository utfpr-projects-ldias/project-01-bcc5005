import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import supertokens from 'supertokens-node';
import {
  middleware,
  errorHandler,
} from 'supertokens-node/framework/express';
import { verifySession } from 'supertokens-node/recipe/session/framework/express';

import { AppModule } from './app.module.js';
import {
  appInfo,
  superTokensConfig,
} from './auth/supertokens.config.js';

async function bootstrap() {
  supertokens.init(superTokensConfig);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    { bodyParser: false },
  );

  app.enableCors({
    origin: [appInfo.websiteDomain],
    allowedHeaders: [
      'content-type',
      ...supertokens.getAllCORSHeaders(),
    ],
    credentials: true,
  });

  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  // APIs de autenticacao do SuperTokens.
  app.use(middleware());

  // Protecao do endpoint tecnico da TEC05-03.
  app.use('/protected/ping', verifySession());

  // Tratamento de erros do SuperTokens.
  app.use(errorHandler());

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar o NestJS:', error);
  process.exitCode = 1;
});
