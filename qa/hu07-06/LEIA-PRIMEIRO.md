# HU07-06 — INTEGRAÇÃO REAL DE ENTREGÁVEIS (segundo commit do mesmo PR)

## Sobre a entrega

Esta sub-issue demonstra a integração que **já existe** das HU07-01–04. Inclui testes automáticos de QA com **navegador Chromium REAL + login SuperTokens manual + API Nest + banco PostgreSQL**, com geração de arquivos JSON de evidências por perfil; não substitui o backend por mocks. Os 5 testes PostgreSQL isolados da HU07-05 são complementares, mas não provam UI/sessão real.

Não modifica backend, frontend, migrations, `README.md` principal, nem cria status de execução/comprovação. **O teste de escrita INSERE permanentemente uma etapa e cinco entregáveis no contrato escolhido e os edita.** Use contrato de QA existente e confirme o opt-in. Não execute em contratos de produção. Não há rotina de apagar dados históricos.

## Pré-requisitos

- Branch `feature/hu07-05-06-testes-integracao-entregaveis` com primeiro commit `85eb0ee` presente e árvore de trabalho limpa antes de aplicar o pacote.
- Containers `frontend`, `backend`, `database`, `supertokens` no Docker Compose (`docker compose up -d --build` se ainda não estiverem iniciados). Migrations HU07-01 aplicadas (nove esperadas no snapshot).
- Ao menos **um contrato de QA real** com UUID conhecido, além de cinco contas SuperTokens reais: Admin, Gestor com vínculo/podeEditar, Gestor com vínculo sem podeEditar, Colaborador com vínculo e pessoa sem vínculo. A conta sem vínculo pode ser Gestor ou Colaborador. Use a interface de administração existente para configurar vínculos; **não** use credenciais de produção.
- Chromium e Playwright Python. Se o laboratório HU06-05 já foi executado, pode reutilizar o mesmo ambiente Python. Caso contrário:

```bash
python3 -m venv /tmp/venv-hu07-06
/tmp/venv-hu07-06/bin/pip install playwright
/tmp/venv-hu07-06/bin/python -m playwright install chromium
```

**Importante:** o script abre janela de login, pausa apenas para você autenticar cada conta e, depois, automatiza os testes. Não transmite senhas ao terminal ou a relatórios. Arquivos JSON de resultado são criados em `/tmp`, e não entram no PR.

## Ajustes pós-HU07-06 — modal, refresh e responsável

O fluxo de navegador foi sincronizado com a interface revisada. Ele **também** exige que a edição
existente de Etapa abra em modal, que Esc/Voltar/X/clique fora fechem sem navegar, foco e scroll preservados, que o botão de atualização
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
/tmp/venv-hu07-06/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --perfil administrador \
  --escrita --confirmar-persistencia --validar-banco \
  --saida /tmp/hu07-06-administrador.json
```

O JSON fornece `entregaveisCriados[0].id`. Guarde esse ID (apenas UUID, sem token) para testar os perfis de leitura.

## 3. Gestor autorizado a planejar — cinco tipos com sessão própria

```bash
/tmp/venv-hu07-06/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --perfil gestor-edicao \
  --escrita --confirmar-persistencia --validar-banco \
  --saida /tmp/hu07-06-gestor-edicao.json
```

## 4. Gestor somente leitura / Colaborador / Sem vínculo

Todos usam **o ID de um entregável criado no passo 2**, em sessões separadas:

```bash
/tmp/venv-hu07-06/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --entregavel-id UUID_DO_ENTREGAVEL_QA \
  --perfil gestor-leitura --validar-banco --saida /tmp/hu07-06-gestor-leitura.json

/tmp/venv-hu07-06/bin/python qa/hu07-06/validar_fluxo_real.py \
  --contrato-id UUID_DO_CONTRATO_DE_QA --entregavel-id UUID_DO_ENTREGAVEL_QA \
  --perfil colaborador --validar-banco --saida /tmp/hu07-06-colaborador.json

/tmp/venv-hu07-06/bin/python qa/hu07-06/validar_fluxo_real.py \
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
