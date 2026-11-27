import { requireOptionalNativeModule, type EventSubscription } from 'expo';

/** Aparelho Bluetooth já pareado no Android (o leitor aparece como `REO-Leitor`). */
export type BondedDevice = { address: string; name: string };

/** Eventos emitidos pelo lado Kotlin. */
export type ReoBluetoothEvents = {
  /** Uma linha completa recebida do leitor (UTF-8, sem `\r\n`). */
  onLine: (event: { line: string }) => void;
  /** `true` depois de conectar; `false` quando o link estabelecido cai. */
  onState: (event: { connected: boolean }) => void;
};

/** Funções do módulo nativo `ReoBluetooth` (Android). */
export type ReoBluetoothNativeModule = {
  listBonded(): Promise<BondedDevice[]>;
  connect(address: string): Promise<void>;
  disconnect(): Promise<void>;
  addListener<E extends keyof ReoBluetoothEvents>(event: E, listener: ReoBluetoothEvents[E]): EventSubscription;
};

/**
 * Módulo nativo, ou `null` onde ele não existe (Expo Go, web, testes).
 * Opcional de propósito: importar este arquivo nunca pode quebrar o app sem o módulo.
 */
export default requireOptionalNativeModule<ReoBluetoothNativeModule>('ReoBluetooth');
