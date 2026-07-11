import { Pressable, StyleSheet } from "react-native";

import { Text, View, useThemeColor } from "@/components/Themed";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const tint = useThemeColor({}, "tint");

  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            style={[
              styles.segment,
              selected ? { borderBottomColor: tint, borderBottomWidth: 2 } : null,
            ]}
            onPress={() => onChange(opt.value)}
          >
            <Text style={[styles.label, selected ? { color: tint, fontWeight: "700" } : null]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row" },
  segment: { flex: 1, alignItems: "center", paddingVertical: 10 },
  label: { fontSize: 14, fontWeight: "600" },
});
