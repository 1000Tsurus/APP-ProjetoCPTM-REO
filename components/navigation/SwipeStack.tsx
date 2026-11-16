import { Stack, CardStyleInterpolators, type StackNavigationOptions } from 'expo-router/js-stack';

export { Stack as SwipeStack };

export const swipeStackOptions: StackNavigationOptions = {
  headerShown: false,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  // Reserve the edge for back navigation so sliders and pagers keep their gestures.
  gestureResponseDistance: 32,
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  cardStyle: { flex: 1, backgroundColor: '#f7f8f9' },
};
