# HU06-05 — Guia de execução real sem mocks

## O que este incremento entrega

Somente ferramentas de QA + matrizes de rastreabilidade. **Não altera código de produção**, migrations, contas, credenciais, banco, Docker Compose ou configurações de autenticação. A integração de produção permanece a que está na `develop`: Next `/contratos/[id]`, hooks `useEtapas`, API `GET/POST/PATCH /contratos/:contratoId/etapas`, Nest/AuthGuard/SuperTokens, TypeORM e PostgreSQL.

O script `validar_fluxo_real.py` não simula sessão: abre um Chromium de perfil efêmero, faz login pela tela real e usa os cookies/cabeçalhos da sessão do navegador. Não captura senha, token, cookie, vídeo ou HAR. A conta deve **já existir no sistema** e ter acesso de domínio preparado pelo Administrador. Cada execução pede login no navegador com o papel escolhido.

## Pré-requisitos

1. Código `develop` atualizado com HU06-01..04 (patch exige hashes reais da base informada).
2. `.env` local correto; `docker compose up -d --build`; migrations já aplicadas pelo processo do projeto. **Não** usar `docker compose down -v`.
3. Um Contrato de QA **preexistente** no PostgreSQL, com UUID real (`ID_CONTRATO_QA`). Preferir contrato dedicado a testes; as novas etapas **não serão apagadas**.
4. Contas reais de Administrador, Gestor vinculado com `podeEditar=true`, Gestor vinculado com `podeEditar=false`, Colaborador vinculado e Gestor/Colaborador sem vínculo; conceder/revogar via telas administrativas normais. Para evitar manipulação de vínculo simultânea, usar usuários distintos ou executar cada cenário após alterar a permissão.
5. Ambiente Linux host com Python 3 e navegador Chromium de automação disponível. O projeto Node/Nest não precisa de `playwright` no `package.json`.

### Playwright em venv separado (sem modificar dependências do repositório)

```bash
cd ~/Documents/projetos/project-01-bcc5005
python3 -m venv /tmp/hu06-05-playwright-venv
/tmp/hu06-05-playwright-venv/bin/python -m pip install playwright
/tmp/hu06-05-playwright-venv/bin/python -m playwright install chromium
# O script fica no repositório mas é executado pelo Python do venv.
mkdir -p "$HOME/hu06-05-evidencias"
```

### A) Administrador, fluxo de escrita completo

**ATENÇÃO: altera o Contrato selecionado de forma permanente!** O comando exige `--confirmar-persistencia`. Não executar em produção nem num contrato cuja lista de Etapas não possa conter registros de QA. A rotina cria duas Etapas, edita a primeira (nome/código/status), troca suas posições, atualiza navegador, reinicia o backend e compara com PostgreSQL diretamente.

```bash
cd ~/Documents/projetos/project-01-bcc5005
ID_CONTRATO_QA='SUBSTITUA-PELO-UUID-REAL'
PY=/tmp/hu06-05-playwright-venv/bin/python
$PY qa/hu06-05/validar_fluxo_real.py \
  --contrato-id "$ID_CONTRATO_QA" \
  --perfil administrador \
  --escrita --confirmar-persistencia \
  --reiniciar-backend --validar-banco \
  --largura 1280 \
  --saida "$HOME/hu06-05-evidencias/hu06-05-admin.json"
```

Faça login com a conta de Administrador na janela Chromium e pressione ENTER no terminal depois de carregar o dashboard. A automação seguirá usando a sessão real e fará logout ao final. A conta/senha não é passada à linha de comando, nem ao script.

### B) Gestor vinculado com edição

Rode a mesma sequência com `--perfil gestor-edicao`, `--escrita --confirmar-persistencia --reiniciar-backend --validar-banco`, e saída `hu06-05-gestor-edicao.json`, agora usando as credenciais **desse Gestor** na janela Chromium. Não reaproveite a sessão da execução anterior.

### C) Gestor vinculado sem edição e Colaborador

```bash
$PY qa/hu06-05/validar_fluxo_real.py --contrato-id "$ID_CONTRATO_QA" \
  --perfil gestor-leitura --largura 390 \
  --saida "$HOME/hu06-05-evidencias/hu06-05-gestor-leitura.json"

$PY qa/hu06-05/validar_fluxo_real.py --contrato-id "$ID_CONTRATO_QA" \
  --perfil colaborador --largura 1280 \
  --saida "$HOME/hu06-05-evidencias/hu06-05-colaborador.json"
```

Os leitores precisam conseguir consultar Etapas sem receber botão de escrita. O teste faz um POST propositalmente **inválido** com campo desconhecido, para confirmar que o guard rejeita (403/404) *antes* da validação DTO, sem gravar uma etapa.

### D) Sem vínculo e acesso cruzado

