# Leitor Bluetooth no app — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o leitor ESP32 + RC522 (Bluetooth clássico/SPP) ao app como um `TagReader`, com escolha do aparelho no Perfil, reconexão automática e modo da chave na faixa.

**Architecture:** Parser de linhas e leitor Bluetooth em TS puro, com o módulo nativo injetado (testável no `node --test`). Módulo nativo próprio: Expo Module local `modules/reo-bluetooth` em Kotlin. O `ReaderContext` escolhe o leitor Bluetooth quando há aparelho salvo; senão, o de teclado.

**Tech Stack:** Expo SDK 58 (Expo Modules API), React Native 0.88, Kotlin, TypeScript, AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-11-27-leitor-bluetooth-design.md` · Protocolo: `hardware/leitor-esp32/PROTOCOLO.md`

## Global Constraints

- Nenhuma dependência npm nova. O nativo é Expo Module local (autolinking de `modules/`).
- Ler https://docs.expo.dev/versions/v58.0.0/ e https://docs.expo.dev/modules/module-api/ antes do nativo.
- Identificadores em inglês; textos de tela, comentários e docstrings em português.
- SPP UUID: `00001101-0000-1000-8000-00805F9B34FB`. Nome do leitor: `REO-Leitor`.
- Reconexão: esperas 1 s, 2 s, 4 s, 8 s, 16 s, 30 s (teto 30 s); `reconnect()` zera a espera e tenta já.
- Chave de armazenamento do leitor escolhido: `reo.reader.device` (`{ address, name }`).
- Commits Conventional em PT, sem `Co-Authored-By` nem menção a IA. `npm test` e `npm run typecheck` limpos.

## Review Focus

1. Linha quebrada em dois pacotes Bluetooth (`TA` + `G:04A1\n`) — o nativo junta até `\n` antes de emitir (Task 2).
2. Leitor desligado no meio do lote — status vira `disconnected`, reconexão com espera, nenhuma leitura duplicada ao voltar (Task 1).
3. Permissão de Bluetooth negada — o Perfil explica e não trava; o app segue com o teclado (Task 3).
4. Chave fora de leitura — faixa avisa; `TAG:` em modo gravação ainda chega e é tratada como leitura (Task 1).
5. Trocar ou esquecer o leitor com conexão aberta — desconecta o anterior antes (Tasks 1 e 3).

---

### Task 1: Protocolo, leitor Bluetooth (TS) e armazenamento do aparelho

**Files:**
- Create: `data/reader/protocol.ts`, `data/reader/bluetooth.ts`, `data/reader/device-store.ts`
- Modify: `data/reader/types.ts` (`ReaderMode`, `mode()`), `data/reader/keyboard.ts` (`mode()` → `null`), `data/status-text.ts` (`readerStatusText(status, mode?)`)
- Test: `tests/reader-protocol.test.cjs`, `tests/reader-bluetooth.test.cjs`, `tests/status-text.test.cjs`

**Interfaces:**
- Produces:
  - `type ReaderMode = 'LEITURA' | 'GRAVACAO' | 'DESLIGADO'`; `TagReader.mode(): ReaderMode | null`; `TagReader.subscribe` passa a avisar também mudanças de modo pelo `onStatus` (mesmo callback).
  - `parseReaderLine(line: string): { kind: 'tag'; tag: string } | { kind: 'mode'; mode: ReaderMode } | { kind: 'error'; message: string } | { kind: 'ignored' }` — tira `\r`/espaços nas pontas; `TAG:` normalizada com `normalizeTag` e validada com `isValidTag` (inválida → `ignored`); `MODO:` só os 3 valores; `ERRO:` com o resto da linha.
  - `type NativeSerial = { connect(address: string): Promise<void>; disconnect(): Promise<void>; onLine(fn: (line: string) => void): () => void; onState(fn: (connected: boolean) => void): () => void }`
  - `createBluetoothReader(deps: { native: NativeSerial; address: string; schedule: (fn: () => void, ms: number) => () => void }): TagReader & { onReaderError(fn: (message: string) => void): () => void; close(): Promise<void> }`
  - `device-store.ts`: `type SavedReader = { address: string; name: string }`; `getSavedReader(): Promise<SavedReader | null>`, `saveReader(r)`, `forgetReader()`.
  - `readerStatusText(status, mode?)`: com `connected` e `mode` diferente de `LEITURA` → `'● Conectado · chave fora de leitura'`; demais textos iguais.

- [ ] **Step 1: Testes que falham:**
  - protocolo: `TAG:04a1b2c3\r` → tag `04A1B2C3`; `MODO:GRAVACAO`; `MODO:XYZ` → ignored; `ERRO:autenticacao Timeout` → error `autenticacao Timeout`; ` Especie: X` → ignored; `TAG:` vazio → ignored.
  - leitor: começa `connecting` e chama `connect(address)`; `onState(true)` → `connected`; linha `TAG:..` emite a tag aos inscritos; `MODO:` muda `mode()` e avisa `onStatus`; `ERRO:` chama `onReaderError`; falha de `connect` → `disconnected` e agenda nova tentativa com 1000, depois 2000, 4000… até 30000; `onState(false)` depois de conectado → reconecta com 1000; `reconnect()` cancela a espera e tenta já; `close()` cancela tudo e chama `disconnect()`, sem novas tentativas.
  - status: `readerStatusText('connected', 'GRAVACAO')` e `('connected', 'LEITURA')`.
- [ ] **Step 2:** `node --test tests/reader-protocol.test.cjs tests/reader-bluetooth.test.cjs tests/status-text.test.cjs` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** `npm test` e `npm run typecheck` → limpos.
- [ ] **Step 5:** Commit `feat(leitor): protocolo e leitor Bluetooth com reconexão`.

### Task 2: Módulo nativo `modules/reo-bluetooth` (Kotlin)

**Files:**
- Create: `modules/reo-bluetooth/expo-module.config.json`, `modules/reo-bluetooth/index.ts`, `modules/reo-bluetooth/src/ReoBluetoothModule.ts`, `modules/reo-bluetooth/android/build.gradle`, `modules/reo-bluetooth/android/src/main/AndroidManifest.xml`, `modules/reo-bluetooth/android/src/main/java/br/com/cptm/reo/bluetooth/ReoBluetoothModule.kt`
- Modify: `app.json` (`android.permissions`)

**Interfaces:**
- Produces (JS, `modules/reo-bluetooth/index.ts`):
  - `listBonded(): Promise<{ address: string; name: string }[]>`
  - `requestPermissions(): Promise<boolean>` — Android 12+: `BLUETOOTH_CONNECT` e `BLUETOOTH_SCAN`; ≤ 11: `true`.
  - `nativeSerial: NativeSerial` (o tipo da Task 1): `connect`, `disconnect`, `onLine`, `onState`.
  - `isAvailable(): boolean` — `false` quando o módulo nativo não existe (Expo Go, web, testes).
- Nativo: `connect` abre `createRfcommSocketToServiceRecord(SPP_UUID)` numa thread de I/O (cancela discovery antes), lê o `InputStream` acumulando até `\n` e emite `onLine` por linha completa (UTF-8, sem `\r`); erro/fim de stream → fecha o socket e emite `onState(false)`; `connect` bem-sucedido emite `onState(true)`; `disconnect` fecha socket e thread. Um socket por vez (connect novo fecha o anterior).
- `app.json`: `"permissions": ["android.permission.BLUETOOTH", "android.permission.BLUETOOTH_ADMIN", "android.permission.BLUETOOTH_CONNECT", "android.permission.BLUETOOTH_SCAN"]` (os dois primeiros com `maxSdkVersion` 30 no manifest do módulo).

- [ ] **Step 1:** Escrever o módulo seguindo a Expo Modules API (Module DSL: `Name`, `Events`, `AsyncFunction`), sem usar `create-expo-module` (nada de download).
- [ ] **Step 2:** `npm run typecheck` limpo; `npx expo prebuild -p android --no-install` mostra o módulo autolinkado (`android/settings.gradle` inclui `reo-bluetooth`).
- [ ] **Step 3:** Commit `feat(leitor): módulo nativo de Bluetooth serial`.

### Task 3: Ligação no app (contexto, Perfil, faixa e lote)

**Files:**
- Modify: `contexts/ReaderContext.tsx`, `app/(app)/(tabs)/(pages)/perfil.tsx`, `components/StatusStrip.tsx`, `components/batch/useBatchRun.ts` (ou onde o lote mostra avisos)

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces: `useReader()` continua devolvendo `TagReader`; novo `useReaderSettings(): { saved: SavedReader | null; choose(r: SavedReader): Promise<void>; forget(): Promise<void> }`.

Comportamento:
- Ao abrir: com `isAvailable()` e leitor salvo → `createBluetoothReader` com `nativeSerial`; senão `createKeyboardReader()`. Trocar/esquecer fecha (`close()`) o leitor anterior antes de criar o novo.
- Perfil › Leitor: status (`readerStatusText(status, mode)`); se `!isAvailable()`: "Leitor Bluetooth disponível só no app instalado (não no Expo Go)."; botão "Escolher leitor" → `requestPermissions()` (negada → "Permita o Bluetooth para usar o leitor.") → `listBonded()` → lista (nome e endereço; `REO-Leitor` no topo) → "Usar este"; lista vazia → "Pareie o REO-Leitor nas configurações de Bluetooth do Android."; "Esquecer leitor".
- Faixa: usa `readerStatusText(status, mode)`; toque → `reconnect()`.
- Lote: `ERRO:` do leitor vira aviso curto ("Leitor: <motivo>") sem registrar; o campo de texto continua funcionando com o Bluetooth ativo.

- [ ] **Step 1:** Implementar.
- [ ] **Step 2:** `npm test`, `npm run typecheck` limpos.
- [ ] **Step 3:** Commit `feat(leitor): escolher o leitor no Perfil e status na faixa`.

### Task 4: Build e documentação (controlador)

- [ ] Atualizar `docs/integracao-api.md` (seção do leitor: pareamento, Perfil, protocolo).
- [ ] Gerar o APK pela cópia curta (`C:\r`, CMake 3.31.6) e entregar.
- [ ] Commit `docs(leitor): uso do leitor Bluetooth`.
