import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/contexts/SessionContext';

type FuncaoOperacional = 'Pátio' | 'Linha' | 'Supervisão';
type CredencialForm = {
  nomeCompleto: string;
  matriculaOuEmail: string;
  funcaoOperacional: FuncaoOperacional;
  baseLotacao: string;
  senha: string;
  confirmarSenha: string;
  termoAceito: boolean;
};
type CredencialPayload = Omit<CredencialForm, 'confirmarSenha'>;
type Feedback = { kind: 'error' | 'info' | 'success'; text: string };

const FUNCOES: readonly FuncaoOperacional[] = ['Pátio', 'Linha', 'Supervisão'];
const BASES: readonly string[] = [
  'Pátio Sul • Terminal Carajás',
  'Base de Linha',
  'Centro de Supervisão',
];

export default function CadastroScreen() {
  const { startSession } = useSession();
  const [nomeCompleto, setNomeCompleto] = useState<CredencialForm['nomeCompleto']>('');
  const [matriculaOuEmail, setMatriculaOuEmail] = useState<CredencialForm['matriculaOuEmail']>('');
  const [funcaoOperacional, setFuncaoOperacional] = useState<FuncaoOperacional>('Pátio');
  const [baseLotacao, setBaseLotacao] = useState<CredencialForm['baseLotacao']>('');
  const [senha, setSenha] = useState<CredencialForm['senha']>('');
  const [confirmarSenha, setConfirmarSenha] = useState<CredencialForm['confirmarSenha']>('');
  const [termoAceito, setTermoAceito] = useState<CredencialForm['termoAceito']>(false);
  const [loading, setLoading] = useState(false);
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [baseAberta, setBaseAberta] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSalvar(): Promise<void> {
    if (loading) return;
    const nome = nomeCompleto.trim();
    const identificador = matriculaOuEmail.trim();
    const base = baseLotacao.trim();
    if (!nome || !identificador || !funcaoOperacional || !base || !senha || !confirmarSenha) {
      setFeedback({ kind: 'error', text: 'Preencha todos os campos para solicitar a credencial.' });
      return;
    }
    if (senha.length < 8) {
      setFeedback({ kind: 'error', text: 'A senha deve ter no mínimo 8 caracteres.' });
      return;
    }
    if (senha !== confirmarSenha) {
      setFeedback({ kind: 'error', text: 'As senhas informadas não coincidem.' });
      return;
    }
    if (!termoAceito) {
      setFeedback({ kind: 'error', text: 'Aceite a declaração para continuar.' });
      return;
    }

    const payload: CredencialPayload = {
      nomeCompleto: nome, matriculaOuEmail: identificador, funcaoOperacional,
      baseLotacao: base, senha, termoAceito,
    };
    setFeedback(null);
    setLoading(true);
    try {
      const endpoint = process.env.EXPO_PUBLIC_CREDENTIALS_API_URL;
      if (!endpoint) {
        await startSession({
          nomeCompleto: nome, matriculaOuEmail: identificador,
          funcaoOperacional, baseLotacao: base,
        });
        router.replace('/(tabs)');
        return;
      }
      // Chamada da API: substitua este fetch pelo cliente/endpoint de cadastro do seu backend.
      // Envie a senha somente por HTTPS; a aprovação operacional deve ser feita no servidor.
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error('Falha ao solicitar cadastro.');
      await startSession({
        nomeCompleto: nome, matriculaOuEmail: identificador,
        funcaoOperacional, baseLotacao: base,
      });
      router.replace('/(tabs)');
    } catch {
      setFeedback({
        kind: 'error',
        text: 'Não foi possível enviar a solicitação. Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  }

  function voltar(): void {
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'right', 'bottom', 'left']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <View style={styles.topLine}>
              <View style={styles.versionPill}>
                <View style={styles.redDot} />
                <Text style={styles.versionText}>TERMINAL DE CAMPO • V3.4</Text>
              </View>
              <Text style={styles.secureText}>SISTEMA SEGURO</Text>
            </View>

            <View style={styles.navigationRow}>
              <Pressable
                accessibilityLabel="Voltar para a entrada"
                accessibilityRole="button"
                onPress={voltar}
                style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
                <Ionicons name="chevron-back" size={23} color="#202124" />
              </Pressable>
              <View style={styles.navigationTitle}>
                <Text style={styles.navigationOverline}>CREDENCIAMENTO</Text>
                <Text style={styles.navigationSubtitle}>Novo Operador</Text>
              </View>
              <View style={styles.navigationSpacer} />
            </View>

            <View style={styles.brand}>
              <View style={styles.brandIcon}>
                <View style={styles.markTop} />
                <View style={styles.markMiddle} />
                <View style={styles.markBottom} />
                <View style={styles.markTip} />
              </View>
              <View style={styles.brandNameRow}>
                <Text style={styles.brandName}>RailLog</Text>
                <View style={styles.brandDot} />
              </View>
              <Text style={styles.brandCaption}>INSPECT OS</Text>
              <Text style={styles.title}>Criar credencial técnica</Text>
              <Text style={styles.description}>
                Preencha seus dados para solicitar autorização{'\n'}operacional à malha ferroviária.
              </Text>
            </View>

            <View style={styles.approvalCard}>
              <View style={styles.approvalIconBox}>
                <Ionicons name="shield-checkmark-outline" size={19} color="#e72727" />
              </View>
              <View style={styles.approvalCopy}>
                <Text style={styles.approvalTitle}>Perfil operacional</Text>
                <Text style={styles.approvalDescription}>
                  {process.env.EXPO_PUBLIC_CREDENTIALS_API_URL
                    ? 'O cadastro não substitui a liberação operacional da supervisão.'
                    : 'Modo demonstrativo: conheça o painel com seu nome e sua base. Nenhuma credencial será enviada.'}
                </Text>
              </View>
            </View>

            <View style={styles.formCard}>
              {feedback && (
                <View
                  accessibilityRole="alert"
                  style={[
                    styles.feedback,
                    feedback.kind === 'error' ? styles.feedbackError : styles.feedbackInfo,
                  ]}>
                  <Text style={styles.feedbackText}>{feedback.text}</Text>
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Nome Completo</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="person-outline" size={17} color="#a1a3a5" />
                  <TextInput
                    accessibilityLabel="Nome completo"
                    autoCapitalize="words"
                    autoComplete="name"
                    onChangeText={setNomeCompleto}
                    placeholder="Ex: Carlos Eduardo Silveira"
                    placeholderTextColor="#292b2e"
                    style={styles.input}
                    textContentType="name"
                    value={nomeCompleto}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <View style={styles.labelLine}>
                  <Text style={styles.label}>Matrícula ou E-mail Corporativo</Text>
                  <Text style={styles.fieldHint}>PADRÃO RL-XXXX</Text>
                </View>
                <View style={styles.inputShell}>
                  <Ionicons name="id-card-outline" size={17} color="#a1a3a5" />
                  <TextInput
                    accessibilityLabel="Matrícula ou e-mail corporativo"
                    autoCapitalize="none"
                    autoComplete="username"
                    autoCorrect={false}
                    onChangeText={setMatriculaOuEmail}
                    placeholder="RL-9024 ou operador@raillog.com"
                    placeholderTextColor="#292b2e"
                    style={styles.input}
                    value={matriculaOuEmail}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Função Técnica Operacional</Text>
                <View style={styles.segmentedControl}>
                  {FUNCOES.map((funcao) => (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: funcaoOperacional === funcao }}
                      key={funcao}
                      onPress={() => setFuncaoOperacional(funcao)}
                      style={[
                        styles.segment,
                        funcaoOperacional === funcao && styles.segmentSelected,
                      ]}>
                      <Text
                        style={[
                          styles.segmentText,
                          funcaoOperacional === funcao && styles.segmentTextSelected,
                        ]}>
                        {funcao}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Base / Pátio de Lotação</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="location-outline" size={18} color="#a1a3a5" />
                  <TextInput
                    accessibilityLabel="Base de lotação"
                    onChangeText={setBaseLotacao}
                    placeholder="Pátio Sul • Terminal Carajás"
                    placeholderTextColor="#282a2e"
                    style={styles.selectedBase}
                    value={baseLotacao}
                  />
                  <Pressable
                    accessibilityLabel="Selecionar base de lotação"
                    accessibilityRole="button"
                    accessibilityState={{ expanded: baseAberta }}
                    hitSlop={8}
                    onPress={() => setBaseAberta((value) => !value)}>
                    <Ionicons
                      name={baseAberta ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#808488"
                    />
                  </Pressable>
                </View>
                {baseAberta && (
                  <View style={styles.baseMenu}>
                    {BASES.map((base) => (
                      <Pressable
                        accessibilityRole="button"
                        key={base}
                        onPress={() => {
                          setBaseLotacao(base);
                          setBaseAberta(false);
                        }}
                        style={styles.baseOption}>
                        <Text style={styles.baseOptionText}>{base}</Text>
                        {baseLotacao === base && <Ionicons name="checkmark" size={17} color="#e72727" />}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Senha de Acesso</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="lock-closed-outline" size={17} color="#a1a3a5" />
                  <TextInput
                    accessibilityLabel="Senha de acesso"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setSenha}
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor="#292b2e"
                    secureTextEntry={!senhaVisivel}
                    style={styles.input}
                    textContentType="newPassword"
                    value={senha}
                  />
                  <Pressable
                    accessibilityLabel={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                    accessibilityRole="button"
                    hitSlop={10}
                    onPress={() => setSenhaVisivel((value) => !value)}>
                    <Ionicons
                      name={senhaVisivel ? 'eye-off-outline' : 'eye-outline'}
                      size={19}
                      color="#a1a3a5"
                    />
                  </Pressable>
                </View>
              </View>

              <View style={styles.lastField}>
                <Text style={styles.label}>Confirmar Senha</Text>
                <View style={styles.inputShell}>
                  <Ionicons name="checkmark-circle-outline" size={17} color="#a1a3a5" />
                  <TextInput
                    accessibilityLabel="Confirmar senha"
                    autoCapitalize="none"
                    autoComplete="new-password"
                    onChangeText={setConfirmarSenha}
                    placeholder="Repita sua senha"
                    placeholderTextColor="#292b2e"
                    secureTextEntry
                    style={styles.input}
                    textContentType="newPassword"
                    value={confirmarSenha}
                  />
                </View>
              </View>

              <Pressable
                accessibilityLabel="Declaro que os dados são verídicos"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: termoAceito }}
                onPress={() => setTermoAceito((value) => !value)}
                style={styles.termsRow}>
                <View style={[styles.checkbox, termoAceito && styles.checkboxChecked]}>
                  {termoAceito && <Ionicons name="checkmark" size={13} color="#ffffff" />}
                </View>
                <Text style={styles.termsText}>
                  Declaro que os dados fornecidos são verídicos e destinados estritamente às operações de fiscalização técnica da malha.
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}
                onPress={() => void handleSalvar()}
                style={({ pressed }) => [
                  styles.submitButton,
                  (pressed || loading) && styles.submitButtonPressed,
                ]}>
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.submitText}>Solicitar Cadastro Operacional</Text>
                    <Ionicons name="arrow-forward" size={19} color="#ffffff" />
                  </>
                )}
              </Pressable>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerQuestion}>Já possui credencial autorizada?</Text>
              <Pressable onPress={() => router.replace('/login')} accessibilityRole="link">
                <Text style={styles.footerLink}>Acessar o Terminal de Entrada</Text>
              </Pressable>
              <View style={styles.securityNote}>
                <Ionicons name="lock-closed-outline" size={14} color="#a2a5a8" />
                <Text style={styles.securityNoteText}>Criptografia Ponta a Ponta • Padrão ABNT Ferroviário</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f5f6f7' },
  keyboardView: { flex: 1 },
  scrollContent: {
    alignItems: 'center', flexGrow: 1, paddingBottom: 22,
    paddingHorizontal: 16, paddingTop: 16,
  },
  content: { maxWidth: 390, width: '100%' },
  topLine: {
    alignItems: 'center', flexDirection: 'row',
    justifyContent: 'space-between', paddingHorizontal: 4,
  },
  versionPill: {
    alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 18,
    flexDirection: 'row', gap: 7, minHeight: 26, paddingHorizontal: 12,
    shadowColor: '#ccd0d3', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18, shadowRadius: 8,
  },
  redDot: { backgroundColor: '#ec5254', borderRadius: 4, height: 8, width: 8 },
  versionText: { color: '#56585b', fontSize: 11, fontWeight: '700', letterSpacing: 0.25 },
  secureText: { color: '#a1a3a6', fontSize: 10, fontWeight: '800', letterSpacing: 0.35 },
  navigationRow: {
    alignItems: 'center', flexDirection: 'row',
    justifyContent: 'space-between', marginTop: 17, paddingHorizontal: 4,
  },
  backButton: {
    alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e8e9ea',
    borderRadius: 15, borderWidth: 1, height: 44, justifyContent: 'center',
    shadowColor: '#c6c8ca', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14, shadowRadius: 8, width: 44,
  },
  navigationTitle: { alignItems: 'center' },
  navigationOverline: {
    color: '#a2a3a5', fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
  },
  navigationSubtitle: { color: '#292a2d', fontSize: 12, fontWeight: '700', marginTop: 2 },
  navigationSpacer: { width: 44 },
  pressed: { opacity: 0.75 },
  brand: { alignItems: 'center', marginTop: 24 },
  brandIcon: {
    alignItems: 'flex-start', backgroundColor: '#111316', borderRadius: 16,
    height: 56, justifyContent: 'center', paddingLeft: 17,
    shadowColor: '#0e1012', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2, shadowRadius: 8, width: 56,
  },
  markTop: {
    backgroundColor: '#ffffff', borderRadius: 2, height: 2.5,
    marginBottom: 5, width: 21,
  },
  markMiddle: {
    backgroundColor: '#ffffff', borderRadius: 2, height: 2.5,
    marginBottom: 5, width: 21,
  },
  markBottom: { backgroundColor: '#ffffff', borderRadius: 2, height: 2.5, width: 13 },
  markTip: {
    borderRightColor: '#ffffff', borderRightWidth: 2.5,
    borderTopColor: '#ffffff', borderTopWidth: 2.5, height: 5,
    left: 35, position: 'absolute', top: 33,
    transform: [{ rotate: '45deg' }], width: 5,
  },
  brandNameRow: {
    alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 14,
  },
  brandName: {
    color: '#1f2023', fontSize: 24, fontWeight: '900',
    letterSpacing: -1.1, lineHeight: 27,
  },
  brandDot: {
    alignSelf: 'flex-start', backgroundColor: '#e72727',
    borderRadius: 4, height: 8, marginTop: 5, width: 8,
  },
  brandCaption: {
    color: '#a0a2a4', fontSize: 10, fontWeight: '900',
    letterSpacing: 2.6, marginTop: 1,
  },
  title: {
    color: '#232427', fontSize: 20, fontWeight: '700',
    letterSpacing: -0.45, marginTop: 10,
  },
  description: {
    color: '#85878b', fontSize: 13, lineHeight: 19,
    marginTop: 5, textAlign: 'center',
  },
  approvalCard: {
    alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e8e9eb',
    borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 12,
    marginTop: 12, minHeight: 76, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#c7c9cc', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16, shadowRadius: 13,
  },
  approvalIconBox: {
    alignItems: 'center', backgroundColor: '#f7f7f7',
    borderColor: '#eeeeef', borderRadius: 12, borderWidth: 1,
    height: 38, justifyContent: 'center', width: 38,
  },
  approvalCopy: { flex: 1 },
  approvalTitle: { color: '#242528', fontSize: 12, fontWeight: '700' },
  approvalDescription: {
    color: '#8d8e91', fontSize: 11.5, lineHeight: 15, marginTop: 3,
  },
  formCard: {
    backgroundColor: '#ffffff', borderColor: '#e8e9eb',
    borderRadius: 32, borderWidth: 1, marginTop: 16,
    paddingBottom: 20, paddingHorizontal: 20, paddingTop: 24,
    shadowColor: '#d4d6d8', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22, shadowRadius: 24,
  },
  feedback: {
    borderRadius: 12, marginBottom: 18, paddingHorizontal: 13, paddingVertical: 11,
  },
  feedbackError: { backgroundColor: '#fff0ef' },
  feedbackInfo: { backgroundColor: '#f0f2f4' },
  feedbackText: { color: '#4b4d50', fontSize: 12, lineHeight: 17 },
  field: { marginBottom: 15 },
  lastField: { marginBottom: 0 },
  label: { color: '#47484b', fontSize: 12.5, fontWeight: '600' },
  labelLine: {
    alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between',
  },
  fieldHint: { color: '#afb0b2', fontSize: 9, fontWeight: '800' },
  inputShell: {
    alignItems: 'center', backgroundColor: '#f0f1f3', borderRadius: 16,
    flexDirection: 'row', gap: 10, height: 43, marginTop: 7, paddingHorizontal: 14,
  },
  input: { color: '#282a2e', flex: 1, fontSize: 14, height: '100%', padding: 0 },
  segmentedControl: {
    backgroundColor: '#f6f6f6', borderColor: '#ececed', borderRadius: 15,
    borderWidth: 1, flexDirection: 'row', height: 43, marginTop: 7, padding: 4,
  },
  segment: {
    alignItems: 'center', borderRadius: 11, flex: 1, justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: '#111316' },
  segmentText: { color: '#505155', fontSize: 11, fontWeight: '700' },
  segmentTextSelected: { color: '#ffffff', fontWeight: '700' },
  selectedBase: {
    color: '#282a2e', flex: 1, fontSize: 14, height: '100%', padding: 0,
  },
  baseMenu: {
    backgroundColor: '#f8f8f9', borderColor: '#eeeeef', borderRadius: 14,
    borderWidth: 1, marginTop: 5, paddingHorizontal: 10,
  },
  baseOption: {
    alignItems: 'center', flexDirection: 'row',
    justifyContent: 'space-between', minHeight: 40, paddingHorizontal: 5,
  },
  baseOptionText: { color: '#44464a', fontSize: 13 },
  termsRow: {
    alignItems: 'flex-start', flexDirection: 'row', gap: 10,
    marginTop: 25, paddingRight: 5,
  },
  checkbox: {
    alignItems: 'center', borderColor: '#d0d2d4', borderRadius: 5,
    borderWidth: 1, height: 16, justifyContent: 'center', marginTop: 1, width: 16,
  },
  checkboxChecked: { backgroundColor: '#e72727', borderColor: '#e72727' },
  termsText: { color: '#8d8f92', flex: 1, fontSize: 11.5, lineHeight: 16 },
  submitButton: {
    alignItems: 'center', backgroundColor: '#e52528', borderRadius: 30,
    flexDirection: 'row', gap: 9, height: 56, justifyContent: 'center',
    marginTop: 27, shadowColor: '#e52528',
    shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.27, shadowRadius: 14,
  },
  submitButtonPressed: { opacity: 0.8 },
  submitText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 31 },
  footerQuestion: { color: '#8e9093', fontSize: 12 },
  footerLink: {
    color: '#e72727', fontSize: 12, fontWeight: '800', marginTop: 7,
  },
  securityNote: {
    alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 26,
  },
  securityNoteText: { color: '#a2a4a7', fontSize: 10, fontWeight: '700' },
});
