import SuperTokens from 'supertokens-web-js';
import EmailPassword from 'supertokens-web-js/recipe/emailpassword';
import Session from 'supertokens-web-js/recipe/session';

let initialized = false;

export function initSuperTokens(): void {
  if (typeof window === 'undefined' || initialized) {
    return;
  }

  SuperTokens.init({
    appInfo: {
      appName: 'Gestao Contratual',
      apiDomain:
        process.env.NEXT_PUBLIC_API_URL ??
        'http://localhost:3001',
      apiBasePath: '/auth',
    },

    recipeList: [
      EmailPassword.init(),
      Session.init(),
    ],
  });

  initialized = true;
}
