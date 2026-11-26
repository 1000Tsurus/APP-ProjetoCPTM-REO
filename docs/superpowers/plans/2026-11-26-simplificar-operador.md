# App simples para o operador — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o fluxo "abrir dormente → formulário" por lotes (escolhe a tarefa uma vez, lê vários), com cadastro automático de tag nova, desfazer, busca manual e faixa de status de leitor e sync.

**Architecture:** A lógica fica em módulos puros de `data/` com dependências injetadas (testáveis no `node --test`); as telas só ligam esses módulos. A fila do PR #1 ganha dois tipos (`register`, `resolve`) e uma espera de 5 s (`hold_until`); o sync processa cadastros por `POST /dormentes` antes do `replicar`. A entrada de tag passa por uma interface `TagReader` para o leitor Bluetooth entrar na próxima tarefa sem mexer nas telas.

**Tech Stack:** Expo SDK 58, expo-router, React Native 0.88, TypeScript, AsyncStorage, `node --test` com `tests/helpers/load.cjs`.

**Spec:** `docs/superpowers/specs/2026-11-26-simplificar-operador-design.md`

## Global Constraints

- Sem dependências novas. Vibração com `Vibration` do `react-native`.
- Ler https://docs.expo.dev/versions/v58.0.0/ antes de usar API do Expo (AGENTS.md).
- Nenhuma rota nova na API; só as listadas em "Regras da API que moldam o desenho" do spec.
- Identificadores em inglês; textos de tela, comentários e docstrings em português.
- Visual com `constants/theme.ts` (`COLOR`, `SPACE`, `FONT_SIZE`, `MIN_TOUCH` 48) e `components/ui`.
- Espera do desfazer: `HOLD_MS = 5000`. Busca manual: mínimo 4 caracteres, até 10 sugestões.
- Commits Conventional em PT (`feat(lote): ...`), sem `Co-Authored-By` nem menção a ferramentas de IA.
- Ao fim de cada tarefa: `npm test` e `npm run typecheck` limpos.

## Review Focus

1. Duas leituras rápidas de tags diferentes enquanto a primeira ainda consulta a API — as duas devem ser registradas, na ordem; a mesma tag em voo não pode virar dois itens (Task 5).
2. Desfazer depois que a espera venceu e o item já foi enviado — deve responder "não dá mais para desfazer", nunca fingir que desfez (Tasks 1 e 5).
3. App fechado com itens em espera — ao reabrir, `hold_until` no passado não pode segurar o envio para sempre (Task 1).
4. Leitura pendente cujo cadastro a API recusa (local desativado, 422) — vira rejeitado com motivo, sem repetir a tentativa a cada sync (Task 2).
5. Dado do cache desatualizado — não pode bloquear nem pular uma leitura; só dado fresco da API bloqueia (Task 3).

---

### Task 1: Fila com cadastro, leitura pendente e espera do desfazer

**Files:**
- Modify: `data/outbox.ts`
- Modify: `data/api/types.ts` (tipo `ResolvePayload`)
- Test: `tests/outbox-hold.test.cjs`

**Interfaces:**
- Produces:
  - `type OutboxType = 'movement' | 'inspection' | 'occurrence' | 'register' | 'resolve'`
  - `type ResolvePayload = { rfid_tag: string; to_location_id: string; location_name: string; occurred_at: string; client_uuid: string }` (em `types.ts`)
  - `OutboxItem.payload` passa a aceitar também `SleeperCreate | ResolvePayload`; novo campo opcional `hold_until?: string` (ISO).
  - `enqueue(userId, item, opts?: { holdMs?: number; now?: Date }): Promise<void>` — com `holdMs`, grava `hold_until = now + holdMs`.
  - `isHeld(item: OutboxItem, now: Date): boolean`
  - `undo(userId: string, clientUuid: string, now?: Date): Promise<boolean>` — remove só item `pending` ainda em espera; devolve se removeu.
  - `releaseHolds(userId: string, clientUuids: string[]): Promise<void>` — apaga `hold_until` desses itens.

