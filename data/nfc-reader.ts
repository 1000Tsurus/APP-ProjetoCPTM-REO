import Constants from 'expo-constants';
import { Platform } from 'react-native';

type NfcModule = typeof import('react-native-nfc-manager');
type Scan = { cancelled: boolean; manager?: NfcModule['default'] };
let active: Scan | null = null;

export async function cancelNfcRead() {
  const scan = active;
  if (!scan) return;
  scan.cancelled = true;
  await scan.manager?.cancelTechnologyRequest().catch(() => undefined);
}

export async function readNfcIdentifier(): Promise<string> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('A leitura NFC exige um aparelho Android ou iPhone compatível. Neste navegador, use Ler QR Code.');
  if (Constants.executionEnvironment === 'storeClient') throw new Error('NFC não funciona no Expo Go. Instale um development build com o módulo NFC em um aparelho compatível. Use QR Code enquanto isso.');
  if (active) throw new Error('Uma leitura NFC já está em andamento.');
  const scan: Scan = { cancelled: false };
  active = scan;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let library: NfcModule;
    try { library = await import('react-native-nfc-manager'); }
    catch { throw new Error('Módulo NFC ausente neste aplicativo. Gere e instale um novo development build.'); }
    const { default: manager, NfcTech, Ndef } = library;
    scan.manager = manager;
    if (scan.cancelled) throw new Error('Leitura NFC cancelada.');
    if (!await manager.isSupported()) throw new Error('Este aparelho não possui NFC compatível. Use Ler QR Code.');
    await manager.start();
    if (Platform.OS === 'android' && !await manager.isEnabled()) throw new Error('O NFC está desativado. Ative-o nos ajustes do aparelho e tente novamente.');
    if (scan.cancelled) throw new Error('Leitura NFC cancelada.');
    const read = async () => {
      await manager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Aproxime a etiqueta do dormente.' });
      if (scan.cancelled) throw new Error('Leitura NFC cancelada.');
      const tag = await manager.getTag();
      const identifiers = (tag?.ndefMessage || []).filter((record) =>
        record.tnf === Ndef.TNF_WELL_KNOWN && (record.type === 'T' || (Array.isArray(record.type) && record.type.length === 1 && record.type[0] === 84))
      ).map((record) => Ndef.text.decodePayload(new Uint8Array(record.payload))).filter((value) => /^raillog:sleeper:LT-\d+-D\d{4,}$/.test(value));
      if (identifiers.length !== 1) throw new Error('Etiqueta desconhecida: deve conter um único identificador de dormente RailLog em texto NDEF.');
      return identifiers[0];
    };
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { reject(new Error('Tempo de leitura esgotado. Aproxime novamente a etiqueta e tente outra vez.')); }, 25000);
    })]);
  } catch (cause) {
    if (scan.cancelled) throw new Error('Leitura NFC cancelada.');
    const message = cause instanceof Error ? cause.message : '';
    if (/permission|security|denied|not.?authorized/i.test(message)) throw new Error('Permissão NFC negada. Verifique os ajustes e a autorização NFC do aplicativo. Você pode usar QR Code.');
    if (/NFC|NDEF|Etiqueta|aparelho|leitura|development build/i.test(message)) throw cause;
    throw new Error('Falha na leitura NFC ou leitura cancelada. Mantenha a etiqueta próxima e tente novamente.');
  } finally {
    if (timeout) clearTimeout(timeout);
    await scan.manager?.cancelTechnologyRequest().catch(() => undefined);
    if (active === scan) active = null;
  }
}
