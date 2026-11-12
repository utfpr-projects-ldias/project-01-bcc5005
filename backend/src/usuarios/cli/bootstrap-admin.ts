/**
 * TEC07-01: cria exclusivamente o primeiro Administrador de um banco NOVO.
 * Modo interativo: npm run admin:create -- email@exemplo.com
 * Compatibilidade: mantém stdin de três linhas (novo/existente, e-mail, senha).
 * Nunca expor como endpoint HTTP nem imprimir a senha.
 */
import 'reflect-metadata';
import supertokens from 'supertokens-node';
import EmailPassword from 'supertokens-node/recipe/emailpassword';
import { DataSource } from 'typeorm';

import { superTokensConfig } from '../../auth/supertokens.config.js';
import {
  criarAdministradorInicial,
  type CredenciaisBootstrap,
  type ModoBootstrap,
  type ProvedorIdentidadeBootstrap,
} from '../bootstrap-admin.service.js';
import { PerfilUsuario } from '../perfil-usuario.enum.js';
import { Usuario } from '../usuario.entity.js';

async function lerCredenciaisDaEntrada(): Promise<CredenciaisBootstrap> {
  let entrada = '';
  for await (const trecho of process.stdin) {
    entrada += trecho.toString();
    if (entrada.length > 8192) throw new Error('Entrada acima do limite esperado');
  }
  const [modo, email, senha, ...extras] = entrada.split(/\r?\n/);
  if (!['novo', 'existente'].includes(modo ?? '') || !email || !senha ||
      extras.some((valor) => valor.length > 0)) {
    throw new Error('Informe modo, e-mail e senha em três linhas via stdin');
  }
  return { modo: modo as ModoBootstrap, email, senha };
}

/** Leitura no terminal real, sem ecoar a senha ou enviá-la como argumento. */
function solicitarSenhaOculta(mensagem: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
    throw new Error('Execute interativamente no terminal: docker compose exec backend npm run admin:create -- email@exemplo.com');
  }

  return new Promise((resolve, reject) => {
    let senha = '';
    const entrada = process.stdin;
    const eraRaw = entrada.isRaw === true;
    let encerrado = false;

    const finalizar = (erro?: Error): void => {
      if (encerrado) return;
      encerrado = true;
      entrada.off('data', receber);
      entrada.setRawMode(eraRaw);
      entrada.pause();
      process.stdout.write('\n');
      if (erro) reject(erro);
      else resolve(senha);
    };

    const receber = (buffer: Buffer | string): void => {
      const texto = buffer.toString('utf8');
      for (const caractere of texto) {
        if (caractere === '\u0003' || caractere === '\u0004') {
          finalizar(new Error('Operação cancelada'));
          return;
        }
        if (caractere === '\r' || caractere === '\n') {
          finalizar();
          return;
        }
        if (caractere === '\u007f' || caractere === '\b') {
          senha = senha.slice(0, -1);
          continue;
        }
        if (caractere >= ' ' && caractere !== '\u007f') {
          senha += caractere;
          if (senha.length > 1024) {
            finalizar(new Error('Senha acima do limite de entrada')); 
            return;
          }
        }
      }
    };

    try {
      process.stdout.write(mensagem);
      entrada.setRawMode(true);
      entrada.resume();
      entrada.on('data', receber);
    } catch (erro: unknown) {
      finalizar(erro instanceof Error ? erro : new Error('Falha ao ler senha no terminal'));
    }
  });
}

function verificarForcaSenha(senha: string): string | null {
  if (senha.length < 12) return 'Use no mínimo 12 caracteres.';
  if (!/[a-z]/.test(senha) || !/[A-Z]/.test(senha)) {
    return 'Inclua letras maiúsculas e minúsculas.';
  }
  if (!/[0-9]/.test(senha)) return 'Inclua pelo menos um número.';
  if (!/[^A-Za-z0-9]/.test(senha)) return 'Inclua pelo menos um símbolo.';
  return null;
}

async function lerCredenciaisInterativas(email: string, modo: ModoBootstrap): Promise<CredenciaisBootstrap> {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new Error('Informe um e-mail válido como argumento.');
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Este comando exige um terminal interativo (não utilize docker compose exec -T).');
  }

  console.log(`Primeiro Administrador: ${email.toLowerCase()}`);
  for (;;) {
    const senha = await solicitarSenhaOculta('Senha: ');
    const motivo = verificarForcaSenha(senha);
    if (motivo) {
      console.error(`Senha rejeitada: ${motivo} Tente novamente.`);
      continue;
    }
    const confirmacao = await solicitarSenhaOculta('Confirme a senha: ');
    if (senha !== confirmacao) {
      console.error('As senhas não conferem. Tente novamente.');
      continue;
    }
    return { modo, email, senha };
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não configurada');

  const argumentos = process.argv.slice(2);
  const interativo = argumentos[0] === '--interativo';
  let email = '';
  let modo: ModoBootstrap = 'novo';
  if (interativo) {
    if (argumentos.length < 2 || argumentos.length > 3 ||
        (argumentos.length === 3 && argumentos[2] !== '--existente')) {
      throw new Error('Uso: npm run admin:create -- email@exemplo.com [--existente]');
    }
    email = argumentos[1];
    if (argumentos[2] === '--existente') modo = 'existente';
  } else if (argumentos.length > 0) {
    throw new Error('Uso: npm run admin:create -- email@exemplo.com [--existente]');
  }

  supertokens.init(superTokensConfig);
  const conexao = new DataSource({
    type: 'postgres',
    url,
    entities: [Usuario],
    synchronize: false,
  });

  await conexao.initialize();
  try {
    let credenciais: CredenciaisBootstrap;
    if (interativo) {
      const existentes = await conexao.getRepository(Usuario).countBy({ perfil: PerfilUsuario.ADMINISTRADOR });
      if (existentes > 0) {
        console.log('Já existe um Administrador neste banco. Nenhum cadastro foi realizado.');
        return;
      }
      credenciais = await lerCredenciaisInterativas(email, modo);
    } else {
      credenciais = await lerCredenciaisDaEntrada();
    }

    const identidades: ProvedorIdentidadeBootstrap = {
      async criar(emailNovo, senha) {
        const resultado = await EmailPassword.signUp('public', emailNovo, senha);
        if (resultado.status === 'EMAIL_ALREADY_EXISTS_ERROR') {
          throw new Error('E-mail já existe no SuperTokens; utilize --existente e comprove a senha correta');
        }
        if (resultado.status !== 'OK') {
          throw new Error('Não foi possível criar a identidade no SuperTokens');
        }
        return resultado.user.id;
      },
      async excluirCriacaoIncompleta(id) {
        await supertokens.deleteUser(id);
      },
      async autenticar(emailExistente, senha) {
        const resultado = await EmailPassword.signIn('public', emailExistente, senha);
        if (resultado.status !== 'OK') {
          throw new Error('Não foi possível comprovar a identidade existente');
        }
        return resultado.user.id;
      },
    };

    const administrador = await criarAdministradorInicial(conexao, credenciais, identidades);
    console.log('Administrador inicial vinculado:', administrador.id);
  } finally {
    await conexao.destroy();
  }
}

void main().catch((erro: unknown) => {
  // Não imprimir credenciais ou DATABASE_URL.
  console.error('Bootstrap não concluído:',
    erro instanceof Error ? erro.message : 'falha não identificada');
  process.exitCode = 1;
});
