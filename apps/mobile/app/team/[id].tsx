import { useLocalSearchParams } from "expo-router";

import { PlaceholderScreen } from "@/components/PlaceholderScreen";

export default function TeamPageScreen() {
  const { name } = useLocalSearchParams<{ id: string; name?: string }>();
  return <PlaceholderScreen title={name ?? "Team"} />;
}
