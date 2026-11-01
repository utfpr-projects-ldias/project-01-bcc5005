# Execução atual: dados QA apenas dentro do repositório

O ambiente de teste, navegadores, credenciais e relatórios ficam em
`qa/hu07-06/.local/`, **ignorado pelo Git** (`.gitignore` único na raiz do repositório).
Não versionar ou anexar `.local/` e não fornecer senhas em comandos, mensagens ou JSONs.

```bash
# Na raiz do projeto; migra o arquivo de credenciais e JSONs antigos sem apagá-los:
python3 qa/hu07-06/migrar_qa_local.py
# Cria/recria venv + Chromium DENTRO da raiz do projeto:
bash qa/hu07-06/INSTALAR-LOCAL.sh
# Preflight de leitura, sem gravações:
bash qa/hu07-06/RODAR-LOCAL.sh preflight.py
# Login real e administração explícita de permissões:
bash qa/hu07-06/RODAR-LOCAL.sh ajustar_vinculo_qa.py --contrato-id UUID --email EMAIL --modo consultar
```

Use `RODAR-LOCAL.sh` para `ajustar_vinculo_qa.py`, `validar_fluxo_real.py`
e `consolidar_evidencias.py`. O administrador já aprovado pode ser reutilizado do
relatório migrado (não reexecutar seus POST/PATCH). O Gestor exige `edicao`
antes do cenário de escrita e `leitura` antes da leitura. O Colaborador exige
`leitura` e, depois, `revogar` para sem vínculo. Os comandos de escrita devem
ser explícitos e confirmados; nenhuma permissão é concedida silenciosamente.

Após confirmar TODOS os JSONs na pasta local, use
`bash qa/hu07-06/LIMPAR-LEGADO.sh --confirmar` para remover as pastas antigas
`~/.config/hu07-06`, `~/.local/share/hu07-06` e `/tmp/hu07-*`.
O script não remove o cache global do Chromium, Downloads, banco ou volumes.

---

# HU07-06 — INTEGRAÇÃO REAL DE ENTREGÁVEIS (segundo commit do mesmo PR)

## Histórico de implementação — instruções anteriores (prefira os comandos do início)

Para não preencher e-mail e senha em cada janela de teste, use uma configuração privada
**em pasta ignorada pelo Git**. O script solicita a senha **uma única vez, sem eco no terminal**,
e salva em texto claro somente na sua máquina, em `qa/hu07-06/.local/credenciais.json`,
com permissões de usuário 0600. Não coloque essa senha em argumentos do shell, `.env`
versionado, relatório, screenshot, ZIP ou commit. Descarte/revogue as contas depois do QA.

```bash
python3 qa/hu07-06/configurar_credenciais.py \
  --admin-email EMAIL_ADMIN_QA \
  --gestor-email EMAIL_GESTOR_QA \
  --colaborador-email EMAIL_COLABORADOR_QA
# O programa pede somente a senha (não aparece na tela).
```

Acrescente `--login-automatico` a `validar_fluxo_real.py` (os demais argumentos
permanecem iguais). A autenticação usa **o formulário Next real e o SuperTokens real**;
o QA ainda confirma a identidade em `/usuarios/me`, vínculos, permissões e PostgreSQL.
A configuração local pode apontar o Gestor para ambos os cenários, mas é necessário
mudar `podeEditar` de acordo com o teste. De forma análoga, o mesmo Colaborador
pode representar `colaborador` e `sem-vinculo` em momentos diferentes, **somente
após remover seu vínculo com o contrato**. O programa NUNCA altera permissões
automaticamente. `--login-automatico` só aceita frontend/API em localhost.

Para excluir as credenciais locais depois: `rm qa/hu07-06/.local/credenciais.json`.
O fluxo de login manual anterior continua disponível omitindo `--login-automatico`.


## Preparação antes da execução real — pré-voo de leitura (novos testes)

O último checkpoint `0c8c6e6` tinha 177 testes frontend aprovados, mas o ESLint apontou
uma mutação direta de `window.history.scrollRestoration` dentro do componente React.
Este patch move a configuração para um adaptador DOM fora da renderização, mantém a
restauração de rolagem/foco e adiciona regressão dedicada. **Não altera migrations.**

Antes de criar dados no contrato, use um ambiente local com Docker ligado:

