import { Pressable, ScrollView, StyleSheet } from "react-native";

import { Text, View, useThemeColor } from "@/components/Themed";
import { addDays, formatStripDate, formatStripDay, isSameDate, toDateParam } from "@/lib/dates";

const DAYS_BEFORE = 3;
const DAYS_AFTER = 3;

export function DateStrip({
  selected,
  today,
  onSelect,
}: {
  selected: Date;
  today: Date;
  onSelect: (date: Date) => void;
}) {
  const tint = useThemeColor({}, "tint");
  const dates = Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, i) =>
    addDays(today, i - DAYS_BEFORE),
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container}>
      {dates.map((date) => {
        const isToday = isSameDate(date, today);
        const isSelected = isSameDate(date, selected);
        return (
          <Pressable
            key={toDateParam(date)}
            onPress={() => onSelect(date)}
            style={[styles.pill, isSelected ? { backgroundColor: tint } : null]}
          >
            <Text style={[styles.day, isSelected ? styles.selectedText : null]}>
              {isToday ? "Today" : formatStripDay(date)}
            </Text>
            <Text style={[styles.date, isSelected ? styles.selectedText : null]}>
              {formatStripDate(date)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 0, paddingVertical: 8 },
  pill: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 4,
    minWidth: 64,
  },
  day: { fontSize: 13, fontWeight: "600" },
  date: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  selectedText: { color: "#fff", opacity: 1 },
});
