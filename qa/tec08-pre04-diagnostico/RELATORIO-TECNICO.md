# ETAPA 4 — Continuidade segura da TEC08: diagnóstico de fontes, ZIPs aninhados, Jest, builds e QA

**Projeto:** Sistema de Gestão de Execução Contratual — UTFPR/BCC5005  
**Data:** 04/11/2026  
**Escopo autorizado:** revisão do estado local exportado, reconciliação da conversa e do terminal, preparo de diagnóstico reexecutável **sem corrigir o código de produção nesta mensagem**.  
**Próxima etapa solicitada:** correções pontuais a partir de evidências e teste, sem reaplicar pacotes anteriores automaticamente.

## 1. Síntese executiva

1. A exportação `project-01-bcc5005-estado-atual(1).zip` foi lida com suas três camadas: raiz `.git`/configuração, `backend.zip`/`frontend.zip`/`qa.zip` e, em `qa.zip`, `hu07-06.zip`; dentro deste último também existe `.local.zip`, **que não deve ser reexportado nem exibido em logs**.
2. As **21 supostas exclusões** de `qa/hu07-06` eram um artefato de extração incompleta dos ZIPs aninhados. Após reconstrução na pasta exata `qa/hu07-06/`, **não existem deletions de arquivos Git rastreados** na árvore reconstruída. Isso confirma a observação do usuário e corrige a ressalva da auditoria precedente.
3. Git exportado: branch `tec-08`, HEAD `f89a7e1af392247e9df65a872e38db2526672ed9`. Refs do pacote indicam `develop` e `origin/tec-08` anteriores ou correspondentes; **não** provam estado remoto no momento presente. Os commits TEC08-01/02/03 já fazem parte do histórico exportado; o trabalho adicional está na working tree.
4. Após reconstrução correta, `git status --short` exibe **36 arquivos rastreados modificados e 20 entradas não rastreadas** (entre arquivos e diretórios). Não se conclui que há 20 arquivos apenas; `git status` abrevia diretórios não rastreados.
5. A última execução completa registrada pelo usuário apresenta **backend Jest 264/264 e build NestJS aprovados; frontend Jest 271/272, com uma falha no nome do botão; Next build posterior e QA Chromium sem execução comprovada**. Avisos estáticos não são necessariamente erros de compilação.
6. Foram identificados problemas e riscos específicos que devem integrar a próxima rodada corretiva; **nenhum deles foi corrigido neste pacote**. A bateria de QA real com criação de dados ainda não deve ser executada como gate final.

## 2. Inventário e integridade dos anexos (fonte material)

| Camada | Conteúdo presente | Verificação | Observação |
|---|---|---|---|
| ZIP geral | `.git/`, `.env.example`, `README.md`, `docker-compose.yml`, `backend.zip`, `frontend.zip`, `qa.zip`, além de `.env` | CRC integral OK | **Não divulgar `.env`**; identidade local, não sincronismo GitHub |
| `backend.zip` | `src/`, `test/`, `docs/`, package/lock/tsconfigs, Dockerfile, `dist/` | CRC integral OK | `dist/` é artefato compilado; não considerar fonte mais atual do que `src/` |
| `frontend.zip` | `src/`, `public/`, `docs/`, package/lock/configs, `.next/` e `.swc/` | CRC integral OK | caches/builds não comprovam build atual |
| `qa.zip` | Suites HU06, HU07, TEC08-02/03, evidências, modal UX, preparação e executores | CRC integral OK | Scripts de QA abrangem cenários com persistência, não devem ser executados por engano |
| `qa/hu07-06.zip` | 21 scripts/documentos rastreados + `.local.zip` | CRC integral OK | Ao extrair, colocar arquivos **diretamente dentro de `qa/hu07-06/`** |
| `qa/hu07-06/.local.zip` | artefatos privados de QA | CRC integral OK | Contém dados locais sensíveis; **não incluir em material de entrega, commit ou log** |