- [ ] **Step 1: Testes que falham** em `tests/outbox-hold.test.cjs` (carregar `data/outbox.ts` como em `tests/outbox-sync.test.cjs`):
  - `enqueue com holdMs grava hold_until`: `now = new Date('2026-11-26T10:00:00Z')`, `holdMs: 5000` → `hold_until === '2026-11-26T10:00:05.000Z'`.
  - `isHeld respeita o prazo`: verdadeiro em `10:00:04Z`, falso em `10:00:05Z` e para item sem `hold_until`.
  - `hold no passado não segura (app reaberto)`: item com `hold_until` de ontem → `isHeld(item, new Date()) === false`.
  - `undo remove item em espera`: devolve `true` e a fila fica vazia.
  - `undo depois do prazo não remove`: `now` em `10:00:06Z` → `false`, item continua.
  - `undo não remove rejeitado`.
  - `releaseHolds tira a espera só dos itens indicados`.
- [ ] **Step 2:** `node --test tests/outbox-hold.test.cjs` → FAIL (`isHeld is not a function`).
- [ ] **Step 3:** Implementar no `data/outbox.ts` usando `mutateOutbox` (mantém a serialização existente). `pendingCount` continua contando itens em espera.
- [ ] **Step 4:** `npm test` → PASS (inclui os testes antigos da fila).
- [ ] **Step 5:** Commit `feat(fila): cadastro, leitura pendente e espera para desfazer`.

### Task 2: Sync envia cadastros e resolve leituras pendentes antes do replicar

**Files:**
- Create: `data/sync-register.ts`
- Create: `data/incomplete.ts`
- Modify: `data/sync.ts`
- Test: `tests/sync-register.test.cjs`, `tests/incomplete.test.cjs`

**Interfaces:**
- Consumes: Task 1 (`isHeld`, tipos `register`/`resolve`, `ResolvePayload`); `createSleeper`, `getSleeperByTag` de `data/api/endpoints.ts`; `buildMovement` de `data/forms.ts`.
- Produces:
  - `data/incomplete.ts`: `type IncompleteEntry = { tag: string; sleeper_id: string; created_at: string }`; `addIncomplete(userId, entry)`, `listIncomplete(userId): Promise<IncompleteEntry[]>`, `removeIncomplete(userId, tag)`. Chave `reo.incomplete.<userId>`; sem duplicar a mesma tag.
  - `data/sync-register.ts`: `sendRegistrations(userId: string, now: Date): Promise<{ registered: number; converted: number; rejected: number } | 'offline'>`.
  - `SyncSummary` ganha `registered: number`.
  - `lastSyncAt(userId: string): Promise<string | null>` em `data/sync.ts` (chave `reo.sync.last.<userId>`), gravado quando `syncNow` termina sem `'offline'` e sem exceção.

Regras de `sendRegistrations`, em ordem de `created_at`, só itens `pending` não em espera:
- `register`: `createSleeper(payload)` → remove o item e `addIncomplete`. 409 `rfid_tag_taken` → trata como `resolve` com o mesmo `client_uuid`.
- `resolve`: `getSleeperByTag` →
  - existe, fora do pátio → troca o item (mesmo `client_uuid`) por `movement` `entry` montado com `buildMovement`;
  - existe, em outro local → `movement` `transfer`;
  - existe, no mesmo local → marca `rejected`, `code: 'same_location'`, `reason: 'Dormente já estava neste local.'`;
  - 404 → `createSleeper({ rfid_tag, location_id: to_location_id, occurred_at, client_uuid })` → remove e `addIncomplete`.
- `NetworkError` → para e devolve `'offline'`. Outro `ApiError` → marca `rejected` com `code` e `detail` da API (não tenta de novo).
- `syncNow` chama `sendRegistrations` antes da primeira rodada; `runPass` passa a ignorar itens em espera e os tipos `register`/`resolve`.

- [ ] **Step 1: Testes que falham** (`tests/sync-register.test.cjs`, servidor falso como em `outbox-sync.test.cjs`):
  - `register cria o dormente e sai da fila` → 1 `POST /dormentes`, fila vazia, `listIncomplete` com a tag.
  - `register com 409 vira movimentação` → item passa a `movement` com o mesmo `client_uuid`.
  - `resolve de tag existente fora do pátio vira entrada`; `... em outro local vira transferência`; `... no mesmo local fica rejeitado com same_location`.
  - `resolve de tag desconhecida cadastra`.
  - `cadastro recusado (422) fica rejeitado e não é reenviado` → segundo `syncNow` não chama `POST /dormentes`.
  - `sem rede no cadastro devolve offline e mantém o item`.
  - `item em espera não é enviado` (nem cadastro nem replicar).
  - `cadastro roda antes do replicar` → ordem das chamadas: `POST /dormentes` antes de `POST /sincronizacao/replicar`.
  - `lastSyncAt grava após sync bem-sucedida e não grava quando offline`.
  - `tests/incomplete.test.cjs`: adicionar duas vezes a mesma tag deixa uma; `removeIncomplete` tira.