```bash
$PY qa/hu06-05/validar_fluxo_real.py --contrato-id "$ID_CONTRATO_QA" \
  --perfil sem-vinculo --largura 1280 \
  --saida "$HOME/hu06-05-evidencias/hu06-05-sem-vinculo.json"

# Admin consegue ler duas listas; o ID de etapa de outro Contrato deve ser 404 no Contrato principal.
ID_OUTRO_CONTRATO='SUBSTITUA-UUID-DO-OUTRO-CONTRATO-COM-ETAPA'
$PY qa/hu06-05/validar_fluxo_real.py --contrato-id "$ID_CONTRATO_QA" \
  --perfil administrador --outro-contrato-id "$ID_OUTRO_CONTRATO" \
  --saida "$HOME/hu06-05-evidencias/hu06-05-admin-cruzado.json"
```

O `--outro-contrato-id` exige um contrato **existente que já possua alguma Etapa**, caso contrário o teste é explicitamente registrado como não executado; não inventar evidência.

### E) Estado vazio, erro, vigência e conflito 409

Os testes de React da HU06-03/04 e E2E HTTP da HU06-02/04 já exercitam esses estados, mas o QA manual deve abrir um contrato real ainda sem Etapas e conferir o estado vazio; testar aviso de vigência em datas fora do contrato sem mudança automática; e reproduzir conflito com duas sessões de Gestor/Admin (em abas/contas distintas, alterando a ordem antes de salvar a outra). Registrar prints **somente se autorizados** e evitar credenciais nas imagens. Se um critério não foi observado no ambiente real, marcar pendente no PR.

### F) QA visual e aceite global

Exercitar foco e teclado, nomes de botões, texto de erro (não só cor), layout 390px e 1280px. Também validar separadamente **sessão naturalmente expirada** com um usuário de QA (não apenas logout): após o prazo real do token/sessão da configuração, fazer uma requisição protegida, verificar expiração ou refresh conforme SuperTokens e documentar status/condição. Marcar `sessaoExpirada=true` somente quando essa situação tiver sido efetivamente reproduzida e conferida; não confundir com o caso `logout → 401` automatizado. Copiar `REGISTRO-VISUAL.example.json` para fora do repositório e preencher manualmente **apenas após observar**:

```bash
cp qa/hu06-05/REGISTRO-VISUAL.example.json "$HOME/hu06-05-evidencias/registro-visual.json"
# Editar campos e marcar como true somente após inspeção real; preencher responsável.
$PY qa/hu06-05/consolidar_gate.py \
  --diretorio "$HOME/hu06-05-evidencias" \
  --visual "$HOME/hu06-05-evidencias/registro-visual.json"
```

O gate exige cinco papéis, prova de escrita Admin+Gestor, reinício do backend, comparação PostgreSQL, acesso cruzado, execução mobile/desktop, logout por sessão e registro manual aprovado. **Não se declara HU06 concluída baseado apenas em testes unitários/mocks.**

## Gate de regressão anterior

```bash
docker compose exec frontend npx tsc --noEmit
docker compose exec frontend npm test -- --runInBand
docker compose exec frontend npm run lint
docker compose exec backend npx tsc --noEmit
docker compose exec backend npm test -- --runInBand
docker compose exec backend npm run lint
# Repetir os E2E da HU06-02 e HU06-04 nos bancos isolados existentes.
docker compose exec backend sh -lc \
  'HU06_QA_TEST_DATABASE_URL="${DATABASE_URL%/*}/integrador_hu06_qa_test" npm run test:e2e -- --runInBand hu06-04-etapas-regressao-banco'
```

O `ExperimentalWarning` do Jest VM Modules é esperado; os `ERROR [ExceptionsHandler]` no E2E de rollback podem ser falhas simuladas de teste, não falhas do produto, **desde que** o teste passe. Reunir logs completos no PR.

## Critérios de segurança / limitação

- O teste grava **Etapas reais** e deixa registros de QA no contrato; escolha um contrato dedicado e autorizado. Não há DELETE de etapa no projeto e não será introduzido para limpar testes.
- Script não cria usuário/contrato, não regrava token ou cookie e não altera permissões ou schema.
- `--validar-banco` conecta ao PostgreSQL **já configurado no container**; nenhuma senha de banco é passada à shell.
- `--reiniciar-backend` não derruba o banco nem volumes, mas interrompe temporariamente o backend dev. Execute apenas no ambiente local de QA.
- `logout → 401` prova **encerramento da sessão**, não expiração temporal natural nem revogação de refresh token; investigar separadamente caso o aceite exija esse fenômeno específico.
- O gate de integração não prova HU07; confirma que `etapas.id` é UUID persistente e FK/campo de sequência estão aptos para futura referência. O PRD mantém questões PQ-03, PQ-04 e PQ-15 pendentes. Fase 2 permanece fora do escopo.
- JSON com identificadores internos de contratos e Etapas deve permanecer privado e ser revisado antes de anexar em repositório público.
