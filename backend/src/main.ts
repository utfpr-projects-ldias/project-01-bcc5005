import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import type { Request, Response, NextFunction } from 'express';
import { criarProntidao } from './database/prontidao.js';
import { criarLimiteLogin } from './auth/limite-login.js';
import type { NestExpressApplication } from '@nestjs/platform-express';

import supertokens from 'supertokens-node';
import {
  middleware,
  errorHandler,
} from 'supertokens-node/framework/express';
import { verifySession } from 'supertokens-node/recipe/session/framework/express';

import { UsuariosService } from './usuarios/usuarios.service.js';
import { AppModule } from './app.module.js';
import {
  appInfo,
  superTokensConfig,
  configurarValidadorLoginHTTP,
} from './auth/supertokens.config.js';

async function bootstrap() {
  configurarValidadorLoginHTTP(async () => false);
  supertokens.init(superTokensConfig);

  const app = await NestFactory.create<NestExpressApplication>(
    AppModule,
    { bodyParser: false },
  );

  const usuarios = app.get(UsuariosService);
  configurarValidadorLoginHTTP(async id => Boolean(await usuarios.buscarAtivoPorSupertokensId(id)));

  app.enableCors({
    origin: [appInfo.websiteDomain],
    allowedHeaders: [
      'content-type',
      'idempotency-key',
      ...supertokens.getAllCORSHeaders(),
    ],
    credentials: true,
    // Permite ao frontend autorizado ler os metadados HTTP do download.
    // Nao amplia as origens permitidas ou o acesso aos arquivos.
    exposedHeaders: [
      'X-Content-Type-Options',
      'Content-Disposition',
      'Cache-Control',
    ],
  });

  app.enableShutdownHooks();
  const pronta = criarProntidao(app.get(DataSource), async () => {
    const url = new URL('/hello', superTokensConfig.supertokens.connectionURI);
    const resposta = await fetch(url, {
      headers: { 'api-key': superTokensConfig.supertokens.apiKey },
      signal: AbortSignal.timeout(3000),
    });
    await resposta.body?.cancel();
    return resposta.ok;
  });
  // Mantém o processo disponível para docker compose exec migration:run,
  // mas bloqueia endpoints HTTP até o schema e a identidade estarem prontos.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    void pronta().then(ok => {
      if (ok) next();
      else res.status(503).set('Retry-After', '2').json({ message: 'Serviço temporariamente indisponível. Verifique a inicialização do ambiente.' });
    }, next);
  });

  const limitarLogin = criarLimiteLogin();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && /^\/auth\/(?:st\/)?signin\/?$/i.test(req.path)) {
      const espera = limitarLogin(req.socket.remoteAddress ?? 'desconhecido');
      if (espera > 0) {
        res.status(429).set('Retry-After', String(espera)).json({message:'Muitas tentativas de login. Tente novamente mais tarde.'});
        return;
      }
    }
    next();
  });
  app.useBodyParser('json');
  app.useBodyParser('urlencoded', { extended: true });

  // APIs de autenticacao do SuperTokens.
  app.use(middleware());

  // Protecao do endpoint tecnico da TEC05-03.
  app.use('/protected/ping', verifySession());

  // Tratamento de erros do SuperTokens.
  app.use(errorHandler());

  try {
    await app.listen(process.env.PORT ?? 3001);
  } catch (erro) {
    await app.close();
    throw erro;
  }
}

void bootstrap().catch((error: unknown) => {
  console.error('Falha ao iniciar o NestJS:', error);
  process.exitCode = 1;
});
