# Preparação e execução integral de QA (ambiente DEV)

Este conjunto reutiliza `qa/hu07-06/.local/` (venv, Chromium, credenciais) e executa os fluxos reais via Next/SuperTokens/Nest/PostgreSQL. Nenhuma senha é versionada. Só execute contra um banco DEV com contratos exclusivos de QA.

## Instalação inicial

1. `bash qa/hu07-06/INSTALAR-LOCAL.sh`
2. `docker compose up -d --build`
3. O comando de execução abaixo confere se o Administrador consegue autenticar, pede que você abra a sessão e pressione ENTER e, **somente com confirmação**, cria por `POST /admin/usuarios` as contas ausentes:
   - `rinaldi3@gmail.com` — `GESTOR` — `Gestor de Testes`;
   - `rinaldi2@gmail.com` — `COLABORADOR` — `Colaborador de Testes`.

Usa a senha de desenvolvimento presente em `qa/hu07-06/.local/credenciais.json` (modo `0600`). Se o arquivo não existir, solicita e-mail/senha do Administrador e senha dos funcionários, sem exibir as senhas. Não redefine senhas de contas existentes; contas desativadas ou com papel divergente interrompem o fluxo.

É possível criar funcionários adicionais com `--adicional 'Nome Sobrenome,email@dev.com,GESTOR'`, repetindo o parâmetro. Eles usam a senha DEV do respectivo perfil.

## Executar uma vez toda a regressão e os cenários reais

```bash
bash qa/EXECUTAR-TODOS-QA.sh \
  --contrato-id 59220449-8c96-4faa-8b03-7be436e321a7 \
  --outro-contrato-id 0dd5ffa1-ddbc-46ec-a7db-15e4e0e56a89 \
  --confirmar-alteracoes
```

O Administrador deve realizar login no Chromium e pressionar ENTER no terminal **uma única vez**. Depois o runner usa as credenciais locais para os cenários. Para automatizar também esse primeiro login, adicione `--login-automatico-bootstrap`.

**Escritas permanentes:** o ciclo completo cria 2 etapas + 10 entregáveis HU07, 4 etapas HU06 e alterna temporariamente os vínculos do Gestor/Colaborador pelas rotas auditadas. Quando aplicável tenta restaurar os vínculos originais. Não execute em produção ou em um contrato que não seja de QA.

**Resultados locais ignorados pelo Git:**
- `qa/.local/execucoes/<DATA-ID>/EVIDENCIAS-REAL-HU06-HU07-PARA-ENVIO.zip` (envie este ZIP);
- `qa/hu07-06/.local/relatorios/<DATA-ID>/` (cinco JSONs HU07);
- `qa/hu06-05/.local/execucoes/<DATA-ID>/` (seis JSONs HU06, resumo e logs).

O empacotador usa uma lista fechada de nomes de relatórios; não copia `.env`, `credenciais.json`, cookies, tokens, `venv`, navegadores nem outras pastas. É seguro usar `git add .` **apenas depois de conferir o staging** e o `.gitignore`.

O *gate global* da HU06 continua pendente de inspeção visual/manual (inclusive expiração natural de sessão), caso não seja realizada. O runner não marca esses campos como verdadeiros artificialmente.
