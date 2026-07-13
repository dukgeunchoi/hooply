import { useEffect, useState } from "react";
import { AppState } from "react-native";

// Combined with expo-router's useIsFocused, this is the other half of "all
// polling stops when the screen loses focus" — useIsFocused alone doesn't
// know the app was backgrounded while the Scores tab stayed the active tab.
export function useAppIsActive(): boolean {
  const [isActive, setIsActive] = useState(AppState.currentState === "active");

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setIsActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  return isActive;
}
