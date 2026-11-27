# Integração do app com a API REO — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app deixa o modelo de lotes/QR/NFC/fotos local e passa a operar sobre a API REO (login, dormente por tag RFID, movimentação, inspeção, ocorrência, fila offline), com o visual do site gerencial.

**Architecture:** Camada `data/` nova e testável em Node (cliente HTTP com refresh, sessão persistida, fila offline em AsyncStorage enviada por `/sincronizacao/replicar`, cache de catálogos). Telas expo-router reescritas sobre componentes `components/ui/` que copiam o visual de `src/ui.jsx` do site. Nada de dependência nova.

**Tech Stack:** Expo SDK 58, expo-router, React Native 0.88, TypeScript 6, AsyncStorage, expo-secure-store, @expo/vector-icons (Ionicons), `node --test` com transpilação TS.

**Spec:** `docs/superpowers/specs/2026-11-25-integracao-api-design.md` (ler inteiro antes de começar).

## Global Constraints

- Ler https://docs.expo.dev/versions/v58.0.0/ antes de escrever código Expo (AGENTS.md).
- **Sem dependências novas** no `package.json`.
- URL da API: `EXPO_PUBLIC_API_URL`, padrão `https://reo-api.ambitiousbeach-eac3bf23.brazilsouth.azurecontainerapps.io`; `http://` só aceito quando `__DEV__`.
- Paths, campos e enums exatamente como a API; datas em UTC ISO 8601; listagens `{items, total, limit, offset}`, `limit` ≤ 200.
- Erro da API: `{detail, code}` (422 com `errors[]`); a tela mostra `detail`.
- Papéis de campo: `operador`, `tecnico`, `especialista`, `admin`. Inspeção: `tecnico`, `especialista`, `admin`. `supervisor`: só consulta.
- `client_uuid` sempre UUID v4 válido (gerador próprio, `data/uuid.ts`).
- Senha nunca persistida nem logada; refresh token + `UserRead` no SecureStore; access token só em memória.
- Movimentação, inspeção e ocorrência **sempre** passam pela fila (gravar → tentar sync). Cadastro de dormente é online direto.
- Rejeitado na fila só pode ser descartado.
- Visual: só cores de `constants/theme.ts` (cópia de `COLOR` do site); cantos 4/6; alvos de toque ≥ 48; fonte base 16; códigos (tag, matrícula, RM, ata) em `FONT_CODE`; tema só claro.
- Textos de interface, comentários e mensagens de commit em português; identificadores em inglês (padrão atual do app).
- Conventional Commits em PT; sem `Co-Authored-By` ou menção a IA.
- Verificação por tarefa: `npm test` e `npm run typecheck` passando.

## Review Focus

1. **Tag vinda do leitor em modo teclado** chega com espaço, minúsculas ou `\n`/`\r` no fim → o app normaliza (`trim().toUpperCase()`) antes de buscar, navegar ou enfileirar (teste na Task 2).
2. **App fechado entre gravar na fila e sincronizar** → o item continua na fila ao reabrir (teste na Task 5).
3. **Sync que falha no meio** (rede cai, 500, resposta inválida) → nenhum item sai da fila (teste na Task 5).
4. **Toque duplo em "Salvar"** → um item só (a tela gera o `client_uuid` uma vez; `enqueue` com `client_uuid` repetido não duplica — teste na Task 5).
5. **Refresh token vencido com o aparelho offline** → pede login, mas a fila do usuário continua no aparelho (teste na Task 4).

---

### Task 1: Tema, rótulos e componentes visuais do site

**Files:**
- Create: `constants/theme.ts`, `data/labels.ts`, `components/ui/{Panel,Label,Field,PasswordInput,Button,Badge,SectionTitle,EmptyState,SignalDot,Banner,BrandHeader}.tsx`, `components/ui/index.ts` (só reexporta)
- Create: `assets/images/logo-cptm.png`, `assets/images/simbolo-cptm.png` (copiar de `../frontend-reo.github.io/src/assets/`)
- Create: `tests/helpers/load.cjs` (extrair `load()` e `memory()` de `tests/operational-flows.test.cjs`, sem mudança)
- Modify: `app.json` (`userInterfaceStyle: "light"`)
- Delete: `constants/Colors.ts` só na Task 10 (ainda há uso)
- Test: `tests/labels.test.cjs`