O ZIP principal é autocontido para fins de revisão **do código e do histórico Git**, mas não equivale a uma instalação pronta para Playwright no ambiente de auditoria: o `venv` e os binários do Chromium, deliberadamente volumosos, não estão na fonte extraída. Essa ausência na exportação **não demonstra** ausência na máquina Linux do usuário.

As fontes do backend e frontend estão localizadas corretamente em `backend/src` e `frontend/src`; package managers seguem **npm** por `package-lock.json`, package.json e Dockerfiles. A separação dos ZIPs não exige criar novos diretórios de projeto nem substituir as pastas originais.

## 3. Verificação independente executada nesta revisão

- Foi remontada uma **cópia temporária**, sem editar a máquina do usuário, preservando estrutura Git e fontes de `backend/`, `frontend/` e `qa/`.
- O inventário de arquivos foi contrastado com `git status` após reconstruir `qa/hu07-06` no local correto.
- Os checksums CRC do ZIP geral e dos quatro ZIPs internos relevantes foram aprovados.
- **278 arquivos TypeScript/TSX** do snapshot passaram por parsing sintático com o parser TypeScript instalado neste ambiente, **0 erros de sintaxe**.
- **31 scripts Python de QA** passaram por parsing com `ast.parse`, **0 erros de sintaxe**.
- **Não** foram executados Jest, `next build`, `nest build`, banco, migrations, Docker Compose, SuperTokens ou Playwright **nesta rodada de auditoria**. Parsing sintático não é validação de tipos, dependências, integração ou runtime.

## 4. Linha do tempo correta da falha de login e do bloqueio atual

### 4.1 Erro anterior TS18048

A conversa anterior e os logs demonstram que a API chegou a não responder porque `backend/src/entregaveis/evidencias-recebidas.service.ts` chamava `.trim()` em `dto.tipoEvidencia` possivelmente ausente. O pacote de hotfix introduziu validação prévia da string; **o snapshot recebido contém esse tratamento**, de modo que não se deve reaplicar a correção TS18048.

Os logs posteriores mostraram `nest build` aprovado e `Nest application successfully started`, e o outro chat relatou login funcional após recuperação. Uma chamada `curl` que apresentou `Connection reset by peer` logo após o reinício é insuficiente para concluir que o login permanecia quebrado. Não fiz novo login real aqui: é uma evidência **histórica**, a ser confirmada no pré-voo HTTP.

### 4.2 Rodada `--target` e `--full` enviada pelo usuário

| Componente | Evidência do terminal | Leitura técnica |
|---|---|---|
| Backend Jest | `43 passed, 43 total`; `264 passed, 264 total` | **Aprovado naquela execução**; mensagens `ERROR [DocumentosService]` apareceram dentro de suíte aprovada, não como falha da bateria |
| Backend lint | `Found 2 warnings and 0 errors` | **Sem erro bloqueante**; `no-control-regex` em `backend/src/armazenamento/politica-arquivos.ts`, linhas em torno de 69 e 104 |
| Backend build | `nest build` sem diagnóstico de erro | **Aprovado naquela execução** |
| Frontend Jest | `1 failed, 45 passed`; `1 failed, 271 passed, 272 total` | **Reprovado** por um caso de teste de formulário |
| Frontend lint | Resultado mais recente não apareceu porque executor parou no Jest | **Não confirmado nessa rodada** (logs anteriores não substituem os atuais) |
| Next production build | Não alcançado pela sequência da rodada final | **Não confirmado**; não promover a correção de TS2322/TS2345 a build aprovado sem execução |
| QA Chromium | Não iniciado | **Nenhuma execução real da versão final demonstrada** |
| Migrations 1–15 | Saída prévia `migration:show` com `[X]` para 15 migrations | Evidência histórica de banco de desenvolvimento, **não nova execução neste ambiente** |