```bash
cd ~/Documents/projetos/project-01-bcc5005
# Reutilize seu venv Playwright da HU06-05, se existir;
# senão crie este venv e instale Chromium UMA vez:
bash qa/hu07-06/INSTALAR-LOCAL.sh
qa/hu07-06/.local/venv/bin/pip install playwright
qa/hu07-06/.local/venv/bin/python -m playwright install chromium

# Confere Next, API sem sessão, migrations e Chromium. SOMENTE LEITURA:
qa/hu07-06/.local/venv/bin/python qa/hu07-06/preflight.py
```

O pré-voo NÃO cria dados, não obtém tokens e não substitui o QA real. Se falhar,
verifique os quatro serviços (`docker compose ps`), o `migration:show` e as portas
3000/3001. O preflight exige que a API retorne 401/403 para uma requisição **sem sessão**.

O aceite agora exige campo estruturado `sqlValidado: true` em cada perfil com acesso,
além da evidência textual de POST/PATCH, checklist, modal, e-mail e logout. Isso
impede consolidar como sucesso uma execução que pulou `--validar-banco`.
Não use um contrato de produção: os testes de escrita criam etapa e 5 entregáveis
permanentes no banco DEV. Os relatórios em `/tmp` são individuais, não entre em Git.

Após o pré-voo, execute administrador e gestor-edicao com `--escrita --confirmar-persistencia
--validar-banco`, e os três outros perfis conforme os comandos abaixo (para gestor-leitura
e colaborador também passe `--validar-banco`). Só então consolide as cinco evidências.


## Sobre a entrega

Esta sub-issue demonstra a integração que **já existe** das HU07-01–04. Inclui testes automáticos de QA com **navegador Chromium REAL + login SuperTokens manual + API Nest + banco PostgreSQL**, com geração de arquivos JSON de evidências por perfil; não substitui o backend por mocks. Os 5 testes PostgreSQL isolados da HU07-05 são complementares, mas não provam UI/sessão real.

Não modifica backend, frontend, migrations, `README.md` principal, nem cria status de execução/comprovação. **O teste de escrita INSERE permanentemente uma etapa e cinco entregáveis no contrato escolhido e os edita.** Use contrato de QA existente e confirme o opt-in. Não execute em contratos de produção. Não há rotina de apagar dados históricos.

## Pré-requisitos

- Branch `feature/hu07-05-06-testes-integracao-entregaveis` com primeiro commit `85eb0ee` presente e árvore de trabalho limpa antes de aplicar o pacote.
- Containers `frontend`, `backend`, `database`, `supertokens` no Docker Compose (`docker compose up -d --build` se ainda não estiverem iniciados). Migrations HU07-01 aplicadas (nove esperadas no snapshot).
- Ao menos **um contrato de QA real** com UUID conhecido e contas SuperTokens para os cinco cenários: Administrador, Gestor com vínculo/podeEditar, Gestor com vínculo sem podeEditar, Colaborador com vínculo e pessoa sem vínculo. As mesmas contas Gestor/Colaborador podem ser reutilizadas **em momentos diferentes**, desde que o Administrador configure primeiro os vínculos/permissões corretos. Use a interface de administração existente e **não** use credenciais de produção.
- Chromium e Playwright Python. Se o laboratório HU06-05 já foi executado, pode reutilizar o mesmo ambiente Python. Caso contrário:

```bash
bash qa/hu07-06/INSTALAR-LOCAL.sh
qa/hu07-06/.local/venv/bin/pip install playwright
qa/hu07-06/.local/venv/bin/python -m playwright install chromium
```

**Importante:** o script abre janela de login, pausa apenas para você autenticar cada conta e, depois, automatiza os testes. Não transmite senhas ao terminal ou a relatórios. Arquivos JSON de resultado são criados em `/tmp`, e não entram no PR.

## Ajustes pós-HU07-06 — modal, refresh e responsável

O fluxo de navegador foi sincronizado com a interface revisada. Ele **também** exige que a edição
existente de Etapa abra em modal, que Esc, X, clique fora, Voltar sem salvar **e Voltar físico do mouse/navegador** fechem sem navegar, foco e scroll preservados, que o botão de atualização
mostre loading/bloqueio visível, que o checklist limite a 10 itens e que o responsável seja
escolhido por e-mail, com confirmação por API e SQL. O consolidador exige essas quatro provas novas em cada cenário de escrita. Esses testes só são provados pela
execução REAL de Chromium com sessão SuperTokens, não pelos quatro testes locais adicionais.

Durante o QA de escrita, o script faz operações reais e permanentes apenas no contrato de QA,
enquanto os dez itens provisórios de checklist são criados e retirados **antes do POST**.

