// Leitor RFID de mão do Projeto REO: ESP32 (clássico) + RC522, chave gangorra de 3 posições.
// Fala com o app por Bluetooth clássico (SPP) e, ao mesmo tempo, pela USB (Monitor Serial).
// Protocolo das linhas para o app: ver PROTOCOLO.md nesta pasta.
//
// Placa: ESP32 "clássico" (ESP32-WROOM / DevKit). ESP32-S3/C3/C6 NÃO têm Bluetooth clássico.

#include <SPI.h>
#include <MFRC522.h>
#include "BluetoothSerial.h"

#if !defined(CONFIG_BT_ENABLED) || !defined(CONFIG_BLUEDROID_ENABLED)
#error "Bluetooth clássico desativado: use um ESP32 clássico e ative o Bluetooth no menu da placa."
#endif

#define NOME_BT       "REO-Leitor"
#define SS_PIN        5
#define RST_PIN       22
#define PIN_MODO1     32   // posição I  = leitura
#define PIN_MODO2     33   // posição II = gravação
#define BLOCO_ESPECIE 4
#define BLOCO_MEDIDAS 5

MFRC522 rfid(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key chave;
BluetoothSerial SerialBT;

// Escreve em USB e Bluetooth ao mesmo tempo: o Monitor Serial continua mostrando tudo.
class SaidaDupla : public Print {
 public:
  size_t write(uint8_t c) override {
    Serial.write(c);
    SerialBT.write(c);
    return 1;
  }
  size_t write(const uint8_t* buf, size_t n) override {
    Serial.write(buf, n);
    SerialBT.write(buf, n);
    return n;
  }
};
SaidaDupla Saida;

const char* ESTADOS[] = {"Bom", "Regular", "Ruim", "Inservivel"};
const char* NOMES_MODO[] = {"DESLIGADO", "LEITURA", "GRAVACAO"};

struct Dormente {
  char     especie[17];
  uint16_t comprimento_mm;
  uint16_t largura_mm;
  uint8_t  estado;
  float    volume_m3;
};

Dormente dormenteGravar;
bool dadosProntos = false;
int modoAnterior = -1;
bool clienteAnterior = false;

// ---------- Chave gangorra ----------
int lerModo() {
  bool a = digitalRead(PIN_MODO1) == LOW;
  bool b = digitalRead(PIN_MODO2) == LOW;
  if (a && !b) return 1;
  if (b && !a) return 2;
  return 0;
}

// Linha de protocolo: o app usa para mostrar o modo na faixa de status.
void enviaModo(int modo) {
  Saida.print("MODO:");
  Saida.println(NOMES_MODO[modo]);
}

// ---------- Entrada de dados ----------
int indiceEstado(String s) {
  s.trim();
  s.toLowerCase();
  if (s.startsWith("bom")) return 0;
  if (s.startsWith("reg")) return 1;
  if (s.startsWith("rui")) return 2;
  if (s.startsWith("ins")) return 3;
  if (s.length() == 1 && s[0] >= '0' && s[0] <= '3') return s[0] - '0';
  return -1;
}

void processaLinha(String linha) {
  linha.trim();
  if (linha.length() == 0) return;
  if (linha.startsWith("GRAVAR:")) linha = linha.substring(7);

  String c[5];
  int n = 0, ini = 0;
  while (n < 5) {
    int p = linha.indexOf(';', ini);
    if (p < 0) { c[n++] = linha.substring(ini); break; }
    c[n++] = linha.substring(ini, p);
    ini = p + 1;
  }
  if (n < 5) {
    Saida.println("ERRO:formato (especie;comp_cm;larg_cm;estado;volume_m3)");
    return;
  }

  for (int i = 1; i <= 4; i++) c[i].replace(',', '.');
  c[0].trim();
  float comp = c[1].toFloat();
  float larg = c[2].toFloat();
  int   est  = indiceEstado(c[3]);
  float vol  = c[4].toFloat();

  if (c[0].length() == 0 || comp <= 0 || larg <= 0 || est < 0 || vol < 0) {
    Saida.println("ERRO:valores invalidos");
    return;
  }

  memset(&dormenteGravar, 0, sizeof(dormenteGravar));
  c[0].substring(0, 16).toCharArray(dormenteGravar.especie, 17);
  dormenteGravar.comprimento_mm = (uint16_t)(comp * 10.0f + 0.5f);
  dormenteGravar.largura_mm     = (uint16_t)(larg * 10.0f + 0.5f);
  dormenteGravar.estado         = est;
  dormenteGravar.volume_m3      = vol;
  dadosProntos = true;

  Saida.print("Dados prontos: ");
  Saida.print(dormenteGravar.especie);
  Saida.print(" | ");
  Saida.print(comp, 1);  Saida.print(" cm | ");
  Saida.print(larg, 1);  Saida.print(" cm | ");
  Saida.print(ESTADOS[est]); Saida.print(" | ");
  Saida.print(vol, 3);   Saida.println(" m3");
  Saida.println("Aproxime a tag para gravar.");
}

// Comandos podem chegar pela USB ou pelo Bluetooth.
void lerEntrada() {
  if (Serial.available()) processaLinha(Serial.readStringUntil('\n'));
  if (SerialBT.available()) processaLinha(SerialBT.readStringUntil('\n'));
}

// ---------- RFID ----------
// Linha principal para o app: UID em hexadecimal maiúsculo, sem espaços (ex.: TAG:04A1B2C3).
void enviaTag() {
  Saida.print("TAG:");
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) Saida.print('0');
    Saida.print(rfid.uid.uidByte[i], HEX);
  }
  Saida.println();
}