**Interfaces:**
- Produces: `COLOR` (mesmas chaves e valores de `COLOR` em `src/ui.jsx` do site), `RADIUS = { field: 4, panel: 6 }`, `SPACE`, `FONT_SIZE = { base: 16, small: 14, caption: 12.5 }`, `FONT_CODE = 'monospace'`, `MIN_TOUCH = 48`.
- Produces: `type Tone = 'ok'|'info'|'warn'|'danger'|'neutro'`; `labels.ts`: `SLEEPER_STATUS: Record<SleeperStatus,{label:string; tone:Tone}>`, `MOVEMENT_KIND`, `OCCURRENCE_KIND`, `INSPECTION_RESULT` (com tom), `CONSERVATION`, `MOISTURE`, `ROLE_LABEL`, `label(map, value): string` (valor desconhecido volta cru). Textos e tons idênticos a `src/rotulos.js` do site.
- Produces: componentes com props: `Panel({accent?, style?, children})`, `Button({title, onPress, variant?: 'primary'|'ghost'|'subtle', small?, disabled?, icon?})`, `Badge({text, tone})`, `Field({label, value, onChangeText, mono?, ...TextInputProps})`, `PasswordInput(TextInputProps)`, `SectionTitle({icon: IoniconName, title, sub?})`, `EmptyState({text})`, `SignalDot({status:'ok'|'warn'|'error'})`, `Banner({tone:'warn'|'info', text, action?: {title, onPress}})`, `BrandHeader({onDark?})`.
- Enums de domínio (`SleeperStatus` etc.) vêm de `data/api/types.ts` (Task 3); nesta task, declarar os tipos string-literal lá já (só os enums), para `labels.ts` compilar.

- [ ] **Step 1: Teste dos rótulos**
`tests/labels.test.cjs`: `label(SLEEPER_STATUS,'quarantine')` → `{label:'Quarentena', tone:'warn'}`; `CONSERVATION.fair === 'Regular'`; `MOISTURE.wet === 'Molhado'`; `OCCURRENCE_KIND.misplaced === 'Fora do lugar'`; `label(MOVEMENT_KIND,'xyz') === 'xyz'`.
- [ ] **Step 2:** `npm test` → falha (módulo não existe).
- [ ] **Step 3:** Implementar `constants/theme.ts`, `data/api/types.ts` (só enums por ora), `data/labels.ts`; componentes `components/ui/*` reproduzindo `Panel`/`Btn`/`Selo`/`Field`/`InputSenha`/`SectionTitle`/`EmptyState`/`SignalDot`/`FaixaDemo`/`MarcaSistema` do site em RN, com altura mínima `MIN_TOUCH` em botão e campo e borda do campo em `COLOR.red` no foco. Copiar os dois PNGs.
- [ ] **Step 4:** `npm test` e `npm run typecheck` → passam.
- [ ] **Step 5:** Commit `feat(visual): tema, rótulos e componentes no padrão do site`.

### Task 2: UUID, configuração e tag

**Files:**
- Create: `data/uuid.ts`, `data/config.ts`, `data/tag.ts`
- Test: `tests/basics.test.cjs`

**Interfaces:**
- Produces: `uuidv4(): string`; `apiBaseUrl(env: string|undefined, dev: boolean): string` (lança se `http://` com `dev=false`; remove `/` final; padrão = URL da Azure) e `API_URL` (avaliado com `process.env.EXPO_PUBLIC_API_URL` e `__DEV__`); `normalizeTag(raw: string): string` (= `trim().toUpperCase()`, igual à API); `isValidTag(tag): boolean` (1–64 chars, sem espaço interno).

