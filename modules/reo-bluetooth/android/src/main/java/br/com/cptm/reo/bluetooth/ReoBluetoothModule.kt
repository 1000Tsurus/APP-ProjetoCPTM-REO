package br.com.cptm.reo.bluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.util.UUID

/** UUID padrão do perfil serial (SPP), o mesmo que o `BluetoothSerial` do ESP32 anuncia. */
private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

/** Linha maior que isso é lixo (o protocolo usa linhas curtas): descarta para não crescer sem limite. */
private const val MAX_LINE_BYTES = 1024

/** Erro com mensagem em português, que chega ao JS como `Error.message`. */
class BluetoothException(message: String, cause: Throwable? = null) :
  CodedException("ERR_REO_BLUETOOTH", message, cause)

/** Uma conexão em andamento ou estabelecida; `socket` só existe depois de criado. */
private class Connection(val address: String) {
  @Volatile var socket: BluetoothSocket? = null
}

/**
 * Porta serial Bluetooth clássica (SPP) para o leitor RFID do ESP32.
 * Um socket por vez: conectar de novo fecha o anterior. Cada conexão roda na sua própria
 * thread, porque `BluetoothSocket.connect()` e `read()` bloqueiam por segundos e não podem
 * ocupar a fila de funções assíncronas do Expo (senão um `disconnect` ficaria esperando).
 */
class ReoBluetoothModule : Module() {
  private val lock = Any()

  /** Conexão atual; as outras (substituídas ou desconectadas) não emitem mais eventos. */
  private var current: Connection? = null

  override fun definition() = ModuleDefinition {
    Name("ReoBluetooth")

    Events("onLine", "onState")

    AsyncFunction("listBonded") {
      val adapter = adapterOrNull() ?: return@AsyncFunction emptyList<Map<String, String>>()
      ensureConnectPermission()
      try {
        adapter.bondedDevices.orEmpty().map { device ->
          mapOf("address" to device.address, "name" to (device.name ?: device.address))
        }
      } catch (e: SecurityException) {
        throw BluetoothException("Sem permissão para usar o Bluetooth.", e)
      }
    }

    AsyncFunction("connect") { address: String, promise: Promise ->
      val connection = Connection(address)
      closeQuietly(swapCurrent(connection))
      Thread({ run(connection, promise) }, "ReoBluetooth-$address").start()
    }

    AsyncFunction("disconnect") {
      closeQuietly(swapCurrent(null))
    }

    OnDestroy {
      closeQuietly(swapCurrent(null))
    }
  }

  /** Conecta e, se der certo, fica lendo linhas até a conexão cair ou ser fechada. */
  private fun run(connection: Connection, promise: Promise) {
    val socket = try {
      open(connection)
    } catch (e: BluetoothException) {
      release(connection)
      closeQuietly(connection)
      promise.reject(e)
      return
    } catch (e: Exception) {
      // Qualquer outro erro também rejeita: a promessa nunca pode ficar pendurada.
      release(connection)
      closeQuietly(connection)
      promise.reject(BluetoothException("Não foi possível conectar ao leitor.", e))
      return
    }
    // Trocada por outra conexão (ou desconectada) enquanto conectava: não anuncia nada.
    if (!isCurrent(connection)) {
      closeQuietly(connection)
      promise.reject(BluetoothException("Conexão substituída."))
      return
    }
    promise.resolve()
    if (isCurrent(connection)) sendEvent("onState", mapOf("connected" to true))
    readLines(connection, socket)
  }