- [ ] **Step 2:** `node --test tests/sync-register.test.cjs tests/incomplete.test.cjs` → FAIL.
- [ ] **Step 3:** Implementar `data/incomplete.ts`, `data/sync-register.ts` e ajustar `data/sync.ts` (manter `sync.ts` abaixo de ~200 linhas; a lógica nova fica em `sync-register.ts`).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(sync): cadastro pela fila e leitura pendente resolvida no envio`.

### Task 3: Regra leitura → registro e frases de ocorrência

**Files:**
- Create: `data/batch.ts`
- Create: `data/occurrence-phrases.ts`
- Test: `tests/batch.test.cjs`

**Interfaces:**
- Consumes: `LookupResult` de `data/catalog-cache.ts`; `buildMovement`, `buildOccurrence` de `data/forms.ts`; `NewOutboxItem` (Task 1).
- Produces:
  - `type BatchTask = { kind: 'receive' | 'transfer'; locationId: string; locationName: string } | { kind: 'withdraw'; requisitionNumber: string } | { kind: 'occurrence'; occurrenceKind: OccurrenceKind; description: string }`
  - `type ReadTone = 'ok' | 'new' | 'pending' | 'warn' | 'error'`
  - `type ReadDecision = { outcome: 'record'; item: NewOutboxItem; tone: 'ok' | 'new' | 'pending'; message: string } | { outcome: 'skip'; tone: 'warn'; message: string } | { outcome: 'block'; tone: 'error'; message: string }`
  - `decideRead(task: BatchTask, tag: string, lookup: LookupResult, ctx: { clientUuid: string; now: Date }): ReadDecision`
  - `OCCURRENCE_PHRASES: Record<OccurrenceKind, string[]>` com os valores do spec (`TODO(decidir)` no comentário); `composeDescription(phrase: string | null, free: string): string` (junta com `' — '`, sem partes vazias); `validateDescription(text: string): string | null` (erro se < 3 ou > 2000).

Tabela (ver spec): "fresco" = `lookup.sleeper && !lookup.fromCache`.

| Tarefa | encontrado | `notFound` | `offlineUnknown` |
|---|---|---|---|
| receive/transfer | `discarded` e fresco → block "Dormente descartado não movimenta."; mesmo local e fresco → skip "Já está em {local}."; sem local → `entry`; outro local → `transfer` (tone `ok`) | `register` (tone `new`, "Dormente novo cadastrado") | `resolve` (tone `pending`, "Tag fora do cache — confere no envio") |
| withdraw | fresco e `status !== 'in_stock'` → block ("Dormente em quarentena não pode ir para a via." para `quarantine`; senão "Só dormente em estoque pode ser retirado."); senão `withdrawal` | block "Tag não cadastrada." | `withdrawal` (tone `pending`) |
| occurrence | ocorrência pela tag (tone `ok`) | block "Tag não cadastrada." | ocorrência pela tag (tone `pending`) |

- [ ] **Step 1: Testes que falham** em `tests/batch.test.cjs`, um por célula da tabela, com as mensagens exatas acima; mais:
  - `dado do cache no mesmo local registra transferência` (não pula);
  - `dado do cache fora de estoque registra retirada` (não bloqueia);
  - `register leva tag, location_id, occurred_at e client_uuid`;
  - `composeDescription('Rachadura', ' lado norte ') === 'Rachadura — lado norte'`; `composeDescription(null, 'ab')` e `validateDescription` → erro de mínimo.
- [ ] **Step 2:** `node --test tests/batch.test.cjs` → FAIL.
- [ ] **Step 3:** Implementar `decideRead` reaproveitando `buildMovement`/`buildOccurrence` para os payloads e resumos.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(lote): regra de leitura para registro e frases de ocorrência`.

### Task 4: Leitor, textos de status e busca manual

