import NetInfo from "@react-native-community/netinfo";
import { QueryClient, onlineManager } from "@tanstack/react-query";

// TanStack Query assumes web's navigator.onLine by default, which doesn't
// exist on native — wire it to NetInfo so offline state (cached data +
// banner, no retry storms) actually works on device.
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(Boolean(state.isConnected));
  });
});

export const queryClient = new QueryClient();