- [ ] **Step 1: Testes**
`uuidv4()` casa `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/` com e sem `crypto` no contexto, e 1000 chamadas não repetem. `apiBaseUrl(undefined,false)` = URL da Azure; `apiBaseUrl('http://192.168.0.10:4000/',true)` = `'http://192.168.0.10:4000'`; `apiBaseUrl('http://x',false)` lança. `normalizeTag(' e2801160600002084e5a1b21\r\n')` = `'E2801160600002084E5A1B21'`; `isValidTag('AB CD')` false; `isValidTag('A'.repeat(65))` false.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar. `uuidv4` usa `crypto.getRandomValues` se existir, senão `Math.random`, com os bits de versão/variante.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(api): uuid v4, URL da API e normalização de tag`.

### Task 3: Cliente HTTP e tipos da API

**Files:**
- Create: `data/api/client.ts`; complete `data/api/types.ts`
- Test: `tests/client.test.cjs`

**Interfaces:**
- Consumes: `API_URL` (Task 2).
- Produces tipos (espelho exato dos schemas da API, ver spec "Contrato usado"): `Role`, `UserRead`, `TokenResponse`, `Page<T>`, `SpeciesRead`, `LocationRead`, `SleeperRead`, `SleeperCreate`, `HistoryEntry`, `SleeperHistory`, `MovementCreate`, `InspectionCreate`, `OccurrenceCreate`, `SyncItemResult`, `SyncBatchRead`, `SyncStatusRead`, `ApiErrorBody = {detail:string; code:string; errors?:{loc:(string|number)[]; msg:string}[]}`.
- Produces: `class ApiError extends Error {status:number; code:string; detail:string; errors?}`, `class NetworkError extends Error`; `configureClient(hooks: {getAccessToken(): string|null; refresh(): Promise<boolean>; onSessionExpired(): void})`; `request<T>(method: 'GET'|'POST'|'PATCH', path: string, body?: unknown, opts?: {auth?: boolean /* padrão true */; retryOn401?: boolean}): Promise<T>`; `requestWithStatus<T>(...)`: `{status, data}` (usado no POST /dormentes que pode dar 200 ou 201); `errorMessage(e: unknown): string` (403 → "Seu papel não permite esta ação.", `NetworkError` → "Sem conexão com o servidor.", `ApiError` → `detail`, outro → "Erro inesperado."). Toda tela mostra erros por `errorMessage`.

- [ ] **Step 1: Testes** (fetch falso injetado)
- 401 → chama `refresh()` uma vez, repete com o token novo e devolve o dado; segundo 401 → `onSessionExpired()` chamado e `ApiError` status 401.
- 409 `{detail:'Tag RFID já cadastrada.', code:'rfid_tag_taken'}` → `ApiError` com esse `code`/`detail`.
- `fetch` rejeita (TypeError) ou estoura 15 s (AbortController) → `NetworkError`.
- `auth:false` não manda `Authorization`; com token manda `Bearer <t>`.
- `errorMessage` de `ApiError` 403 → "Seu papel não permite esta ação."; de `NetworkError` → "Sem conexão com o servidor.".
- Corpo de erro não-JSON (502 do proxy) → `ApiError` com `code:'http_502'` e `detail` genérico em PT.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar `request`; timeout 15 000 ms; `Content-Type: application/json`.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(api): cliente HTTP com refresh e erros padronizados`.

### Task 4: Sessão (auth-store)

**Files:**
- Create: `data/auth-store.ts`
- Test: `tests/auth-store.test.cjs`

**Interfaces:**
- Consumes: `request`, `configureClient`, `ApiError`, `NetworkError`, `UserRead`, `TokenResponse`.
- Produces: `type SessionState = {status:'signed_out'} | {status:'online'|'offline'; user: UserRead}`; `login(login: string, password: string): Promise<SessionState>` (POST `/auth/login`, `auth:false`); `restore(): Promise<SessionState>`; `logout(): Promise<void>`; `currentUser(): UserRead|null`; `subscribe(fn: (s: SessionState)=>void): () => void`; `canFieldWork(role: Role): boolean`; `canInspect(role: Role): boolean`. Chave SecureStore: `reo.session` = JSON `{refresh_token, refresh_expires_at, user}`.

