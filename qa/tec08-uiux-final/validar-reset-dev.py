"""Valida a configuração resolvida sem imprimir variáveis/credenciais."""
import json
import pathlib
import sys
from urllib.parse import urlsplit


def validar(config, raiz):
    def exigir(cond, motivo):
        if not cond:
            raise ValueError(motivo)
    exigir(config.get('name') == 'project-01-bcc5005', 'Projeto Compose inesperado.')
    servicos = config.get('services', {})
    exigir(set(servicos) == {'frontend', 'backend', 'database', 'supertokens'}, 'Serviços não reconhecidos.')
    for nome in ('backend', 'frontend'):
        s = servicos[nome]
        build = s.get('build', {})
        exigir(build.get('dockerfile') == 'Dockerfile.dev' and pathlib.Path(build.get('context', '')).resolve() == raiz / nome, 'Build não é o de desenvolvimento local.')
        exigir(s.get('environment', {}).get('NODE_ENV', 'development') == 'development', 'NODE_ENV não é development.')
        exigir(any(v.get('type') == 'bind' and pathlib.Path(v.get('source', '')).resolve() == raiz / nome and v.get('target') == '/app' for v in s.get('volumes', [])), 'Código local não montado.')
    backend = servicos['backend']
    env = backend.get('environment', {})
    exigir(urlsplit(env.get('DATABASE_URL', '')).hostname == 'database', 'Banco externo proibido.')
    exigir(env.get('SUPERTOKENS_CONNECTION_URI') == 'http://supertokens:3567', 'Autenticação externa proibida.')
    exigir(env.get('ARQUIVOS_DIRETORIO') == '/var/lib/contratos-arquivos', 'Diretório de armazenamento inesperado.')
    for nome, servico, destino in [('postgres_data', 'database', '/var/lib/postgresql/data'), ('arquivos_contratuais_data', 'backend', '/var/lib/contratos-arquivos')]:
        vol = config.get('volumes', {}).get(nome, {})
        exigir(vol.get('name') == 'project-01-bcc5005_' + nome and not vol.get('external') and not vol.get('driver_opts') and vol.get('driver', 'local') == 'local', 'Volume não é exclusivo do projeto local.')
        montagens = [v for v in servicos[servico].get('volumes', []) if v.get('target') == destino]
        exigir(len(montagens) == 1 and montagens[0].get('type') == 'volume' and montagens[0].get('source') == nome, 'Montagem de dados inesperada.')
    exigir(servicos['database'].get('image') == 'postgres:17-alpine', 'Banco não reconhecido.')


if __name__ == '__main__':
    try:
        validar(json.load(sys.stdin), pathlib.Path(sys.argv[1]).resolve())
    except (ValueError, TypeError, KeyError, IndexError) as erro:
        print('BLOQUEADO: configuração Compose não reconhecida como desenvolvimento local.', file=sys.stderr)
        sys.exit(2)
