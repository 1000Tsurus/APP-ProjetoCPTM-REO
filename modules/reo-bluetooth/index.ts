import { PermissionsAndroid, Platform, type Permission } from 'react-native';

import type { NativeSerial } from '../../data/reader/bluetooth';
import ReoBluetooth, { type BondedDevice } from './src/ReoBluetoothModule';

export type { BondedDevice } from './src/ReoBluetoothModule';

const UNAVAILABLE = 'Bluetooth indisponível neste app.';

/** `false` quando o app roda sem o módulo nativo (Expo Go, web, testes). */
export function isAvailable(): boolean {
  return ReoBluetooth != null;
}

/** Aparelhos pareados no Android; o operador escolhe o leitor nesta lista. */
export async function listBonded(): Promise<BondedDevice[]> {
  if (!ReoBluetooth) return [];
  return ReoBluetooth.listBonded();
}

/**
 * Pede as permissões de Bluetooth. Android 12+ (API 31) exige BLUETOOTH_CONNECT e
 * BLUETOOTH_SCAN em tempo de execução; antes disso as permissões do manifest bastam.
 */
export async function requestPermissions(): Promise<boolean> {
  if (!ReoBluetooth || Platform.OS !== 'android') return false;
  if (typeof Platform.Version !== 'number' || Platform.Version < 31) return true;
  const wanted = [
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ] as Permission[];
  const result = await PermissionsAndroid.requestMultiple(wanted);
  return wanted.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
}

/** Porta serial usada por `createBluetoothReader` (data/reader/bluetooth.ts). */
export const nativeSerial: NativeSerial = {
  async connect(address) {
    if (!ReoBluetooth) throw new Error(UNAVAILABLE);
    await ReoBluetooth.connect(address);
  },
  async disconnect() {
    if (!ReoBluetooth) return;
    await ReoBluetooth.disconnect();
  },
  onLine(fn) {
    if (!ReoBluetooth) return () => {};
    const sub = ReoBluetooth.addListener('onLine', (e) => fn(e.line));
    return () => sub.remove();
  },
  onState(fn) {
    if (!ReoBluetooth) return () => {};
    const sub = ReoBluetooth.addListener('onState', (e) => fn(e.connected));
    return () => sub.remove();
  },
};
