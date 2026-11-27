# Leitor Bluetooth (ESP32 + RC522) no app — design

Data: 2026-11-27 · Branch: `feat/leitor-bluetooth` (a partir de `preprod`) · Entrega: PR neste repo.

## Intenção

Ligar o leitor de mão do projeto (ESP32 clássico + RC522, firmware em `hardware/leitor-esp32/`) ao app
por Bluetooth clássico (SPP). A leitura pelo gatilho do leitor vira uma leitura no lote, igual à
digitada, sem mudar as telas de lote. Protocolo: `hardware/leitor-esp32/PROTOCOLO.md`.

## Decisões tomadas com o usuário

| Tema | Decisão |
|---|---|
| Conexão | Bluetooth clássico (SPP), só Android. |
| Firmware | Escrito por nós (`hardware/leitor-esp32/leitor-esp32.ino`), gravado pela equipe. Nome `REO-Leitor`. |
| Linha da tag | `TAG:<UID hex maiúsculo sem espaços>`. |
| Dados gravados na tag | Ignorados: o app usa só o UID; dados vêm da API. Gravação na tag fica `TODO(decidir)`. |
| Status | Faixa mostra conectado/desconectado e o modo da chave (`MODO:`). |

## Metas

- `BluetoothSerialReader` implementa a interface `TagReader` já existente (`data/reader/types.ts`).
- Perfil: escolher o leitor entre os aparelhos **já pareados** no Android; o app lembra a escolha
  (`reo.reader.device`, endereço + nome) e reconecta ao abrir.
- Reconexão automática quando a conexão cai (espera crescente: 1 s, 2 s, 4 s… até 30 s), e toque na
  faixa força reconectar.
- Faixa: `● Conectado`, `○ Desconectado`, `Conectando…`; com `MODO:GRAVACAO`/`MODO:DESLIGADO`,
  `● Conectado · chave fora de leitura`.
- `ERRO:` do leitor aparece como aviso curto na tela de lote (sem registrar nada).
- Sem leitor escolhido, o app segue com o leitor por teclado/campo (como hoje).

## Não-metas

- Gravar dados na tag (`GRAVAR:`), mostrar `DORMENTE:`.
- Parear pelo app (o pareamento é feito nas configurações do Android, uma vez).
- iPhone (iOS não abre SPP para apps comuns).

## Desenho

- `data/reader/protocol.ts` (puro, testado): `parseReaderLine(line: string)` →
  `{ kind: 'tag', tag } | { kind: 'mode', mode: 'LEITURA' | 'GRAVACAO' | 'DESLIGADO' } | { kind: 'error', message } | { kind: 'ignored' }`.
  Tira `\r`, aceita só os prefixos do protocolo, normaliza a tag com `normalizeTag`/`isValidTag`.
- `data/reader/bluetooth.ts`: `createBluetoothReader(deps)` com a biblioteca injetada (testável com
  um falso): conecta pelo endereço salvo, lê linhas (delimitador `\n`), repassa `tag` aos inscritos,
  publica status e modo, reconecta com espera crescente, `reconnect()` força nova tentativa.
- `data/reader/device-store.ts`: salvar/ler/esquecer o leitor escolhido.
- `contexts/ReaderContext.tsx`: com leitor salvo, usa o Bluetooth; senão, o de teclado.
  `TagReader` ganha `mode(): ReaderMode | null` (só o Bluetooth preenche).
- Perfil: seção "Leitor" com a lista de pareados, "Usar este", "Esquecer" e o status.
- Módulo nativo próprio (Expo Module local em `modules/reo-bluetooth`, Kotlin), sem dependência de terceiros: decisão do usuário, porque a `react-native-bluetooth-classic` só tem versão RC e é da arquitetura antiga. Funções: `listBonded()`, `connect(address)`, `disconnect()`, `write(line)` e eventos `line`/`state`. Permissões Android 12+ (`BLUETOOTH_CONNECT`,
  `BLUETOOTH_SCAN`) pedidas na hora de listar/conectar; `BLUETOOTH`/`BLUETOOTH_ADMIN` para Android ≤ 11.
  O app passa a exigir build próprio (sai do Expo Go).

## Riscos a verificar antes de codar

- Módulo nativo só é verificado no build e no aparelho (não roda no `node --test`).
- Build local no Windows exige caminho curto e CMake 3.31.6 (ver `docs/integracao-api.md`).

## Testes

- Unidade: `parseReaderLine` (cada prefixo, `\r`, UID com minúsculas, linha humana ignorada, tag
  inválida); leitor Bluetooth com biblioteca falsa (conecta, emite tag, queda → reconecta com espera,
  `reconnect()` imediato, `MODO:` atualiza o status); device-store.
- Aparelho real: parear o `REO-Leitor`, escolher no Perfil, ler tags no lote, desligar o leitor e
  ver reconectar.
