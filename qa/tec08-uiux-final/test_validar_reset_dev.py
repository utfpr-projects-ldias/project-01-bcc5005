"""Não conecta ao Docker ou ao banco: testa a proteção de configuração."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('reset_guard', Path(__file__).with_name('validar-reset-dev.py'))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class TestResetDev(unittest.TestCase):
    def setUp(self):
        self.raiz = Path('/tmp/project-01-bcc5005')
        self.config = {'name': 'project-01-bcc5005', 'services': {}, 'volumes': {}}
        for nome in ('backend', 'frontend'):
            self.config['services'][nome] = {'build': {'context': str(self.raiz / nome), 'dockerfile': 'Dockerfile.dev'}, 'environment': {}, 'volumes': [{'type': 'bind', 'source': str(self.raiz / nome), 'target': '/app'}]}
        self.config['services']['database'] = {'image': 'postgres:17-alpine', 'volumes': []}
        self.config['services']['supertokens'] = {}
        self.config['services']['backend']['environment'] = {'DATABASE_URL': 'postgresql://database:5432/local', 'SUPERTOKENS_CONNECTION_URI': 'http://supertokens:3567', 'ARQUIVOS_DIRETORIO': '/var/lib/contratos-arquivos'}
        for nome, servico, destino in [('postgres_data', 'database', '/var/lib/postgresql/data'), ('arquivos_contratuais_data', 'backend', '/var/lib/contratos-arquivos')]:
            self.config['volumes'][nome] = {'name': 'project-01-bcc5005_' + nome}
            self.config['services'][servico]['volumes'].append({'type': 'volume', 'source': nome, 'target': destino})
    def test_local(self):
        guard.validar(self.config, self.raiz)
    def test_producao(self):
        self.config['services']['backend']['environment']['NODE_ENV'] = 'production'
        with self.assertRaises(ValueError): guard.validar(self.config, self.raiz)
    def test_remoto(self):
        self.config['services']['backend']['environment']['DATABASE_URL'] = 'postgresql://external.invalid/prod'
        with self.assertRaises(ValueError): guard.validar(self.config, self.raiz)
    def test_volume_externo(self):
        self.config['volumes']['arquivos_contratuais_data']['external'] = True
        with self.assertRaises(ValueError): guard.validar(self.config, self.raiz)
    def test_volume_outro_projeto(self):
        self.config['volumes']['postgres_data']['name'] = 'outro_postgres_data'
        with self.assertRaises(ValueError): guard.validar(self.config, self.raiz)
    def test_storage_diferente(self):
        self.config['services']['backend']['environment']['ARQUIVOS_DIRETORIO'] = '/app'
        with self.assertRaises(ValueError): guard.validar(self.config, self.raiz)

if __name__ == '__main__': unittest.main()