O número `86`/`286` nos logs em `node:86`, `node:286` ou `[Nest] 286` identifica um processo. Não equivale a `exit code 86`. O que de fato bloqueou a rodada mais recente foi a falha do Jest do frontend.

### 4.3 Falha reproduzível pela inspeção de código

Arquivo de teste: `frontend/src/app/contratos/components/formulario-entregavel.test.tsx`, caso `erro HTTP preserva campos; clique duplo só dispara uma mutação`, em torno da linha 63.

O teste procura o botão cujo nome corresponde a `/Salvando entregável/`. O componente `frontend/src/app/contratos/components/formulario-entregavel.tsx`, em torno da linha 271, renderiza `Salvando...` enquanto envia o formulário.

A divergência é direta entre expectativa de teste e rótulo acessível da UI. **É um bloqueio atual e uma correção focal**; sem reexecutar o teste corrigido, não declarar que a proteção contra clique duplo foi validada. Evitar trocar nomes de botões no produto apenas para satisfazer um teste desatualizado sem necessidade de UX.

## 5. Análise das mecânicas extras e rastreabilidade

### 5.1 O que existe nas fontes

- **TEC08 principal:** armazenamento local privado, política de arquivos, documentos contratuais com metadados, upload/listagem/download protegidos; infraestrutura reutilizável e APIs Jest/QA versionadas.
- **Arquivamento lógico de contrato:** presente, com migração do domínio e endpoints de arquivamento/reativação. Compatível com preservação histórica do PRD, mas requer QA de contratos relacionados e efeitos sobre a futura execução.
- **Arquivamento lógico de planejamento:** entregáveis e evidências esperadas podem ser arquivados/reativados, preservando registros e comprovantes; a implementação está ligada à migration 14.
- **Permissões granulares:** novas chaves contratuais de criar/editar/arquivar entregáveis, criar/editar/arquivar evidências esperadas, alterar obrigatoriedade, enviar/verificar comprovantes, além de etapas. Depende da migration 15 e deve respeitar a decisão de produto sobre papéis (PQ-03/04).
- **Comprovantes recebidos ligados a evidências esperadas:** upload por arquivo, versões/registro de recebimento, download e verificação interna, usando storage e auditoria. Isso adianta **parte** da HU10/TEC10, **não** conclui automaticamente RF-19–25 ou o motor de comprovação RF-22.
- **UI/UX:** modal de entregáveis; card→detalhe→edição; gestão individual de evidências; avisos de status de progresso não disponível; interfaces de permissões granulares; modais com retenção de contexto.

**Fronteira importante:** o PRD diferencia evidência esperada, arquivo recebido, comprovação documental e execução física; e a Fase 2 reserva o aceite externo formal. A verificação interna aqui não equivale ao aceite do órgão contratante.

### 5.2 Achados confirmados que exigem correção delimitada

| ID | Prioridade | Evidência diretamente inspecionada | Impacto e tratamento proposto **para a próxima mensagem** |
|---|---|---|---|
| **FIX-01 — Jest de formulário** | P1 para gate | `formulario-entregavel.test.tsx` procura `/Salvando entregável/`; `formulario-entregavel.tsx` renderiza `Salvando...` | Ajustar expectativa ao rótulo real sem afrouxar verificações de botão desabilitado, uma mutação e preservação dos dados |
| **FIX-02 — limite de evidências ao reativar** | P1/P2 | `evidencias-recebidas.service.ts::criarEsperada()` conta ativas e bloqueia ≥10; `arquivamento-planejamento.service.ts::alterarEvidencia()` reativa sem recontar ativas | É possível exceder o teto de 10 estabelecido pelo próprio código usando reativação. Decidir se o limite é política aprovada; enquanto vigente, aplicar a mesma invariante também na reativação e cobrir concorrência |
| **FIX-03 — auditoria de revogação granular** | P1/P2 | `gestao-permissoes.service.ts::revogar()` registra `dadosAnteriores` com `contratoId` e `podeEditar`, **sem** `permissoesDetalhadas` | Perda no snapshot do conjunto efetivo revogado. Adicionar captura sanitizada de permissões anteriores e testes sem expor segredos |
| **FIX-04 — cadastro com permissões granulares** | P2 | `entregaveis-da-etapa.tsx` habilita cadastro pela permissão de entregável, mas formulário permite configurar evidências mesmo quando `criarEvidencias` está negado; `entregaveis.service.ts::salvarChecklist()` impõe checagem real no backend | O backend rejeita a ação composta, sem confirmação de gravação parcial. UI deve respeitar capacidade específica ou separar criação do entregável e posterior inclusão autorizada de evidência; testar múltiplos perfis e exceção de obrigatoriedade |

