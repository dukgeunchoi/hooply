import { Tabs } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ColorValue } from "react-native";

import { useClientOnlyValue } from "@/components/useClientOnlyValue";
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

function TabIcon({ name, color }: { name: SymbolViewProps["name"]; color: ColorValue }) {
  return <SymbolView name={name} tintColor={color} size={28} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        // Disable the static render of the header on web
        // to prevent a hydration error in React Navigation v6.
        headerShown: useClientOnlyValue(false, true),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Scores",
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{
                ios: "sportscourt.fill",
                android: "sports_basketball",
                web: "sports_basketball",
              }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        options={{
          title: "Leagues",
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: "trophy.fill", android: "emoji_events", web: "emoji_events" }}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="following"
        options={{
          title: "Following",
          tabBarIcon: ({ color }) => (
            <TabIcon name={{ ios: "star.fill", android: "star", web: "star" }} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => (
            <TabIcon
              name={{ ios: "magnifyingglass", android: "search", web: "search" }}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
