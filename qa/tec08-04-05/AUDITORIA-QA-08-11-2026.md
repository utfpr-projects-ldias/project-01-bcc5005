# Auditoria estática integral da pasta `qa/` — TEC08-04/05

**Fonte inspecionada:** exportação `develop` no commit `b44868c` (merge PR #155), mais a mudança confirmada da branch `tec-08-04-05` no commit `238efaa` e a fixture/instalador configurados nesta conversa. **Escopo:** 68 arquivos versionados de QA distribuídos por 12 diretórios, antes da ampliação TEC08-04/05. Sem acesso ao banco Docker local; não houve execução real do Chromium nesta auditoria.

## Achados comprovados

| Item | Observação no código | Medida |
|---|---|---|
| QA-01: falsa prontidão | `VALIDAR.sh --qa-verificar` conferia serviços, migrações e presença de configuração, não verificava `signIn` das três contas. Cinco testes passavam apesar de duas autenticações inválidas | Novo gate `verificar_logins.py` consulta `/usuarios/me` sob sessões reais; integra `--qa-logins`, `--qa-verificar` e a entrada do `--qa-executar` |
| QA-02: bootstrap esquecido | `qa/preparar-qa/provisionar_funcionarios.py` implementa criação de gestor/colaborador, mas não era chamado no fluxo normal. Contas existentes não têm senhas redefinidas, por decisão explícita do código | Mantido o provisionador idempotente e acrescentada recriação limpa separada |
| QA-03: reset preso à branch antiga | `RESET-TOTAL-DEV-SEM-BACKUP.sh` exigia `tec-08` | Permite também `tec-08-04-05`, preservando verificações de Compose, TTY e confirmação textual |
| QA-04: reconstrução manual | `RECOMECAR-DEV-E-VALIDAR.sh` solicitava criar Administrador manualmente, apesar de existir suporte de bootstrap via stdin na CLI TypeScript | Nova rotina `RECRIAR-DEV.sh` faz bootstrap de admin por stdin, depois funcionário via API, com gate de login |
| QA-05: teste de UX fossilizado | `qa/evidencias-verificacao/teste_ux_arquivamento.py` exigia `gestor.evaluate('window.history.back()')`; o código real utiliza Cancelar, Escape e Voltar | Alinhado o teste aos controles e à sequência efetivamente existente |
| QA-06: testes dispersos | A bateria `--target` executava somente quatro grupos, não as demais regressões Python existentes | Novo executor `testar_roteiros.py` executa isoladamente nove famílias de testes offline |
| QA-07: origem de `--qa-executar` | Script podia prosseguir para quatro suites com credenciais inválidas, gerando erro genérico `Target page, context or browser has been closed` | Gate obrigatório 3/3 antes da primeira suíte mutável |

## Inventário das 68 entradas existentes

- `qa/hu06-05`: aceite e testes históricos de fluxos de etapas/entregáveis (não descartar).
- `qa/hu07-05`: documentação e testes de regressão em ambiente dedicado.
- `qa/hu07-06`: instalação Playwright, gestão privada de credenciais, login real, validação de vínculos, testes offline.
- `qa/preparar-qa`: provisionador de funcionários, verificação pré-commit e execução conjunta HU06/HU07.
- `qa/evidencias-verificacao`: provas de upload, verificação, ACL, arquivamento e auditoria.
- `qa/revisao-contratos`: limpeza limitada à carteira e auditoria histórica.
- `qa/tec08-02`: integração documental e permissões no Chromium.
- `qa/tec08-03`: jornada de cadastro e PDFs pelo navegador.
- `qa/tec08-14b`: arquivamento, regras e auditoria.
- `qa/tec08-modal-ux`: modal de entregável e retorno ao detalhe.
- `qa/tec08-pre04-diagnostico`: **snapshot histórico** com HEAD/branch antigos; não deve ser usado como gate de branch atual.
- `qa/tec08-uiux-final`: gates focais/completos, pré-voos, manifesto e resets.

## Diferenciar os comandos

| Entrada | Mutação persistente | Resultado esperado |
|---|---|---|
| `--preflight` | Não | Branch, commit ancestral, hashes, whitespace |
| `--target` | Não (testes mockados e offline) | Frontend Jest focal, backend Jest focal e regressões Python de nove grupos |
| `--full` | Não | Backend/frontend Jest, lint e build |
| `--qa-logins` | Sessões de login apenas | Admin, Gestor e Colaborador autenticados e perfil validado |
| `--qa-verificar` | Sessões de login apenas | 5 pré-voos anteriores + gate de autenticação |
| `--qa-executar` | Sim, fixtures QA | Quatro jornadas reais Chromium, após `--full` e gate 3/3 |
| `RECRIAR-DEV.sh --executar` | **Destrutiva:** apaga volumes | 23 migrations, três contas DEV recriadas, sem backup |

## Limites e pendências para TEC08-04/05

1. O gate automatizado login/ACL e a reconstrução de volumes foram **testados estaticamente e com mocks**, não executados em PostgreSQL/SuperTokens reais neste ambiente. A validação operacional caberá ao desenvolvedor no Linux Mint.
2. As quatro jornadas reais podem conter seletores e expectativas de status desatualizados além das aqui identificadas. Elas precisam rodar por completo para revelar os próximos defeitos, sem confundir erros de autenticação com falhas de domínio.
3. `RESET-CONTRATOS-TESTE.sh` é uma rotina **legada, seletiva, com backups**, restrita à branch antiga; não é a opção de reset total sem backup solicitada. Mantida como registro histórico.
4. `qa/tec08-pre04-diagnostico` e documentos antigos citam migrações e commits de sua época. Devem permanecer para rastreabilidade, mas não são certificados de conformidade da `develop` atual.
5. O manifesto SHA-256 de 173 arquivos é um **baseline imutável do snapshot**, não mede cobertura de testes de integração. Para alterações futuras dos arquivos listados, regenerar hashes de forma controlada e repetir os gates; não remover o controle.
6. A senha da fixture foi declarada descartável pelo responsável pelo ambiente. A configuração versionada pode ser pública para esse DEV, mas não deve ser copiada para produção ou outras contas.

**Verificação local realizada nesta auditoria:** testes Python de todas as 9 famílias, aprovados após corrigir a expectativa histórica de navegação; parsing de Python/Bash; integridade SHA-256 do manifesto com 173 entradas. Não foram executadas migrations, resets, alterações de contas, Next/Nest/Jest via Docker ou QA Chromium reais neste container.