- [ ] **Step 1: Testes** (SecureStore em memória, request falso)
- `login` grava `reo.session` sem nenhum campo de senha (procurar a senha no JSON salvo → ausente).
- `restore` com refresh válido e rede ok → `online`; com `NetworkError` → `offline` com o `user` salvo; com `ApiError` 401 → `signed_out` e `reo.session` apagado.
- `restore` com `refresh_expires_at` no passado → `signed_out` sem chamar a rede; a chave de fila `reo.outbox.<user.id>` no AsyncStorage falso continua intacta.
- `logout` apaga `reo.session` e não toca em `reo.outbox.*`.
- `canFieldWork('supervisor')` false, `('admin')` true; `canInspect('operador')` false, `('tecnico')` true.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar; `refresh()` do `configureClient` usa POST `/auth/refresh` e regrava o SecureStore; `onSessionExpired` vira `signed_out`.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(auth): sessão com refresh persistido e modo offline`.

### Task 5: Fila offline e sincronização

**Files:**
- Create: `data/outbox.ts`, `data/sync.ts`
- Test: `tests/outbox-sync.test.cjs`

**Interfaces:**
- Consumes: `request`, `NetworkError`, `uuidv4`, `currentUser`, tipos `MovementCreate|InspectionCreate|OccurrenceCreate`, `SyncBatchRead`.
- Produces: `type OutboxType = 'movement'|'inspection'|'occurrence'`; `type OutboxItem = {type; client_uuid; payload; rfid_tag: string|null; summary: string; created_at; status:'pending'|'rejected'; code?; reason?}`; `enqueue(userId: string, item: Omit<OutboxItem,'status'|'created_at'>): Promise<void>` (no-op se `client_uuid` já existe); `listOutbox(userId): Promise<OutboxItem[]>`; `discard(userId, client_uuid): Promise<void>` (só `rejected`); `pendingCount(userId)`; `subscribeOutbox(fn)`.
- Produces: `syncNow(userId: string): Promise<{sent:number; accepted:number; rejected:number} | 'offline' | 'busy'>`; `deviceId(): Promise<string>` (UUID guardado em `reo.device_id`).
- Chave da fila: `reo.outbox.<userId>`. Corpo do sync: `{device_id, movements:[], inspections:[], occurrences:[]}`, cada payload com o `client_uuid`. Lotes de no máximo 1000.

- [ ] **Step 1: Testes** (AsyncStorage em memória, request falso)
- `enqueue` duas vezes com o mesmo `client_uuid` → `listOutbox` tem 1 item.
- Recarregar o módulo (novo `load()`) com o mesmo storage → o item continua lá.
- Filas de `u1` e `u2` separadas.
- `syncNow`: resposta com `accepted`, `duplicate` e `rejected {code:'sleeper_discarded', reason:'Dormente descartado não movimenta.'}` → os dois primeiros saem; o terceiro fica `rejected` com `code`/`reason`.
- `request` lança `NetworkError` → retorna `'offline'` e a fila fica igual; `ApiError` 500 → lança e a fila fica igual.
- Duas chamadas simultâneas → a segunda retorna `'busy'`, `request` chamado uma vez.
- 1500 pendentes → duas chamadas a `/sincronizacao/replicar` (1000 + 500).
- Itens `rejected` não são reenviados; `discard` remove só `rejected`.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar; fila serializada com promessa encadeada (como o `queue` do código atual); casar resultado por `client_uuid`.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(sync): fila offline idempotente enviada por /sincronizacao/replicar`.

### Task 6: Endpoints de leitura, cadastro e cache

**Files:**
- Create: `data/api/endpoints.ts`, `data/catalog-cache.ts`
- Test: `tests/catalog-cache.test.cjs`

**Interfaces:**
- Consumes: `request`, `requestWithStatus`, `NetworkError`, tipos.
- Produces (endpoints): `getMe()`, `listSleepers(p: {q?; status?; location_id?; limit?; offset?})`, `getSleeperByTag(tag)` (path com `encodeURIComponent`), `getSleeperHistory(id)`, `createSleeper(body: SleeperCreate)`, `listSpecies()`, `listLocations()` (ambos `limit=200`, só `active`), `getSyncStatus(deviceId)`.
- Produces (cache, AsyncStorage): `getSpecies(): Promise<{items; fetchedAt|null}>` e `getLocations()` (rede → grava e devolve; `NetworkError` → devolve o salvo); `refreshCatalogs()`; `lookupSleeper(tag): Promise<{sleeper: SleeperRead; fetchedAt: string; fromCache: boolean} | {notFound: true} | {offlineUnknown: true}>` (guarda até 200 dormentes, o mais antigo sai).