A classificação P1/P2 indica impacto potencial e necessidade de gate, não prova exploração ou perda de dados. Para FIX-02, o **limite de dez por entregável não está formalmente fechado no PRD**: é uma regra atualmente implementada. Não impor um limite irreversível ao cliente por suposição.

### 5.3 Compatibilidade e riscos ainda não fechados

- **Endpoint legado de substituição integral:** `PUT /contratos/:contratoId/entregaveis/:entregavelId/evidencias-esperadas` e fluxo de `PATCH` de entregável ainda compartilham partes do contrato de checklist. O serviço bloqueia remoção física e exige autorização granular; a edição visual atual evita enviar o array antigo de evidências por padrão. É uma medida de preservação, mas precisa de testes de compatibilidade e de concorrência (duas abas, criação/arquivamento simultâneos, sessão expirada).
- **Validação de comprovantes:** conferir com sessão real a separação autor × verificador, vínculo ao entregável, versão de arquivo, download privado, conflito entre contrato A e contrato B, download pós-arquivamento e estado pendente. Não inferir correção apenas do fato de existir endpoint.
- **Migrations:** 13, 14 e 15 estavam aplicadas segundo logs, mas não rodar novamente, reverter ou editar arquivos antigos para satisfazer QA; testar em banco isolado na etapa específica, com plano de recuperação.
- **Modais e acessibilidade:** o código mostra controles de foco e navegação, mas não atesta operação de mouse, teclado, mobile e zoom sem Chromium.
- **Arquivamento e motor de progresso:** o motor TEC09/HU09 ainda não existe como sistema completo no snapshot, então reativar/arquivar entregáveis não pode produzir percentuais de progresso fictícios. Preservar integrações futuras.
- **QA guardado em `.local`**: instalação Playwright, Chromium e credenciais podem existir na máquina do usuário sem estar no ZIP. Antes de declarar QA "inexistente", conferir `qa/hu07-06/.local/venv` no ambiente real.

## 6. Revisão da estrutura `qa/` — preservar, não reinventar

O QA já fornece bases importantes, entre elas:

| Local | Função principal | Tipo de execução |
|---|---|---|
| `qa/tec08-02/` | Storage/API/docs, autorização e integração com dados reais | Pré-voo de leitura; execução cria dados sintéticos |
| `qa/tec08-03/` | Fluxos UI reais de documentos contratuais com Chromium | Pré-voo de leitura; execução cria dados sintéticos |
| `qa/evidencias-verificacao/` | Comprovantes, verificação, contratos distintos e regressão de evidências | `--verificar` consulta estado; `--executar --confirmar-persistencia` cria registros |
| `qa/tec08-modal-ux/` | Card→modal→edição→arquivamento→reativação→retorno | `--verificar` consulta prontidão; execução cria fixture persistente |
| `qa/hu07-06/` | Base existente de integração/Playwright e scripts históricos | Precisa `qa/hu07-06/.local` na máquina para automação real |
| `qa/hu06-05/`, `qa/preparar-qa/` | Integração e aceite histórico | Não confundir aprovação automatizada com aceite manual formal |

