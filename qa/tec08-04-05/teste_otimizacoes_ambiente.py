"""Regressões estáticas de Docker, VS Code e lint rápido (sem Docker/Node)."""
from pathlib import Path
import json
import unittest
ROOT = Path(__file__).resolve().parents[2]

class TesteOtimizacoesDesenvolvimento(unittest.TestCase):
    def test_dockerignore_exclui_deps_e_mantem_fontes(self):
        for contexto in ('backend', 'frontend'):
            with self.subTest(contexto=contexto):
                conteudo = (ROOT / contexto / '.dockerignore').read_text()
                for caminho in ('node_modules/', '.next/', 'dist/', '.env', '*.tsbuildinfo'):
                    self.assertIn(caminho, conteudo)
                for caminho in ('src/', 'test/', 'package-lock.json', 'package*.json'):
                    self.assertNotIn('\n' + caminho + '\n', conteudo)
                self.assertIn('!.env.example', conteudo)

    def test_lint_completo_continua_type_aware_e_rapido_e_opt_in(self):
        scripts = json.loads((ROOT / 'backend/package.json').read_text())['scripts']
        self.assertIn('--type-aware', scripts['lint'])
        self.assertNotIn('--type-aware', scripts['lint:fast'])
        self.assertIn('src/ test/', scripts['lint:fast'])

    def test_vscode_nao_desabilita_jest_eslint_ou_typescript(self):
        config = json.loads((ROOT / '.vscode/settings.json').read_text())
        self.assertTrue(config['files.watcherExclude']['**/node_modules/**'])
        self.assertTrue(config['files.watcherExclude']['**/.next/**'])
        self.assertNotIn('typescript.validate.enable', config)
        self.assertNotIn('eslint.enable', config)

if __name__ == '__main__':
    unittest.main()
