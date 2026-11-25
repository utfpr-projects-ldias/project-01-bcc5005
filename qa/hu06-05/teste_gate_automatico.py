"""Regressão do gate HU06: só aprova com provas reais presentes no JSON."""
from __future__ import annotations
from contextlib import redirect_stdout
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock
import importlib.util
import io
import json
import sys

ARQ=Path(__file__).with_name('consolidar_gate.py')
spec=importlib.util.spec_from_file_location('hu06_gate_automatico',ARQ)
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

PERFIS=('administrador','gestor-edicao','gestor-leitura','colaborador','sem-vinculo')

class Gate(TestCase):
    def _fixture(self,pasta):
        for perfil in PERFIS:
            escrita=perfil in ('administrador','gestor-edicao')
            provas=['Login real SuperTokens', 'Logout real com HTTP 401']
            if escrita:
                provas.extend(['Reinicio backend + PostgreSQL real', 'PostgreSQL direta'])
            if perfil=='administrador':
                provas.extend(['ID de etapa de outro contrato negado',
                  'Teclado real: foco navegável com Tab após a aba Etapas',
                  'Viewport real: desktop 1280px'])
            if perfil=='gestor-leitura':provas.extend(['Usuário leitura: modal de etapa acessível'])
            if perfil=='colaborador':provas.append('Viewport real: mobile 390px')
            (pasta/f'hu06-05-{perfil}.json').write_text(json.dumps({
              'hu':'HU06-05','status':'APROVADO','perfilSolicitado':perfil,
              'escrita':escrita,'idsEtapasCriadas':['1','2'] if escrita else [],
              'largura':390 if perfil=='colaborador' else 1280,'provas':provas},ensure_ascii=False))

    def _gate(self,pasta):
        with mock.patch.object(sys,'argv',['qa','--diretorio',str(pasta),'--automatico']), redirect_stdout(io.StringIO()):
            return gate.main()

    def test_aceite_funcional_sem_json_manual(self):
        with TemporaryDirectory() as d:
            pasta=Path(d);self._fixture(pasta)
            self.assertEqual(self._gate(pasta),0)

    def test_sem_prova_de_teclado_ou_viewport_reprova(self):
        with TemporaryDirectory() as d:
            pasta=Path(d);self._fixture(pasta)
            p=pasta/'hu06-05-administrador.json';v=json.loads(p.read_text())
            v['provas']=[x for x in v['provas'] if 'Teclado real' not in x]
            p.write_text(json.dumps(v))
            self.assertEqual(self._gate(pasta),1)

    def test_sem_perfil_obrigatorio_reprova(self):
        with TemporaryDirectory() as d:
            pasta=Path(d);self._fixture(pasta)
            (pasta/'hu06-05-sem-vinculo.json').unlink()
            self.assertEqual(self._gate(pasta),1)

if __name__=='__main__':main()