## 1. Verificação técnica (uma vez, antes do commit)

```bash
cd ~/Documents/projetos/project-01-bcc5005
bash qa/hu07-06/VALIDAR-HU07-06.sh "$PWD"
```

Executa 196+ testes Nest e 153+ Next, lint, build e tsc, conforme ambiente instalado. O script não marca integração real como aprovada sem os cinco cenários.

## 2. Administrador — cinco tipos via UI e SQL direto

Substitua `UUID_DO_CONTRATO_DE_QA` pelo UUID real. A opção `--escrita` insere cinco entregáveis, dois itens de checklist por um, e edita os cinco. Usar **um contrato de QA**, pois registros permanecem persistidos.

```bash
cd ~/Documents/projetos/project-01-bcc5005
qa/hu07-06/.local/venv/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --perfil administrador \
  --escrita --confirmar-persistencia --validar-banco \
  --saida /tmp/hu07-06-administrador.json
```

O JSON fornece `entregaveisCriados[0].id`. Guarde esse ID (apenas UUID, sem token) para testar os perfis de leitura.

## 3. Gestor autorizado a planejar — cinco tipos com sessão própria

```bash
qa/hu07-06/.local/venv/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --perfil gestor-edicao \
  --escrita --confirmar-persistencia --validar-banco \
  --saida /tmp/hu07-06-gestor-edicao.json
```

## 4. Gestor somente leitura / Colaborador / Sem vínculo

Todos usam **o ID de um entregável criado no passo 2**, em sessões separadas:

```bash
qa/hu07-06/.local/venv/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --entregavel-id UUID_DO_ENTREGAVEL_QA \
  --perfil gestor-leitura --validar-banco --saida /tmp/hu07-06-gestor-leitura.json

qa/hu07-06/.local/venv/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --entregavel-id UUID_DO_ENTREGAVEL_QA \
  --perfil colaborador --validar-banco --saida /tmp/hu07-06-colaborador.json

qa/hu07-06/.local/venv/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --entregavel-id UUID_DO_ENTREGAVEL_QA \
  --perfil sem-vinculo --saida /tmp/hu07-06-sem-vinculo.json
```

Leitores devem ver detalhe e checklist, mas não os botões de edição; a API deve negar POST/PATCH (403). Sem vínculo não pode listar nem detalhar (403/404). Todos devem receber 401 depois do **logout real**. O script não provoca alteração de senha, deleção de usuário, nem modifica permissões.

## 5. Conferência conjunta: só aprova com cinco resultados reais

```bash
python3 qa/hu07-06/consolidar_evidencias.py \
  /tmp/hu07-06-administrador.json \
  /tmp/hu07-06-gestor-edicao.json \
  /tmp/hu07-06-gestor-leitura.json \
  /tmp/hu07-06-colaborador.json \
  /tmp/hu07-06-sem-vinculo.json
```

Se algum perfil não foi testado, houve erro, faltou POST/PATCH ou foi omitido SQL, a conclusão é **NÃO CONCLUÍDA**, sem criar aprovação fictícia. Para desktop/móvel, execute o mesmo script em viewport `--largura 390` com **nome de saída distinto**; consolidação principal usa cinco relatórios únicos.

## 6. Segundo commit no PR existente

```bash
cd ~/Documents/projetos/project-01-bcc5005
git status --short
git diff --check
git add qa/hu07-06
git commit -m "test(hu07-06): valida integracao real de entregaveis por perfil e banco"
git push origin feature/hu07-05-06-testes-integracao-entregaveis
```

Nunca commite JSONs de evidência com IDs de contratos reais sem aprovação da equipe. O PR pode intitular-se **HU07-05/06 — Testes, integração real e QA de Entregáveis**. O aceite da HU07-06 depende de evidência real; o mero commit da automação não significa que as cinco sessões já foram executadas.

## Retorno do navegador e transição de etapas (correção HU07)

Abrir o modal de edição de etapas insere um estado de histórico **na mesma URL**. O botão lateral Voltar do mouse, Alt+Esquerda e Voltar do navegador devem consumir somente esse estado e fechar o diálogo, mantendo a rolagem e o foco no botão de origem. X, Esc, clique fora e Voltar sem salvar também removem a entrada temporária; salvar faz o mesmo. O QA real exige prova do Voltar físico.

Subir/Descer utiliza animação FLIP de 340 ms sobre os cartões completos. A suíte Jest com DOM simulado verifica a transição (Web Animations API); testar visualmente a suavidade no Firefox/Chromium e com `prefers-reduced-motion` é complementar. Não significa aprovação de integração real sem os cinco perfis.


