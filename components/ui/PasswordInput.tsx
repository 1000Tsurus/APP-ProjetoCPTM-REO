import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';

import { COLOR, MIN_TOUCH } from '@/constants/theme';
import { fieldInputStyle } from './Field';

/** Campo de senha com botão de olho para mostrar o que foi digitado. */
export function PasswordInput({ style, onFocus, onBlur, ...rest }: TextInputProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <TextInput
        placeholderTextColor={COLOR.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        {...rest}
        secureTextEntry={!visible}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[fieldInputStyle, styles.input, focused ? styles.focused : null, style]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
        onPress={() => setVisible((v) => !v)}
        style={styles.eye}
      >
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLOR.textDim} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: 'center' },
  input: { paddingRight: MIN_TOUCH },
  focused: { borderColor: COLOR.red },
  eye: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