Os scripts reais de QA declaram explicitamente que **criam dados sintéticos persistentes**, embora não apaguem os contratos do usuário. Por isso **não são um equivalente seguro a `npm test` ou a `--verificar`**. Também podem conceder/revogar vínculos de contas de QA apenas para contratos criados por seus fluxos. Auditar os efeitos e usar banco de desenvolvimento adequado.

## 7. Kit anexo e execução progressiva

O pacote desta etapa contém **somente uma pasta nova** `qa/tec08-pre04-diagnostico/` com um runner de validação, verificações SHA-256 de 28 fontes críticas, instruções e este relatório. **Não contém patches de código, `.env`, credenciais, arquivos `.local` ou dados extraídos do banco.**

### Modo 1 — preflight sem banco

```bash
cd "$HOME/Documents/projetos/project-01-bcc5005"
unzip -n -q "$HOME/Downloads/tec08-diagnostico-pre04-04-11-2026.zip" -d .
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --preflight
```

O script checa branch/HEAD, fingerprints de 28 arquivos, status Git, `git diff --check`, containers ativos e localização da base de QA sem exibir credenciais.

### Modo 2 — reproduzir Jest focal (esperada falha já conhecida)

```bash
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --target
```

Executa somente quatro suítes de frontend relacionadas à UI e evidências. A expectativa é que o teste do nome do botão ainda falhe enquanto não houver correção; uma eventual aprovação deve ser investigada como mudança de snapshot ou ambiente.

### Modo 3 — seis gates de build/unitário independentes

```bash
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --full
```

Os seis gates são backend Jest, backend lint, backend build, frontend Jest, frontend lint, frontend build. **Não há encadeamento com `&&` entre os gates**: a falha de Jest não oculta o estado do Next build. Os logs são privados em `qa/tec08-pre04-diagnostico/.local/execucoes/` (ignorado pelo Git).

### Modo 4 — pré-voo QA sem criar dados, depois de revisar os gates

```bash
bash qa/tec08-pre04-diagnostico/EXECUTAR-DIAGNOSTICO.sh --qa-verificar
```

O pré-voo exige serviços disponíveis e `qa/hu07-06/.local/venv`, consulta HTTP e `migration:show`, e verifica condições de execução **sem** chamar `--executar`. As **execuções reais com fixture persistente ficam reservadas para depois das correções**.

## 8. Critérios para a próxima rodada corretiva e commit

**Não criar commit agora.** Na próxima mensagem, depois de confirmar os resultados do kit, preparar patch mínimo que:

1. Corrija FIX-01 com teste robusto de estado `salvando`/duplo clique.
2. Resolva FIX-02 com bloqueio coerente de reativação acima do limite e testes de múltiplas evidências, inclusive concorrência, sem decisão arbitrária de política do cliente.
3. Resolva FIX-03 preservando o snapshot auditável de permissões granulares revogadas.
4. Resolva FIX-04 respeitando a criação separada de entregável e de evidência esperada por papel, mantendo autorização fail-closed.
5. Mantenha compatibilidade com a TEC08-01/02/03, as 15 migrations já indicadas como aplicadas, SuperTokens e a trilha de auditoria, sem `down -v` nem alterações destrutivas.
6. Execute novamente os seis gates, depois o pré-voo de QA e por fim os testes Chromium persistentes **apenas com autorização e em ambiente seguro**; registre qual cenário/execução passou.
7. Confira `git diff`, testes, arquivos não rastreados, ausência de segredos e escopo da issue antes do commit temático. Merges/PRs, fechamento de TEC08-04/05 e homologação só mediante evidência específica.

**Conclusão:** o bloqueio imediato é específico e rastreável; a base de QA existe e os fontes estão íntegros. O próximo passo é a regularização focal sem reescrever arquitetura ou misturar features não autorizadas.
