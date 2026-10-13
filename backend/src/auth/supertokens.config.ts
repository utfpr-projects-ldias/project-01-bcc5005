import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';

const connectionURI = process.env.SUPERTOKENS_CONNECTION_URI;
const apiKey = process.env.SUPERTOKENS_API_KEY;

if (!connectionURI) {
  throw new Error('SUPERTOKENS_CONNECTION_URI não foi definida.');
}

if (!apiKey) {
  throw new Error('SUPERTOKENS_API_KEY não foi definida.');
}

export const appInfo = {
  appName: 'Gestao Contratual',
  apiDomain: `http://localhost:${process.env.PORT ?? 3001}`,
  websiteDomain: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  // /auth pertence aos endpoints NestJS já criados pela equipe.
  // /auth/st pertence ao SuperTokens e deve coincidir com o frontend.
  apiBasePath: '/auth/st',
  websiteBasePath: '/login',
};

export const superTokensConfig = {
  framework: 'express' as const,

  supertokens: {
    connectionURI,
    apiKey,
  },

  appInfo,

  recipeList: [
    EmailPassword.init(),
    Session.init(),
  ],
};
