#!/usr/bin/env python3
"""Executa HU06-05 com cinco contas/cenários reais; não aprova checks humanos.

Usa o venv e as credenciais já presentes em qa/hu07-06/.local/; não grava segredos.
Edição de vínculos ocorre via API auditada e só com opt-in explícito.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import uuid
from zipfile import ZipFile, ZIP_DEFLATED

RAIZ = Path(__file__).resolve().parents[2]
LOCAL_HU06 = RAIZ / 'qa' / 'hu06-05' / '.local'
LOCAL_HU07 = RAIZ / 'qa' / 'hu07-06' / '.local'
HU06 = RAIZ / 'qa' / 'hu06-05'
HU07 = RAIZ / 'qa' / 'hu07-06'
VALIDOS = {'sem vínculo': 'revogar', 'somente leitura': 'leitura', 'edição': 'edicao'}
PERFIS = ('administrador', 'gestor-edicao', 'gestor-leitura', 'colaborador', 'sem-vinculo')


def validar_uuid(value: str) -> str:
    try:
        value = str(uuid.UUID(value))
    except (ValueError, AttributeError) as exc:
        raise argparse.ArgumentTypeError('UUID de contrato inválido') from exc
    return value


def opcoes(argv=None):
    ap = argparse.ArgumentParser(description='QA real HU06-05 em uma execução; restaura vínculos e salva JSONs')
    ap.add_argument('--contrato-id', type=validar_uuid, required=True)
    ap.add_argument('--outro-contrato-id', type=validar_uuid, help='Opcional: outro contrato existente com etapa, para teste cruzado')
    ap.add_argument('--confirmar-alteracoes', action='store_true', help='Aceita 4 etapas persistentes, restart do backend e alterações temporárias de vínculos')
    ap.add_argument('--pular-regressoes', action='store_true', help='Omitir Jest/lint/build (para diagnósticos/reexecução)')
    args = ap.parse_args(argv)
    if not args.confirmar_alteracoes:
        ap.error('Exige --confirmar-alteracoes: cria 4 etapas permanentes e ajusta temporariamente vínculos via API')
    if args.outro_contrato_id and args.outro_contrato_id == args.contrato_id:
        ap.error('--outro-contrato-id precisa ser diferente do contrato principal')
    return args


def ler_estado(texto: str) -> str:
    linhas = re.findall(r'^Antes: (.*)$', texto, flags=re.MULTILINE)
    if len(linhas) != 1 or linhas[0] not in VALIDOS:
        raise ValueError('Consulta de vínculo sem estado reconhecível; não é seguro alterá-lo')
    return linhas[0]


def encontrar_hu07() -> dict[str, Path]:
    pasta = LOCAL_HU07 / 'relatorios'
    nomes = {
        'administrador': 'administrador-retomado.json',
        'gestor-edicao': 'gestor-edicao-final.json',
        'gestor-leitura': 'gestor-leitura-final.json',
        'colaborador': 'colaborador-final.json',
        'sem-vinculo': 'sem-vinculo-final.json',
    }
    candidatos = []
    for p in pasta.rglob(nomes['administrador']):
        if all((p.parent / nome).is_file() for nome in nomes.values()):
            candidatos.append(p.parent)
    if not candidatos:
        raise ValueError('Não encontrei os cinco JSONs finais da HU07-06 em qa/hu07-06/.local/relatorios/')
    candidatos.sort(key=lambda p: (p / nomes['sem-vinculo']).stat().st_mtime, reverse=True)
    diretorio = candidatos[0]
    return {perfil: diretorio / nome for perfil, nome in nomes.items()}


def empacotar(diretorio: Path) -> Path:
    arquivo = diretorio / 'EVIDENCIAS-HU06-05-PARA-ENVIO.zip'
    # Só outputs desta execução; NUNCA arquivos de credenciais ou browsers.
    with ZipFile(arquivo, 'w', ZIP_DEFLATED) as pacote:
        for p in sorted(diretorio.iterdir()):
            if p.is_file() and p != arquivo and p.suffix in ('.json', '.log'):
                pacote.write(p, p.name)
    arquivo.chmod(0o600)
    return arquivo


class Executor:
    def __init__(self, args, pasta):
        self.args = args
        self.pasta = pasta
        self.python = LOCAL_HU07 / 'venv' / 'bin' / 'python'
        self.env = {**os.environ, 'PLAYWRIGHT_BROWSERS_PATH': str(LOCAL_HU07 / 'browsers'), 'PYTHONUNBUFFERED': '1', 'PYTHONDONTWRITEBYTECODE': '1'}
        self.passos: list[dict] = []
        self.estados: dict[str, str] = {}
        self.restauracao: list[str] = []
        self._contagem_log = 0

    def comando(self, nome: str, cmd: list[str], *, silenciar: bool = False) -> str:
        print(f'\n[HU06-05] {nome}', flush=True)
        self._contagem_log += 1
        log = self.pasta / (f'{self._contagem_log:02d}-' + re.sub(r'[^a-zA-Z0-9_-]', '-', nome.lower()) + '.log')
        with log.open('x', encoding='utf-8') as f:
            log.chmod(0o600)
            proc = subprocess.Popen(cmd, cwd=RAIZ, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
            linhas = []
            assert proc.stdout is not None
            for linha in proc.stdout:
                f.write(linha)
                linhas.append(linha)
                if not silenciar:
                    print(linha, end='', flush=True)
            retorno = proc.wait()
        self.passos.append({'passo': nome, 'exitCode': retorno, 'log': log.name})
        if retorno != 0:
            raise RuntimeError(f'{nome}: falhou (código {retorno}), veja {log.name}')
        return ''.join(linhas)

    def vinculo(self, perfil: str, modo: str) -> str:
        # Usuário obtido do mesmo arquivo privado usado pelo login; sem senha nos args.
        sys.path.insert(0, str(HU07))
        from credenciais_locais import carregar_credenciais
        email, senha = carregar_credenciais(perfil)
        del senha
        comando = [str(self.python), str(HU07 / 'ajustar_vinculo_qa.py'), '--contrato-id', self.args.contrato_id,
                   '--email', email, '--modo', modo]
        if modo != 'consultar':
            comando.append('--confirmar')
        return self.comando(f'vinculo-{perfil}-{modo}', comando)

    def cenario(self, perfil: str, *, escrever=False, mobile=False, cruzado=False):
        nome = 'hu06-05-' + ('admin-cruzado' if cruzado else perfil)
        cmd = [str(self.python), str(HU06 / 'validar_fluxo_real.py'), '--contrato-id', self.args.contrato_id,
               '--perfil', perfil, '--login-automatico', '--largura', '390' if mobile else '1280',
               '--saida', str(self.pasta / (nome + '.json'))]
        if escrever:
            cmd += ['--escrita', '--confirmar-persistencia', '--reiniciar-backend', '--validar-banco']
        elif perfil != 'sem-vinculo':
            cmd.append('--validar-banco')
        if cruzado:
            cmd += ['--outro-contrato-id', self.args.outro_contrato_id]
        self.comando(nome, cmd)

    def ajustar(self, perfil, modo):
        self.vinculo(perfil, modo)

    def restaurar(self):
        for perfil, estado in self.estados.items():
            try:
                atual = ler_estado(self.vinculo(perfil, 'consultar'))
                if atual != estado:
                    self.vinculo(perfil, VALIDOS[estado])
                self.restauracao.append(f'{perfil}: restaurado para {estado}')
            except Exception as e:
                self.restauracao.append(f'{perfil}: FALHA ao restaurar - {e}')

    def executar(self):
        # Primeiro, confirmar identidades e preflight; só depois permitir escrita.
        if not self.python.is_file():
            raise ValueError('Falta o Playwright local; execute bash qa/hu07-06/INSTALAR-LOCAL.sh')
        self.comando('preflight', [str(self.python), str(HU07 / 'preflight.py')])
        hu07 = encontrar_hu07()
        # A aceitação existente será revalidada; nunca simular nova execução.
        self.comando('hu07-06-consolidacao-real', [str(self.python), str(HU07 / 'consolidar_evidencias.py'), *map(str, hu07.values())])
        if not self.args.pular_regressoes:
            self.comando('regressoes-hu07-05-06', ['bash', str(HU07 / 'VALIDAR-HU07-06.sh'), str(RAIZ)])
        # Os vínculos são conhecidos/registrados ANTES de qualquer alteração.
        self.estados['gestor-edicao'] = ler_estado(self.vinculo('gestor-edicao', 'consultar'))
        self.estados['colaborador'] = ler_estado(self.vinculo('colaborador', 'consultar'))
        try:
            self.cenario('administrador', escrever=True)
            self.ajustar('gestor-edicao', 'edicao')
            self.cenario('gestor-edicao', escrever=True)
            self.ajustar('gestor-leitura', 'leitura')
            self.cenario('gestor-leitura', mobile=True)
            self.ajustar('colaborador', 'leitura')
            self.cenario('colaborador')
            self.ajustar('sem-vinculo', 'revogar')
            self.cenario('sem-vinculo')
            if self.args.outro_contrato_id:
                self.cenario('administrador', cruzado=True)
        finally:
            self.restaurar()


def main():
    args = opcoes()
    LOCAL_HU06.mkdir(parents=True, exist_ok=True)
    label = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + uuid.uuid4().hex[:6]
    pasta = LOCAL_HU06 / 'execucoes' / label
    pasta.mkdir(parents=True, mode=0o700, exist_ok=False)
    pasta.chmod(0o700)
    e = Executor(args, pasta)
    problema = None
    try:
        e.executar()
    except Exception as exc:
        problema = str(exc).splitlines()[0][:400]
        print('[HU06-05] FALHA:', problema, file=sys.stderr, flush=True)
    pendencias = [
        'Inspeção manual HU06-05: desktop, mobile, teclado, conflito, vigência e sessão naturalmente expirada',
    ]
    if not args.outro_contrato_id:
        pendencias.append('Acesso cruzado de ID de etapa em outro contrato existente (forneça --outro-contrato-id)')
    if any('FALHA' in p for p in e.restauracao):
        problema = problema or 'Não foi possível restaurar todas as permissões; revisar saídas de vínculos.'
    # Copia o registro manual com todas as verificações em FALSE. Não aprova nada.
    registro = pasta / 'registro-visual.json'
    shutil.copyfile(HU06 / 'REGISTRO-VISUAL.example.json', registro)
    registro.chmod(0o600)
    if not problema:
        cmd_gate = [str(e.python), str(HU06 / 'consolidar_gate.py'),
                    '--diretorio', str(pasta), '--visual', str(registro)]
        res_gate = subprocess.run(cmd_gate, cwd=RAIZ, env=e.env, capture_output=True, text=True)
        texto_gate = res_gate.stdout + res_gate.stderr
        (pasta / 'gate-hu06-05.log').write_text(texto_gate, encoding='utf-8')
        (pasta / 'gate-hu06-05.log').chmod(0o600)
        print('[HU06-05] Gate global: pendente de validação manual (não marcado artificialmente).')
        if res_gate.returncode == 0:
            print('[HU06-05] Atenção: confirme que o registro visual foi preenchido COM EVIDÊNCIAS reais.')
    resumo = {
        'hu': 'HU06-05', 'tipoTeste': 'NAVEGADOR_REAL_SEM_MOCK', 'contratoId': args.contrato_id,
        'inicioDiretorio': label,
        'statusAutomatizado': 'APROVADO' if not problema else 'REPROVADO',
        'statusAceiteGlobal': 'PENDENTE_INSPECAO_MANUAL' if not problema else 'REPROVADO',
        'motivoFalha': problema,
        'cenario': ['hu06-05-'+p+'.json' for p in PERFIS],
        'passos': e.passos,
        'permissoesIniciais': e.estados,
        'restauracaoVinculos': e.restauracao,
        'pendencias': pendencias,
        'fimUtc': datetime.now(timezone.utc).isoformat(),
    }
    resultado = pasta / 'resumo.json'
    with resultado.open('x', encoding='utf-8') as f:
        json.dump(resumo, f, ensure_ascii=False, indent=2)
        f.write('\n')
    resultado.chmod(0o600)
    arquivo = empacotar(pasta)
    print('\n[HU06-05] Evidências JSON e logs:', pasta)
    print('[HU06-05] ZIP para enviar (sem credenciais):', arquivo)
    if problema:
        print('[HU06-05] Integração ainda não aprovada. Não repetir automaticamente gravações parcialmente concluídas.')
        return 1
    print('[HU06-05] Cenários automatizados aprovados; aceite manual e/ou acesso cruzado continuam pendentes.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