- [ ] **Step 1: Testes**
- `lookupSleeper` online grava no cache; depois `NetworkError` → `fromCache:true` com `fetchedAt`; tag nunca vista e offline → `{offlineUnknown:true}`; 404 → `{notFound:true}`.
- 201º dormente no cache tira o mais antigo.
- `getLocations` offline sem nada salvo → `items: []`, `fetchedAt: null`.
- `getSleeperByTag('A/B')` chama path `/dormentes/tag/A%2FB`.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Commit `feat(api): rotas de dormentes, catálogos e cache offline`.

### Task 7: Sessão na interface, login e abas

**Files:**
- Modify: `contexts/SessionContext.tsx` (reescrever sobre `auth-store`), `app/index.tsx` (login), `app/(tabs)/_layout.tsx`, `app/(tabs)/(pages)/_layout.tsx` (abas Início, Dormentes, Perfil), `components/navigation/BottomNavigation.tsx` (cores do tema)
- Create: `data/use-sync.ts` (hook: dispara `syncNow` ao montar, ao voltar para `active` no `AppState` e expõe `pending`, `rejected`, `lastResult`, `syncing`)
- Delete: `app/cadastro.tsx`, `app/(tabs)/editar-perfil.tsx`, `app/(tabs)/two.tsx`, `app/modal.tsx`

**Interfaces:**
- Consumes: `login`, `restore`, `logout`, `subscribe`, `syncNow`, `pendingCount`.
- Produces: `useSession(): {state: SessionState; user: UserRead|null; offline: boolean; signIn(login, password); signOut(): Promise<void>}`; `useSync()`.

- [ ] **Step 1:** Login (spec, tabela de telas): `BrandHeader` sobre bloco `COLOR.red`, `Panel` com `Field` "Matrícula ou e-mail" (mono) e `PasswordInput`, `Button` "Entrar"; erro `invalid_credentials`/`inactive_user` mostra o `detail`; "Primeiro acesso?" explica que o convite vem do administrador e é aceito pelo link do e-mail. Sem biometria e sem "manter conectado".
- [ ] **Step 2:** `SessionProvider` chama `restore()` na abertura (splash até resolver); `(tabs)/_layout` redireciona para `/login` quando `signed_out`.
- [ ] **Step 3:** `signOut` com `pendingCount > 0` mostra `Alert` "Há N registros não enviados. Eles ficam guardados neste aparelho até você entrar de novo." com Cancelar/Sair.
- [ ] **Step 4:** `npm run typecheck` e `npm test` → passam; `npx expo start --web` abre o login sem erro no console (só visual; a API não libera CORS para o app web).
- [ ] **Step 5:** Commit `feat(auth): login na API e sessão restaurada`.

### Task 8: Início, Dormentes e Perfil

**Files:**
- Modify: `app/(tabs)/(pages)/index.tsx`, `app/(tabs)/(pages)/perfil.tsx`
- Create: `app/(tabs)/(pages)/dormentes.tsx`; Delete: `app/(tabs)/(pages)/lotes.tsx`
- Delete: `components/operation/{OperationPanel,ManagerInbox,InspectionCard,ScanActions}.tsx`, `data/operational-summary.ts`

**Interfaces:**
- Consumes: `useSession`, `useSync`, `normalizeTag`, `isValidTag`, `listSleepers`, `getSyncStatus`, `Banner`, `Badge`, `SLEEPER_STATUS`.

