# Leitor REO (ESP32 + RC522): protocolo com o app

Bluetooth clássico (SPP), nome do dispositivo **`REO-Leitor`**. O mesmo texto sai na USB (115200 baud),
para acompanhar no Monitor Serial do Arduino IDE.

Cada mensagem é uma linha terminada em `\n` (o `println` manda `\r\n`; o app descarta o `\r`).
O app lê **só as linhas com os prefixos abaixo** e ignora o resto (as mensagens para gente, como
`== MODO LEITURA ==` ou ` Especie: ...`).

## Do leitor para o app

| Linha | Quando | O que o app faz |
|---|---|---|
| `TAG:04A1B2C3` | a cada tag aproximada (modo leitura ou gravação) | trata como leitura da tag: UID em hexadecimal maiúsculo, sem espaços (8 caracteres para UID de 4 bytes, 14 para 7 bytes) |
| `MODO:LEITURA` / `MODO:GRAVACAO` / `MODO:DESLIGADO` | ao mudar a chave gangorra e logo que o app conecta | mostra na faixa de status; fora de `LEITURA` avisa que o leitor não está lendo |
| `ERRO:<motivo>` | falha de autenticação, leitura ou gravação | mostra o motivo, sem bloquear o lote |
| `DORMENTE:esp;comp;larg;estado;vol` | modo leitura, tag com dados gravados | ignorada por enquanto (os dados do dormente vêm da API) |
| `OK:GRAVACAO` | gravação na tag concluída | ignorada por enquanto |

## Do app para o leitor

| Linha | Efeito |
|---|---|
| `GRAVAR:esp;comp_cm;larg_cm;estado;volume_m3` | prepara os dados para gravar na próxima tag (só no modo gravação) |

O app ainda não usa a gravação na tag: `TODO(decidir)` qual fonte vale se a tag e a API divergirem.

## Mudanças em relação ao firmware anterior

- Bluetooth clássico (`BluetoothSerial`) com o nome `REO-Leitor`; tudo que ia para a USB vai também
  para o Bluetooth, e comandos são aceitos pelos dois.
- A linha `UID: 04 A1 B2 C3` virou `TAG:04A1B2C3`.
- Novas linhas `MODO:` e `OK:GRAVACAO`.
- Exige ESP32 clássico (ESP32-WROOM/DevKit). Os ESP32-S3, C3 e C6 só têm BLE e não compilam.

## Observações

- A chave das tags é a de fábrica (`FF FF FF FF FF FF`): qualquer leitor MIFARE regrava os blocos
  4 e 5. A identificação pelo UID não depende disso.
- Depois de ler, o RC522 só lê a mesma tag de novo quando ela sai do campo e volta.