  /** Abre o socket RFCOMM; falha com mensagem clara em português. */
  private fun open(connection: Connection): BluetoothSocket {
    val adapter = adapterOrNull() ?: throw BluetoothException("Este aparelho não tem Bluetooth.")
    if (!adapter.isEnabled) throw BluetoothException("O Bluetooth está desligado. Ligue e tente de novo.")
    ensureConnectPermission()
    try {
      if (!BluetoothAdapter.checkBluetoothAddress(connection.address)) {
        throw BluetoothException("Endereço do leitor inválido: ${connection.address}.")
      }
      // A busca de aparelhos deixa a conexão lenta e instável; cancela antes de conectar.
      try {
        adapter.cancelDiscovery()
      } catch (ignored: SecurityException) {
        // Sem BLUETOOTH_SCAN: segue sem cancelar.
      }
      val device = adapter.getRemoteDevice(connection.address)
      val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
      connection.socket = socket
      if (!isCurrent(connection)) throw BluetoothException("Conexão cancelada.")
      socket.connect()
      if (!isCurrent(connection)) throw BluetoothException("Conexão cancelada.")
      return socket
    } catch (e: BluetoothException) {
      throw e
    } catch (e: SecurityException) {
      throw BluetoothException("Sem permissão para usar o Bluetooth.", e)
    } catch (e: IOException) {
      throw BluetoothException("Não foi possível conectar ao leitor. Verifique se ele está ligado e por perto.", e)
    } catch (e: IllegalArgumentException) {
      throw BluetoothException("Endereço do leitor inválido: ${connection.address}.", e)
    }
  }

  /** Lê bytes, corta em '\n', tira '\r' e emite cada linha (UTF-8). Queda → `onState(false)`. */
  private fun readLines(connection: Connection, socket: BluetoothSocket) {
    val buffer = ByteArray(512)
    val line = ByteArrayOutputStream()
    try {
      val input = socket.inputStream
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break // fim de stream: o leitor fechou a conexão
        for (i in 0 until count) {
          val b = buffer[i]
          if (b == '\n'.code.toByte()) {
            emitLine(connection, line.toByteArray())
            line.reset()
          } else if (line.size() < MAX_LINE_BYTES) {
            line.write(b.toInt())
          }
        }
      }
    } catch (ignored: IOException) {
      // Queda do link ou socket fechado por disconnect/connect novo.
    }
    val stillCurrent = release(connection)
    closeQuietly(connection)
    // Só avisa a queda se ninguém fechou de propósito (disconnect ou conexão nova).
    if (stillCurrent) sendEvent("onState", mapOf("connected" to false))
  }

  /** Emite a linha só se a conexão ainda for a atual (uma substituída nunca fala). */
  private fun emitLine(connection: Connection, bytes: ByteArray) {
    val text = String(bytes, Charsets.UTF_8).trimEnd('\r')
    if (text.isNotEmpty() && isCurrent(connection)) sendEvent("onLine", mapOf("line" to text))
  }

  /** Troca a conexão atual e devolve a anterior (que deve ser fechada). */
  private fun swapCurrent(next: Connection?): Connection? = synchronized(lock) {
    val old = current
    current = next
    old
  }

  /** Tira a conexão do posto de atual, se ainda for ela; diz se era. */
  private fun release(connection: Connection): Boolean = synchronized(lock) {
    if (current === connection) {
      current = null
      true
    } else {
      false
    }
  }

  private fun isCurrent(connection: Connection): Boolean = synchronized(lock) { current === connection }

  private fun closeQuietly(connection: Connection?) {
    try {
      connection?.socket?.close()
    } catch (ignored: IOException) {
      // Já fechado.
    }
  }

  private fun context(): Context =
    appContext.reactContext ?: throw BluetoothException("Aplicativo indisponível.")

  private fun adapterOrNull(): BluetoothAdapter? {
    val manager = context().getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  /** Android 12+ exige BLUETOOTH_CONNECT em tempo de execução; o JS pede antes (requestPermissions). */
  private fun ensureConnectPermission() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
    val granted = context().checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) ==
      PackageManager.PERMISSION_GRANTED
    if (!granted) throw BluetoothException("Sem permissão para usar o Bluetooth. Permita o acesso a aparelhos próximos.")
  }
}
