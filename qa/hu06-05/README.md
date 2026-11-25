# HU06-05 — QA funcional automático

## Execução oficial

Na raiz do repositório, execute **somente**:

```bash
./testes-all
```

A regressão configura o ambiente DEV, provisiona as contas de teste, cria dois
contratos sintéticos, executa HU06/HU07 e valida automaticamente os cenários
de cinco perfis com Chromium/SuperTokens, APIs Nest e PostgreSQL. Nenhum UUID,
formulário de aceite ou campo booleano deve ser fornecido manualmente.

### O que precisa passar

- Administrador e gestor autorizado criam e editam etapas reais pela interface;
  IDs, ordem e alterações são conferidos por API e PostgreSQL, inclusive após
  reinício do backend.
- Gestor somente leitura, colaborador e usuário sem vínculo não ganham ações
  de escrita; o acesso cruzado por IDs de outro contrato é rejeitado.
- Login usa a tela real do SuperTokens; logout seguido de acesso protegido
  retorna HTTP 401.
- Chromium verifica navegação por teclado e foco, além dos formatos móvel
  (390 px) e desktop (1280 px).
- O `consolidar_gate.py --automatico` só aprova com relatórios reais completos.
  A ausência de perfil ou de prova essencial reprova o teste `QA-REAL-HU06-HU07`
  e, consequentemente, o `./testes-all`.

### Evidências e limites

Os resultados estão nos ZIPs gerados pelo próprio `./testes-all`, incluindo o
relatório `qa/hu06-05/.local/execucoes/<execucao>/resumo.json`. O relatório
apresenta `statusAceiteGlobal: APROVADO_FUNCIONAL_AUTOMATIZADO` quando tudo
passa. O consolidado HU06/HU07 apresenta o mesmo status no campo
`statusAceiteGlobalHU06`.

Os testes criam dados **sintéticos persistentes** na base DEV; não fazem reset,
backup ou commit. O QA não inclui credenciais, cookies ou tokens nos relatórios.

**Limites honestos:** logout 401 não comprova expiração natural do token;
avaliação estética subjetiva e aprovação/merge do PR são decisões externas,
não critérios de teste. Esses aspectos não recebem um falso PASS nem são
apresentados como pendência de aceite funcional obrigatório.