- [ ] **Step 1:** Início: `Banner` âmbar "Sem conexão" quando offline e "N registros aguardando envio" (ação "Ver" → `/fila`); `Panel` "Ler tag" com `Field` mono `autoFocus`, `blurOnSubmit={false}`, `onSubmitEditing` → `router.push('/dormente/' + normalizeTag(v))` se `isValidTag`; último sync de `getSyncStatus`; botão "Registrar ocorrência sem dormente" → `/ocorrencia`.
- [ ] **Step 2:** Dormentes: busca `q` (debounce 300 ms), filtro de status (chips com `Badge`), lista paginada (`limit 50`, carregar mais), cada linha com tag (mono), espécie, local, `Badge` de status → abre `/dormente/[tag]`. Offline: `Banner` "Lista indisponível sem conexão".
- [ ] **Step 3:** Perfil: nome, matrícula (mono), `Badge` do papel (`ROLE_LABEL`), pendentes/rejeitados com link para `/fila`, `Button` "Sincronizar agora" (`syncNow`), `Button ghost` "Sair".
- [ ] **Step 4:** `npm run typecheck` e `npm test` → passam.
- [ ] **Step 5:** Commit `feat(telas): início com leitura de tag, lista de dormentes e perfil`.

### Task 9: Dormente e cadastro

**Files:**
- Create: `app/dormente/[tag].tsx`, `app/cadastrar-dormente.tsx`
- Delete: `app/dormente/[sleeperId].tsx`, `app/lote/[lotId].tsx`, `app/cadastrar-lote.tsx`, `app/ler-etiqueta.tsx`

**Interfaces:**
- Consumes: `lookupSleeper`, `getSleeperHistory`, `listOutbox`, `createSleeper`, `getSpecies`, `getLocations`, `canFieldWork`, `canInspect`, `uuidv4`.

- [ ] **Step 1:** Dormente: `lookupSleeper(tag)`. Encontrado → `Panel` com tag (mono), ata (mono), espécie, classe, comprimento, tratamento, fornecedor, ano, local, `Badge` de status; se `fromCache`, `Banner` "Dados de <data>". Acima: lista "Pendente de envio" = itens da fila com `rfid_tag === tag`. Histórico (`getSleeperHistory`, só online) em lista cronológica com ícone por tipo. Ações (`Button`): Movimentar e Ocorrência se `canFieldWork`; Inspecionar se `canInspect`; nenhuma ação se `status === 'discarded'`. `notFound` → "Tag não cadastrada" + `Button` "Cadastrar dormente" (desabilitado offline). `offlineUnknown` → `Banner` "Sem conexão — não foi possível confirmar esta tag" e as mesmas ações liberadas.
- [ ] **Step 2:** Cadastro: campos de `SleeperCreate` (tag pré-preenchida e mono, espécie e local de entrada por seletor dos catálogos, ata, classe, comprimento, tratamento, fornecedor, empresa inspetora, ano de fabricação); `client_uuid` gerado ao abrir a tela; 201/200 → `router.replace('/dormente/'+tag)`; 409 `rfid_tag_taken` → mensagem e link para o dormente; 422 → `detail` + campo de `errors[0].loc`; `NetworkError` → "Cadastro exige conexão".
- [ ] **Step 3:** `npm run typecheck` e `npm test` → passam.
- [ ] **Step 4:** Commit `feat(dormentes): tela do dormente por tag e cadastro`.

### Task 10: Movimentar, inspecionar, ocorrência e fila

**Files:**
- Create: `data/forms.ts`, `app/movimentar/[tag].tsx`, `app/inspecionar/[tag].tsx`, `app/ocorrencia/index.tsx` e `app/ocorrencia/[tag].tsx` (os dois renderizam `components/OccurrenceForm.tsx`), `app/fila.tsx`
- Delete: `app/inspecionar/[lotId].tsx`, `app/operadores.tsx`, `data/inspection-store.ts`, `data/access-service.ts`, `data/nfc-reader.ts`, `data/photo-storage.ts`, `components/operation/workflow-styles.ts`, `constants/Colors.ts`, `components/useColorScheme*.ts`, `tests/operational-flows.test.cjs`
- Modify: `package.json`/`app.json` — remover `expo-camera`, `react-native-nfc-manager`, `expo-image-picker`, `expo-local-authentication` e seus plugins/permissões (decisão do implementador prevista no spec; registrar no PR)
- Test: `tests/forms.test.cjs`

