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
  apiBasePath: '/auth',
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
