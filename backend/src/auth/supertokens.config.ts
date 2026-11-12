import EmailPassword from 'supertokens-node/recipe/emailpassword';
import Session from 'supertokens-node/recipe/session';

const connectionURI = process.env.SUPERTOKENS_CONNECTION_URI;
const apiKey = process.env.SUPERTOKENS_API_KEY;

if (!connectionURI) throw new Error('SUPERTOKENS_CONNECTION_URI não foi definida.');
if (!apiKey) throw new Error('SUPERTOKENS_API_KEY não foi definida.');

export const appInfo = {
  appName: 'Gestao Contratual',
  apiDomain: `http://localhost:${process.env.PORT ?? 3001}`,
  websiteDomain: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  apiBasePath: '/auth/st',
  websiteBasePath: '/login',
};

/**
 * Desliga APENAS a API HTTP pública de cadastro do recipe.
 * EmailPassword.signUp('public', ...) permanece disponível no SERVIDOR para
 * bootstrap/administração. Não usar override.functions.signUp para esse bloqueio.
 */
export const superTokensConfig = {
  framework: 'express' as const,
  supertokens: { connectionURI, apiKey },
  appInfo,
  recipeList: [
    EmailPassword.init({
      override: {
        apis: (original) => ({ ...original, signUpPOST: undefined }),
      },
    }),
    Session.init(),
  ],
};