**Files:**
- Create: `data/reader/types.ts`, `data/reader/keyboard.ts`
- Create: `data/status-text.ts`
- Create: `data/manual-search.ts`
- Modify: `data/catalog-cache.ts` (`searchCachedSleepers`)
- Modify: `data/use-sync.ts` (expor `lastOkAt`)
- Test: `tests/status-text.test.cjs`, `tests/manual-search.test.cjs`, `tests/reader.test.cjs`

**Interfaces:**
- Produces:
  - `data/reader/types.ts`: `ReaderStatus` e `TagReader` exatamente como no spec.
  - `createKeyboardReader(): TagReader & { push(raw: string): void }` — `status()` é `'none'`; `push` normaliza com `normalizeTag`, ignora texto inválido (`isValidTag`) e avisa os inscritos.
  - `syncStatusText(s: { pending: number; rejected: number; offline: boolean; syncing: boolean; lastOkAt: string | null; now: Date }): { text: string; tone: 'ok' | 'warn' | 'error' }`
  - `readerStatusText(s: ReaderStatus): string` — `connected` → `'● Conectado'`, `disconnected` → `'○ Desconectado'`, `connecting` → `'Conectando…'`, `none` → `'Teclado'`.
  - `searchCachedSleepers(q: string, limit = 10): Promise<SleeperRead[]>` — contém (sem caixa) na tag ou na `registration_record`.
  - `searchSleepers(q: string): Promise<{ items: SleeperRead[]; offline: boolean }>` — `q.trim().length < 4` → `{ items: [], offline: false }` sem chamar a API; online `listSleepers({ q, limit: 10 })`; `NetworkError` → cache.
  - `useSync()` passa a devolver também `lastOkAt: string | null` (de `lastSyncAt`, recarregado após cada sync).

Textos de `syncStatusText` (hora local `HH:MM`, 2 dígitos), na ordem de prioridade:
1. `rejected > 0` → `'1 rejeitado'` / `'N rejeitados'`, mais `' · N pendente(s)'` se houver; tone `error`.
2. `offline` → `'Sem conexão · N pendentes'` (ou `'Sem conexão'` sem pendentes); tone `warn`.
3. `syncing` → `'Enviando…'`; tone `ok`.
4. `pending > 0` → `'N pendentes · enviado HH:MM'` (ou `'· nunca enviado'`); singular `'1 pendente'`; tone `warn`.
5. senão → `'Tudo enviado · HH:MM'` (ou `'Tudo enviado'`); tone `ok`.

- [ ] **Step 1: Testes que falham:** um teste por linha da lista acima (incluindo singular/plural); `readerStatusText` para os 4 estados; teclado: `push(' e280ab\n')` emite `'E280AB'` e `push('a b')` não emite; busca: 3 caracteres não chama a API, offline usa o cache e casa pela ata.
- [ ] **Step 2:** `node --test tests/status-text.test.cjs tests/manual-search.test.cjs tests/reader.test.cjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(app): leitor por interface, textos de status e busca manual`.

### Task 5: Sessão de lote (orquestração)