**Interfaces:**
- Consumes: `enqueue`, `syncNow`, `listOutbox`, `discard`, `getLocations`, `getSpecies`, `uuidv4`, `normalizeTag`, rótulos.
- Produces (`data/forms.ts`, funções puras): `buildMovement(input: {tag; kind; toLocationId?; requisitionNumber?; notes?; clientUuid; now: Date}): {payload: MovementCreate; summary: string} | {error: string}`; `buildInspection(input: {tag; startedAt: Date; now: Date; conservation; hasCracks; biologicalAttack; moisture; estimatedLifeYears?; speciesConfirmed?; speciesCorrectedId?; notes?; result; clientUuid})`; `buildOccurrence(input: {tag?; locationId?; kind; description; clientUuid; now})`.

- [ ] **Step 1: Testes de `forms.ts`**
- `buildMovement` `withdrawal` sem RM → `{error:'Informe a RM da retirada.'}`; `transfer`/`entry` sem destino → `{error:'Escolha o local de destino.'}`; válido → `payload.rfid_tag` normalizada, `occurred_at === now.toISOString()`, `client_uuid` repassado, sem `to_location_id` na retirada.
- `buildInspection` com `startedAt` 95 s antes de `now` → `duration_seconds: 95`; `estimatedLifeYears: 101` → erro; `speciesConfirmed:false` sem `speciesCorrectedId` → erro.
- `buildOccurrence` sem tag e sem local → erro; `description` com 2 caracteres → erro.
- [ ] **Step 2:** `npm test` → falha.
- [ ] **Step 3:** Implementar `forms.ts`.
- [ ] **Step 4:** `npm test` → passa.
- [ ] **Step 5:** Telas: cada uma gera `clientUuid` (e `startedAt` na inspeção) uma vez ao montar; "Salvar" desabilita durante o envio, chama `build*`, `enqueue` e `syncNow`, e volta para `/dormente/[tag]` mostrando "Registrado — enviado" ou "Registrado — aguardando envio". Inspeção: só abre se `canInspect`, senão `Redirect` para o dormente. Fila: pendentes e rejeitados (com `reason`) agrupados, `Button` "Sincronizar agora", "Descartar" com confirmação só nos rejeitados.
- [ ] **Step 6:** Remover os arquivos listados; `npm install` para atualizar o lock; `npm test`, `npm run typecheck` e `npx expo export --platform android` → passam.
- [ ] **Step 7:** Commit `feat(campo): movimentação, inspeção, ocorrência e fila offline; remove lotes, QR/NFC e fotos`.

### Task 11: Verificação ponta a ponta, docs e PR

**Files:**
- Modify: `README.md`, `docs/qr-nfc-acesso.md` → substituir por `docs/integracao-api.md` (como configurar `EXPO_PUBLIC_API_URL`, papéis, offline, roteiro de teste)
- Create: `.env.example` com `EXPO_PUBLIC_API_URL=`

- [ ] **Step 1:** Subir a API local (repo da API: `docker compose up -d db`, migrations, seed, `uvicorn --host 0.0.0.0 --port 4000`) e rodar o app num Android com `EXPO_PUBLIC_API_URL=http://<ip-do-pc>:4000`.
- [ ] **Step 2:** Roteiro manual (anotar resultado de cada linha no PR): login com matrícula; cadastrar dormente; tag com minúsculas e espaço abre o mesmo dormente; transferência online aparece no histórico e no site; modo avião → inspeção e ocorrência ficam "aguardando envio" → desligar modo avião → somem da fila e aparecem no site; retirar dormente descartado → volta rejeitado na Fila com o motivo → descartar; fechar o app com item pendente e reabrir → item continua; usuário `supervisor` não vê botões de registro.
- [ ] **Step 3:** `npm test`, `npm run typecheck`, `npx expo export --platform android` → passam.
- [ ] **Step 4:** Commit `docs(integracao): configuração e roteiro de teste com a API`.
- [ ] **Step 5:** Push do branch e PR para `main` no repo `1000Tsurus/APP-ProjetoCPTM-REO` — **só depois de o Caio confirmar** (o repo é do Pina). Corpo do PR: o que mudou, o que foi removido e por quê (CONTEXTO: só RFID, sem lote), dependências removidas, resultado do roteiro manual, e o que fica para depois (inventário, SDK do leitor, fotos).