## Retomar QA após falha transitória no Atualizar entregáveis (31/10)

O validador agora captura a transição de loading por MutationObserver antes do clique.
Caso a etapa tenha sido criada, mas nenhum entregável tenha sido persistido, use
`--retomar-relatorio /tmp/hu07-06-qa-Q8bbHE/administrador.json` para reutilizar
a etapa já registrada (`22d96d12-d6df-47c8-8a59-b88b27586827`), sem novo POST de etapa.
É obrigatório manter `--escrita --confirmar-persistencia`. A retomada recusa
relatórios que já tenham entregáveis registrados ou pertençam a outro contrato.
A saída nova deve ficar em `administrador-retomado.json`, preservando o relatório original.

## Credenciais próprias do Administrador (acréscimo de UX/segurança)

Na navegação **Minha conta** (`/usuario`), Administrador pode alterar seu próprio
e-mail ou senha, exigindo senha atual. Backend `PATCH /usuarios/me/email` e
`PUT /usuarios/me/senha` usam identidade autenticada, nunca ID enviado pelo cliente.
Após senha nova, as sessões são revogadas. Não testar essa alteração com o usuário
Administrador usado nos cinco cenários antes de concluir o QA da HU07-06.


### Regressão da seção Funcionários

O cenário `administrador` agora verifica, antes dos cadastros da HU07, que a pesquisa
paginada da API de funcionários não inclui a conta administrativa autenticada e que a
seção **Funcionários** não apresenta o seu e-mail. O Administrador altera suas próprias
credenciais exclusivamente em **Minha conta**; o teste nunca altera essas credenciais.

### Preparar permissões reais por e-mail, sem consultar UUID manualmente

`ajustar_vinculo_qa.py` faz login REAL de Administrador pelo Next/SuperTokens, consulta
um Gestor ou Colaborador ativo pelo **e-mail exato** e utiliza exclusivamente os
endpoints administrativos `GET/PUT/DELETE /admin/usuarios/:id/permissoes`.
Usa o arquivo local `qa/hu07-06/.local/credenciais.json` (0600), nunca o Git.
É limitado a HTTP `localhost` e exige `--confirmar` em cada mutação.
Não configura permissões automaticamente ao iniciar cenários: evita mascarar bugs
no guard e permite guardar evidências distintas de autorização e negação.

```bash
export HU07_PYTHON="$HOME/.local/share/hu07-06/venv/bin/python"
export CONTRATO_QA="UUID_DO_CONTRATO_DE_QA"
"$HU07_PYTHON" qa/hu07-06/ajustar_vinculo_qa.py --contrato-id "$CONTRATO_QA" --email "gestor@exemplo.test" --modo consultar
"$HU07_PYTHON" qa/hu07-06/ajustar_vinculo_qa.py --contrato-id "$CONTRATO_QA" --email "gestor@exemplo.test" --modo edicao --confirmar
# executar gestor-edicao; depois conceder leitura para o mesmo Gestor:
"$HU07_PYTHON" qa/hu07-06/ajustar_vinculo_qa.py --contrato-id "$CONTRATO_QA" --email "gestor@exemplo.test" --modo leitura --confirmar
# executar gestor-leitura; colaborador deve usar leitura, nunca edição:
"$HU07_PYTHON" qa/hu07-06/ajustar_vinculo_qa.py --contrato-id "$CONTRATO_QA" --email "colaborador@exemplo.test" --modo leitura --confirmar
# executar colaborador; depois revogar explicitamente:
"$HU07_PYTHON" qa/hu07-06/ajustar_vinculo_qa.py --contrato-id "$CONTRATO_QA" --email "colaborador@exemplo.test" --modo revogar --confirmar
# executar sem-vinculo
```

**Negação:** o guard operacional retorna 404 por desenho para recursos fora do escopo
ou escrita não permitida. Nos cenários de leitura, 403 e 404 são aceitáveis;
qualquer 2xx de POST/PATCH reprova. Os códigos são gravados em
`negacoesEscrita.POST`/`.PATCH` e conferidos pelo consolidador.

**Responsável no formulário:** dropdown de funcionários ativos não administrativos limitado à primeira página (20 opções),
exibe e-mail e nome, aceita seleção pelo mouse ou por ArrowUp/ArrowDown+Enter.
Pesquise parte do **e-mail** para localizar pessoas além da primeira página.
A escolha cadastral não altera o vínculo de autorização.
