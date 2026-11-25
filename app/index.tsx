import { Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader, Button, Field, Label, Panel, PasswordInput, SectionTitle } from '@/components/ui';
import { COLOR, FONT_SIZE, SPACE } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';
import { errorMessage } from '@/data/api/client';

/** Tela de login: matrícula ou e-mail + senha na API. Sem biometria nem "manter conectado". */
export default function LoginScreen() {
  const { user, ready, signIn } = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Só mostra o formulário depois de restore(): um resultado tardio não pode apagar um login novo.
  if (!ready) {
    return (
      <View style={styles.loading} accessibilityLabel="Carregando">
        <ActivityIndicator color={COLOR.red} />
      </View>
    );
  }
  if (user) return <Redirect href="/(tabs)/(pages)" />;

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await signIn(identifier, password);
    } catch (e) {
      // invalid_credentials / inactive_user trazem o detail da API; falha de rede cai na mensagem padrão.
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <SafeAreaView edges={['top']} style={styles.hero}>
          <BrandHeader onDark />
        </SafeAreaView>
        <View style={styles.body}>
          <Panel style={styles.form}>
            <SectionTitle icon="log-in-outline" title="Entrar" />
            <Field
              label="Matrícula ou e-mail"
              mono
              value={identifier}
              onChangeText={setIdentifier}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              returnKeyType="next"
            />
            <View style={styles.password}>
              <Label>Senha</Label>
              <PasswordInput
                accessibilityLabel="Senha"
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={submit}
                returnKeyType="go"
              />
            </View>
            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}
            <Button title={busy ? 'Entrando…' : 'Entrar'} onPress={submit} disabled={!canSubmit} />
          </Panel>
          <Panel>
            <Text style={styles.firstTitle}>Primeiro acesso?</Text>
            <Text style={styles.firstText}>
              O convite vem do administrador, por e-mail. Aceite pelo link recebido e depois entre aqui com a sua
              matrícula e a senha que você criou.
            </Text>
          </Panel>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLOR.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLOR.bg },
  scroll: { flexGrow: 1 },
  hero: { backgroundColor: COLOR.red, paddingHorizontal: SPACE.lg, paddingTop: SPACE.xl, paddingBottom: 40 },
  body: { padding: SPACE.lg, gap: SPACE.md, marginTop: -24 },
  form: { gap: SPACE.md },
  password: { gap: 6 },
  error: { color: COLOR.red, fontSize: FONT_SIZE.small },
  firstTitle: { fontSize: FONT_SIZE.base, fontWeight: '600', color: COLOR.text, marginBottom: 4 },
  firstText: { fontSize: FONT_SIZE.small, color: COLOR.textDim, lineHeight: 20 },
});
