import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import supertokens from 'supertokens-node';
import {
  middleware,
  errorHandler,
} from 'supertokens-node/framework/express';

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

  app.use(middleware());
  app.use(errorHandler());

  await app.listen(process.env.PORT ?? 3001);
}

void bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar o NestJS:', error);
  process.exitCode = 1;
});
