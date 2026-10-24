import * as LocalAuthentication from 'expo-local-authentication';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { findOperatorProfile, useSession } from '@/contexts/SessionContext';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const KEEP_CONNECTED_KEY = 'cptm.keepConnectedUntil';
const SIX_MONTHS_IN_MS = 1000 * 60 * 60 * 24 * 183;

async function getSecureItem(key: string) {
  const available = await SecureStore.isAvailableAsync();
  return available ? SecureStore.getItemAsync(key) : null;
}

async function setSecureItem(key: string, value: string) {
  const available = await SecureStore.isAvailableAsync();
  if (available) {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
}

async function deleteSecureItem(key: string) {
  const available = await SecureStore.isAvailableAsync();
  if (available) {
    await SecureStore.deleteItemAsync(key);
  }
}

export default function LoginScreen() {
  const { startSession } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [keepConnected, setKeepConnected] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const eyeAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void restoreKeepConnected();
  }, []);

  useEffect(() => {
    Animated.timing(eyeAnimation, {
      toValue: passwordVisible ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [eyeAnimation, passwordVisible]);

  async function restoreKeepConnected() {
    const storedDate = await getSecureItem(KEEP_CONNECTED_KEY);
    if (!storedDate) {
      return;
    }

    const expiresAt = new Date(storedDate).getTime();
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      await deleteSecureItem(KEEP_CONNECTED_KEY);
      setKeepConnected(false);
      return;
    }

    setKeepConnected(true);
  }

  async function toggleKeepConnected() {
    const nextValue = !keepConnected;
    setKeepConnected(nextValue);

    if (!nextValue) {
      await deleteSecureItem(KEEP_CONNECTED_KEY);
      return;
    }

    const expiresAt = new Date(Date.now() + SIX_MONTHS_IN_MS).toISOString();
    await setSecureItem(KEEP_CONNECTED_KEY, expiresAt);
  }

  async function signIn() {
    if (!identifier.trim() || !password.trim()) {
      Alert.alert('Acesso incompleto', 'Informe matrícula/e-mail e senha para continuar.');
      return;
    }

    const savedProfile = await findOperatorProfile(identifier);
    await startSession(savedProfile ?? {
      nomeCompleto: '', matriculaOuEmail: identifier.trim(),
      funcaoOperacional: 'Inspetor CPTM', baseLotacao: '',
    });
    router.replace('/(tabs)');
  }

  async function signInWithBiometrics() {
    try {
      setIsBiometricLoading(true);
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();

      if (!compatible || !enrolled) {
        Alert.alert(
          'Biometria indisponível',
          'Este aparelho ainda não possui biometria cadastrada para acesso rápido.',
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Entrar na operação CPTM',
        cancelLabel: 'Cancelar',
        fallbackLabel: 'Usar senha',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const savedProfile = await findOperatorProfile();
        if (!savedProfile) {
          Alert.alert('Identifique seu perfil', 'Entre com sua matrícula e senha antes de usar o acesso biométrico.');
          return;
        }
        await startSession(savedProfile);
        router.replace('/(tabs)');
      }
    } finally {
      setIsBiometricLoading(false);
    }
  }

  const slashOpacity = eyeAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const slashRotate = eyeAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: ['-32deg', '-8deg'],
  });

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', default: undefined })}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.versionPill}>
            <View style={styles.statusDot} />
            <Text style={styles.versionText}>TERMINAL DE CAMPO • V3.4</Text>
          </View>

          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <View style={styles.logoLight} />
              <View style={styles.trainFace}>
                <View style={styles.trainWindow} />
                <View style={styles.trainWindow} />
              </View>
              <View style={styles.trainRails}>
                <View style={styles.rail} />
                <View style={styles.rail} />
              </View>
            </View>
            <View>
              <View style={styles.brandNameRow}>
                <Text style={styles.brandName}>CPTM</Text>
                <View style={styles.brandDot} />
              </View>
              <Text style={styles.brandSubtitle}>Estado de São Paulo</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Bem-vindo de volta</Text>
            <Text style={styles.subtitle}>Operação e Manutenção Ferroviária</Text>

            <View style={styles.fieldBlock}>
              <Text style={styles.label}>Matrícula ou E-mail</Text>
              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>ID</Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  onChangeText={setIdentifier}
                  placeholder="RL-8842"
                  placeholderTextColor="#5f6067"
                  style={styles.input}
                  value={identifier}
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Senha de Acesso</Text>
                <Pressable hitSlop={8}>
                  <Text style={styles.forgotPassword}>Esqueceu a senha?</Text>
                </Pressable>
              </View>
              <View style={styles.inputShell}>
                <Text style={styles.inputIcon}>#</Text>
                <TextInput
                  autoCapitalize="none"
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor="#1f2228"
                  secureTextEntry={!passwordVisible}
                  style={styles.input}
                  value={password}
                />
                <Pressable
                  accessibilityLabel={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                  hitSlop={10}
                  onPress={() => setPasswordVisible((current) => !current)}
                  style={styles.eyeButton}>
                  <View style={styles.eyeShape}>
                    <View style={styles.eyePupil} />
                    <Animated.View
                      style={[
                        styles.eyeSlash,
                        {
                          opacity: slashOpacity,
                          transform: [{ rotate: slashRotate }],
                        },
                      ]}
                    />
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={styles.securityRow}>
              <Pressable onPress={toggleKeepConnected} style={styles.keepConnectedButton}>
                <View style={[styles.switchTrack, keepConnected && styles.switchTrackOn]}>
                  <View style={[styles.switchThumb, keepConnected && styles.switchThumbOn]} />
                </View>
                <Text style={styles.keepConnectedText}>Manter conectado</Text>
              </Pressable>

              <View style={styles.sslRow}>
                <Text style={styles.shieldIcon}>◇</Text>
                <Text style={styles.sslText}>SSL Seguro</Text>
              </View>
            </View>

            <Pressable onPress={signIn} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
              <Text style={styles.primaryButtonText}>Entrar no Sistema</Text>
              <Text style={styles.arrowIcon}>→</Text>
            </Pressable>

            <View style={styles.divider} />

            <Text style={styles.quickAccessTitle}>ACESSO RÁPIDO EM CAMPO</Text>
            <Pressable
              disabled={isBiometricLoading}
              onPress={signInWithBiometrics}
              style={({ pressed }) => [
                styles.biometricButton,
                (pressed || isBiometricLoading) && styles.biometricButtonPressed,
              ]}>
              <Text style={styles.fingerprintIcon}>◎</Text>
              <Text style={styles.biometricText}>
                {isBiometricLoading ? 'Verificando Biometria' : 'Entrar com Biometria'}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.operationArea}>
            <View style={styles.areaIcon}>
              <Text style={styles.areaIconText}>OP</Text>
            </View>
            <View style={styles.areaContent}>
              <Text style={styles.areaTitle}>Linha 9-Esmeralda • Osasco - Bruno Covas/Mendes-Vila Natal</Text>
              <Text style={styles.areaSubtitle}>7 ordens de vistoria pendentes hoje</Text>
            </View>
            <Text style={styles.areaArrow}>›</Text>
          </Pressable>

          <View style={styles.requestAccess}>
            <Text style={styles.requestMuted}>Não possui credencial autorizada?</Text>
            <Pressable onPress={() => router.push('/cadastro')} accessibilityRole="link">
              <Text style={styles.requestLink}>Solicitar cadastro operacional ↗</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f4f5f7',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    gap: 22,
    minHeight: '100%',
    paddingBottom: 34,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  versionPill: {
    alignItems: 'center',
    backgroundColor: '#e9eaed',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 8,
    minHeight: 28,
    paddingHorizontal: 14,
  },
  statusDot: {
    backgroundColor: '#e7282f',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  versionText: {
    color: '#575b64',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  logoBox: {
    alignItems: 'center',
    backgroundColor: '#181c1f',
    borderRadius: 16,
    elevation: 8,
    height: 48,
    justifyContent: 'center',
    shadowColor: '#14171a',
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    width: 48,
  },
  logoLight: {
    backgroundColor: '#ef2a31',
    borderRadius: 3,
    height: 6,
    position: 'absolute',
    right: 10,
    top: 10,
    width: 6,
  },
  trainFace: {
    borderColor: '#f7f7f7',
    borderRadius: 5,
    borderWidth: 1.8,
    flexDirection: 'row',
    gap: 3,
    height: 15,
    padding: 3,
    width: 19,
  },
  trainWindow: {
    backgroundColor: '#f7f7f7',
    borderRadius: 2,
    flex: 1,
  },
  trainRails: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 4,
  },
  rail: {
    backgroundColor: '#f7f7f7',
    borderRadius: 2,
    height: 10,
    transform: [{ rotate: '24deg' }],
    width: 2,
  },
  brandNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  brandName: {
    color: '#1b1f24',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  brandDot: {
    backgroundColor: '#e7282f',
    borderRadius: 3,
    height: 6,
    marginTop: 2,
    width: 6,
  },
  brandSubtitle: {
    color: '#68707a',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 1,
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 36,
    elevation: 10,
    maxWidth: 390,
    paddingHorizontal: 24,
    paddingVertical: 26,
    shadowColor: '#c8cdd4',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    width: '100%',
  },
  title: {
    color: '#1d2128',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#777d87',
    fontSize: 13,
    marginTop: 5,
  },
  fieldBlock: {
    marginTop: 24,
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: '#242830',
    fontSize: 13,
    fontWeight: '800',
  },
  forgotPassword: {
    color: '#626771',
    fontSize: 11,
    fontWeight: '700',
  },
  inputShell: {
    alignItems: 'center',
    backgroundColor: '#f0f1f3',
    borderColor: '#e3e4e7',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 22,
    marginTop: 7,
    paddingHorizontal: 12,
  },
  inputIcon: {
    color: '#4d535e',
    fontSize: 11,
    fontWeight: '900',
    marginRight: 11,
    minWidth: 18,
    textAlign: 'center',
  },
  input: {
    color: '#171a20',
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    height: 36,
    padding: 0,
  },
  eyeButton: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    width: 28,
  },
  eyeShape: {
    alignItems: 'center',
    borderColor: '#69717b',
    borderRadius: 9,
    borderWidth: 1.4,
    height: 13,
    justifyContent: 'center',
    width: 20,
  },
  eyePupil: {
    backgroundColor: '#69717b',
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  eyeSlash: {
    backgroundColor: '#69717b',
    borderRadius: 2,
    height: 2,
    position: 'absolute',
    width: 24,
  },
  securityRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  keepConnectedButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 11,
  },
  switchTrack: {
    backgroundColor: '#1f242a',
    borderRadius: 16,
    height: 25,
    justifyContent: 'center',
    paddingHorizontal: 4,
    width: 41,
  },
  switchTrackOn: {
    backgroundColor: '#e7282f',
  },
  switchThumb: {
    backgroundColor: '#ffffff',
    borderRadius: 9,
    height: 17,
    width: 17,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  keepConnectedText: {
    color: '#686e79',
    fontSize: 13,
    fontWeight: '800',
  },
  sslRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  shieldIcon: {
    color: '#e7282f',
    fontSize: 17,
    fontWeight: '800',
  },
  sslText: {
    color: '#505762',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#e7252d',
    borderRadius: 28,
    elevation: 8,
    flexDirection: 'row',
    gap: 12,
    height: 56,
    justifyContent: 'center',
    marginTop: 28,
    shadowColor: '#e7252d',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  arrowIcon: {
    color: '#ffffff',
    fontSize: 27,
    fontWeight: '400',
    marginTop: -2,
  },
  divider: {
    backgroundColor: '#eceef1',
    height: 1,
    marginTop: 23,
    width: '100%',
  },
  quickAccessTitle: {
    color: '#717680',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 22,
    textAlign: 'center',
  },
  biometricButton: {
    alignItems: 'center',
    backgroundColor: '#f0f1f3',
    borderRadius: 25,
    flexDirection: 'row',
    gap: 12,
    height: 48,
    justifyContent: 'center',
    marginTop: 12,
  },
  biometricButtonPressed: {
    backgroundColor: '#e7e9ed',
  },
  fingerprintIcon: {
    color: '#e7282f',
    fontSize: 22,
    fontWeight: '900',
  },
  biometricText: {
    color: '#1f232a',
    fontSize: 13,
    fontWeight: '900',
  },
  operationArea: {
    alignItems: 'center',
    backgroundColor: '#f0f1f3',
    borderRadius: 28,
    flexDirection: 'row',
    gap: 14,
    maxWidth: 390,
    minHeight: 72,
    paddingHorizontal: 18,
    paddingVertical: 12,
    width: '100%',
  },
  areaIcon: {
    alignItems: 'center',
    backgroundColor: '#e2e4e8',
    borderRadius: 20,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  areaIconText: {
    color: '#1f252d',
    fontSize: 10,
    fontWeight: '900',
  },
  areaContent: {
    flex: 1,
  },
  areaTitle: {
    color: '#20242b',
    fontSize: 13,
    fontWeight: '900',
  },
  areaSubtitle: {
    color: '#7b8089',
    fontSize: 12,
    marginTop: 2,
  },
  areaArrow: {
    color: '#555b65',
    fontSize: 26,
  },
  requestAccess: {
    alignItems: 'center',
    gap: 7,
    marginTop: 2,
  },
  requestMuted: {
    color: '#7b8089',
    fontSize: 12,
  },
  requestLink: {
    color: '#e7282f',
    fontSize: 13,
    fontWeight: '900',
  },
});