**Files:**
- Create: `data/batch-session.ts`
- Test: `tests/batch-session.test.cjs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `type BatchRead = { tag: string; clientUuid: string | null; tone: ReadTone; message: string; at: string; undone: boolean }`
  - `createBatchSession(deps: { userId: string; task: BatchTask; lookup: (tag: string) => Promise<LookupResult>; enqueue: typeof enqueue; undo: typeof undo; releaseHolds: typeof releaseHolds; sync: () => Promise<unknown>; uuid: () => string; now: () => Date; schedule: (fn: () => void, ms: number) => () => void; holdMs?: number }): BatchSession`
  - `BatchSession = { read(raw: string): Promise<BatchRead>; undo(clientUuid: string): Promise<boolean>; finish(): Promise<void>; reads(): BatchRead[]; subscribe(fn: () => void): () => void }`
  - `batchCounts(reads: BatchRead[], outbox: OutboxItem[]): { read: number; sent: number; queued: number; rejected: number }` — `read` = leituras registradas e não desfeitas; `sent` = dessas, as que não estão mais na fila; `rejected` = as que estão na fila como rejeitadas; `queued` = o resto.

Comportamento:
- `read` normaliza; tag já lida (registrada ou em voo) e não desfeita → `{ tone: 'warn', message: 'Já lido neste lote.' }`, sem `lookup` nem `enqueue`.
- Leituras são processadas em fila (uma de cada vez, na ordem de chegada), para duas leituras rápidas não se atropelarem.
- `record` → `enqueue(..., { holdMs })` e `schedule(sync, holdMs + 100)`.
- `undo` → chama `undo` da fila; se `true`, marca `undone` e libera a tag para nova leitura; se `false`, devolve `false` (a tela diz "Já enviado, não dá para desfazer").
- `finish` → `releaseHolds` de todos os itens do lote e `sync()`.

- [ ] **Step 1: Testes que falham** (dependências falsas, relógio controlado):
  - `leitura repetida no lote é ignorada` (1 `enqueue`);
  - `duas leituras rápidas de tags diferentes registram as duas, em ordem` (o `lookup` da primeira resolve depois da segunda chegar);
  - `mesma tag lida duas vezes enquanto a primeira consulta gera um item só`;
  - `desfazer em espera remove e libera a tag para ler de novo`;
  - `desfazer depois do envio devolve false`;
  - `bloqueio e aviso não entram na fila`;
  - `finish libera as esperas e sincroniza`;
  - `batchCounts` com uma leitura enviada, uma na fila, uma rejeitada e uma desfeita → `{ read: 3, sent: 1, queued: 1, rejected: 1 }`.
- [ ] **Step 2:** `node --test tests/batch-session.test.cjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat(lote): sessão de leitura contínua com desfazer`.

### Task 6: Telas de lote e faixa de status

**Files:**
- Create: `contexts/ReaderContext.tsx` (fornece um `TagReader`; neste PR, `createKeyboardReader()`)
- Create: `components/StatusStrip.tsx`
- Create: `components/batch/BatchPrepare.tsx`, `components/batch/ReadCard.tsx`, `components/batch/BatchFooter.tsx`, `components/batch/TagSearchField.tsx`
- Create: `app/lote/[tarefa].tsx` (`tarefa` ∈ `receber | transferir | retirar | ocorrencia`)
- Modify: `app/_layout.tsx` (provider do leitor), `app/(tabs)/_layout.tsx` (faixa no topo da área logada)

**Interfaces:**
- Consumes: `syncStatusText`, `readerStatusText`, `useSync().lastOkAt` (Task 4); `createBatchSession`, `batchCounts` (Task 5); `OCCURRENCE_PHRASES`, `composeDescription`, `validateDescription` (Task 3); `searchSleepers` (Task 4); `getLocations` de `catalog-cache`.
- Produces: rota `/lote/[tarefa]`; `useReader(): TagReader`; `<StatusStrip />`.

Detalhes que o spec fixa:
- Preparar: locais ativos com os 3 últimos usados no topo (guardados em `reo.recent_locations.<userId>`); RM obrigatória (≤40); ocorrência: tipo, frase (chips) e texto livre, validado por `validateDescription`.
- Leitura: título da tarefa e "Concluir" no topo; último cartão grande (verde `ok`, amarelo `new`/`warn`, cinza-azulado `pending`, vermelho `error`) com "Desfazer" por 5 s em `ok`/`new`/`pending`; lista dos lidos; rodapé `"{read} lidos · {sent} enviados · {queued} na fila"` mais `" · {rejected} rejeitados"` se houver.
- Vibração: `ok`/`new`/`pending` → `Vibration.vibrate(60)`; `warn` → `[0, 60, 80, 60]`; `error` → `400`.
- `TagSearchField`: sugestões a partir de 4 caracteres; tocar na sugestão chama `session.read(tag)`; Enter chama `session.read(texto)`; volta o foco depois de cada leitura; `autoCapitalize="characters"`, `autoCorrect={false}`.
- `StatusStrip`: leitor à esquerda (toque → `reader.reconnect()`), sync à direita (toque → `/fila`), cor pelo `tone`. Remover os banners "Sem conexão" das telas que ficam.
- `supervisor` não abre `/lote/*` (redireciona ao Início).
- Sair da tela do lote (voltar ou desmontar) chama `session.finish()`, como "Concluir".

- [ ] **Step 1:** Implementar contexto, componentes e a rota.
- [ ] **Step 2:** `npm run typecheck` e `npm test` → limpos.
- [ ] **Step 3:** Commit `feat(lote): telas de lote e faixa de status`.

### Task 7: Navegação, Consultar, ficha e plaqueta

**Files:**
- Modify: `app/(tabs)/(pages)/_layout.tsx` (abas `index`, `consultar`, `perfil`)
- Modify: `app/(tabs)/(pages)/index.tsx` (4 botões de lote; aviso para supervisor)
- Create: `app/(tabs)/(pages)/consultar.tsx` (`TagSearchField` → `/dormente/[tag]`; "Cadastros sem plaqueta (N)" com `listIncomplete`)
- Modify: `app/dormente/[tag].tsx` (ações no topo: Completar plaqueta, Ocorrência, Inspecionar se `canInspect`)
- Create: `app/plaqueta/[tag].tsx`, `components/SleeperPlateForm.tsx` (campos extraídos de `app/cadastrar-dormente.tsx`)
- Modify: `data/api/types.ts` (`SleeperUpdate`), `data/api/endpoints.ts` (`updateSleeper`), `data/sleeper-form.ts` (`buildPlateUpdate`), `data/auth-store.ts` (`canEditSpecies`)
- Modify: `app/(tabs)/(pages)/perfil.tsx` (seção "Leitor" com `readerStatusText`; escolha do aparelho fica para a tarefa do Bluetooth)
- Delete: `app/(tabs)/(pages)/dormentes.tsx`, `app/movimentar/[tag].tsx`, `app/cadastrar-dormente.tsx`, `app/ocorrencia/index.tsx`
- Test: `tests/sleeper-form.test.cjs`, `tests/auth-store.test.cjs`

**Interfaces:**
- Consumes: `listIncomplete`, `removeIncomplete` (Task 2); `TagSearchField` (Task 6).
- Produces:
  - `type SleeperUpdate = { registration_record?: string | null; wood_class?: string | null; length_m?: number | null; treatment?: string | null; supplier?: string | null; inspection_company?: string | null; manufacture_year?: number | null; species_id?: string | null }`
  - `updateSleeper(id: string, body: SleeperUpdate): Promise<SleeperRead>` — `PATCH /dormentes/{id}`.
  - `buildPlateUpdate(form: Record<'registration_record' | 'wood_class' | 'length_m' | 'treatment' | 'supplier' | 'inspection_company' | 'manufacture_year' | 'species_id', string>, canEditSpecies: boolean): { payload: SleeperUpdate } | { error: string; field: SleeperFormField }` — omite vazios, usa `parseLength`/`parseYear`, nunca envia `species_id` sem permissão.
  - `canEditSpecies(role: Role): boolean` — `especialista` e `admin`.

- [ ] **Step 1: Testes que falham:** `buildPlateUpdate omite campos vazios`; `... converte comprimento com vírgula`; `... não envia espécie sem permissão`; `... devolve erro e campo do ano inválido`; `canEditSpecies` para os 5 papéis.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar dados e telas; salvar a plaqueta chama `removeIncomplete`; sem rede mostra "A plaqueta precisa de conexão." e mantém o formulário.
- [ ] **Step 4:** `npm test` e `npm run typecheck` → limpos; `grep -rn "movimentar\|cadastrar-dormente\|/dormentes'" app components` sem referências mortas.
- [ ] **Step 5:** Commit `feat(app): navegação Início/Consultar/Perfil e plaqueta depois do cadastro`.

### Task 8: Integração, emulador e documentação

**Files:**
- Modify: `tests/integration/api.integration.cjs`
- Modify: `docs/integracao-api.md` (lotes, fila `register`/`resolve`, desfazer, leitor)

- [ ] **Step 1:** Cenários novos contra a API local (padrão do arquivo, código real de `data/`):
  - `lote de transferência registra todos`;
  - `tag nova offline vira cadastro no sync e não duplica no reenvio`;
  - `desfazer em espera não chega à API`;
  - `resolve de tag existente vira transferência`.
- [ ] **Step 2:** `npm run test:api` com a API local (`docker compose up -d db`, `uv run uvicorn app.main:app --port 4000` no repo da API) → PASS.
- [ ] **Step 3:** Emulador (Pixel 6, Expo Go): Receber com tag nova; Transferir 3 dormentes pela rota manual; Desfazer; modo avião durante um lote e sync ao voltar; Ocorrência com frase; plaqueta completada. Prints em `scratchpad`, sem senha/token na tela.
- [ ] **Step 4:** `npm test`, `npm run typecheck`, `npx expo export --platform android` → limpos.
- [ ] **Step 5:** Commit `docs(app): lotes, cadastro pela fila e leitor`.
