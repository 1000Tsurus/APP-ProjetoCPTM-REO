import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusStrip } from '@/components/StatusStrip';
import { SwipeStack as Stack, swipeStackOptions } from '@/components/navigation/SwipeStack';
import { COLOR } from '@/constants/theme';
import { useSession } from '@/contexts/SessionContext';

/**
 * Área logada (abas e telas empilhadas): sem sessão volta ao login; com sessão, a faixa de status
 * fica no topo de todas as telas e é ela quem consome o recuo superior da tela.
 */
export default function OperationLayout() {
  const { user } = useSession();
  if (!user) return <Redirect href="/login" />;
  return (
    <View style={{ flex: 1, backgroundColor: COLOR.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: COLOR.panel }}>
        <StatusStrip />
      </SafeAreaView>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={swipeStackOptions} />
      </View>
    </View>
  );
}