bool autentica() {
  MFRC522::StatusCode st = rfid.PCD_Authenticate(
      MFRC522::PICC_CMD_MF_AUTH_KEY_A, BLOCO_ESPECIE, &chave, &(rfid.uid));
  if (st != MFRC522::STATUS_OK) {
    Saida.print("ERRO:autenticacao ");
    Saida.println(rfid.GetStatusCodeName(st));
    return false;
  }
  return true;
}

void modoLeitura() {
  if (!autentica()) return;

  byte b4[18], b5[18];
  byte tam = 18;
  if (rfid.MIFARE_Read(BLOCO_ESPECIE, b4, &tam) != MFRC522::STATUS_OK) {
    Saida.println("ERRO:leitura bloco 4");
    return;
  }
  tam = 18;
  if (rfid.MIFARE_Read(BLOCO_MEDIDAS, b5, &tam) != MFRC522::STATUS_OK) {
    Saida.println("ERRO:leitura bloco 5");
    return;
  }

  Dormente d;
  memcpy(d.especie, b4, 16);
  d.especie[16] = '\0';
  d.comprimento_mm = (b5[0] << 8) | b5[1];
  d.largura_mm     = (b5[2] << 8) | b5[3];
  d.estado         = b5[4];
  memcpy(&d.volume_m3, &b5[5], 4);

  if (d.especie[0] == '\0' && d.comprimento_mm == 0) {
    Saida.println("[LEITURA] Tag vazia (sem dados de dormente)");
    return;
  }

  const char* est = (d.estado <= 3) ? ESTADOS[d.estado] : "Desconhecido";
  float comp = d.comprimento_mm / 10.0f;
  float larg = d.largura_mm / 10.0f;

  Saida.println("[LEITURA] Dormente de madeira");
  Saida.print(" Especie: ");      Saida.println(d.especie);
  Saida.print(" Comprimento: ");  Saida.print(comp, 1); Saida.println(" cm");
  Saida.print(" Largura: ");      Saida.print(larg, 1); Saida.println(" cm");
  Saida.print(" Estado: ");       Saida.println(est);
  Saida.print(" Volume: ");       Saida.print(d.volume_m3, 3); Saida.println(" m3");

  // Dados gravados na tag. O app hoje ignora esta linha (usa só o TAG:).
  Saida.print("DORMENTE:");
  Saida.print(d.especie); Saida.print(';');
  Saida.print(comp, 1);   Saida.print(';');
  Saida.print(larg, 1);   Saida.print(';');
  Saida.print(est);       Saida.print(';');
  Saida.println(d.volume_m3, 3);
}

void modoGravacao() {
  if (!dadosProntos) {
    Saida.println("Envie primeiro os dados: especie;comp_cm;larg_cm;estado;volume_m3");
    return;
  }
  if (!autentica()) return;

  byte b4[16] = {0}, b5[16] = {0};
  memcpy(b4, dormenteGravar.especie, 16);
  b5[0] = dormenteGravar.comprimento_mm >> 8;
  b5[1] = dormenteGravar.comprimento_mm & 0xFF;
  b5[2] = dormenteGravar.largura_mm >> 8;
  b5[3] = dormenteGravar.largura_mm & 0xFF;
  b5[4] = dormenteGravar.estado;
  memcpy(&b5[5], &dormenteGravar.volume_m3, 4);

  bool ok = rfid.MIFARE_Write(BLOCO_ESPECIE, b4, 16) == MFRC522::STATUS_OK &&
            rfid.MIFARE_Write(BLOCO_MEDIDAS, b5, 16) == MFRC522::STATUS_OK;
  if (ok) {
    Saida.println("[GRAVACAO] OK!");
    Saida.println("OK:GRAVACAO");
  } else {
    Saida.println("ERRO:gravacao");
  }
}

// ---------- Principal ----------
void setup() {
  Serial.begin(115200);
  SerialBT.begin(NOME_BT);
  pinMode(PIN_MODO1, INPUT_PULLUP);
  pinMode(PIN_MODO2, INPUT_PULLUP);
  SPI.begin(18, 19, 23, SS_PIN);
  rfid.PCD_Init();
  for (byte i = 0; i < 6; i++) chave.keyByte[i] = 0xFF;
  Saida.println("Pronto.");
}

void loop() {
  // App acabou de conectar: manda o modo atual para a faixa de status já começar certa.
  bool cliente = SerialBT.hasClient();
  if (cliente && !clienteAnterior && modoAnterior >= 0) enviaModo(modoAnterior);
  clienteAnterior = cliente;

  int modo = lerModo();
  if (modo != modoAnterior) {
    modoAnterior = modo;
    enviaModo(modo);
    if (modo == 1) Saida.println("\n== MODO LEITURA ==");
    if (modo == 2) {
      Saida.println("\n== MODO GRAVACAO ==");
      Saida.println("Envie: especie;comp_cm;larg_cm;estado;volume_m3");
      Saida.println("Ex.: Eucalipto;280;24;Bom;0.170");
    }
  }
  if (modo == 2) lerEntrada();
  if (modo == 0) return;

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;

  enviaTag();

  if (modo == 1) modoLeitura();
  else           modoGravacao();

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(800);
}
