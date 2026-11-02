import { useColors } from "@/styles/theme";
import { Text, View } from "react-native";
import { makeStyles } from "./stats-styles";

export function StatCard({
  icon,
  title,
  value,
  unit,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  unit?: string;
}) {
  const colors = useColors();
  const s = makeStyles(colors);
  return (
    <View style={s.statCard}>
      <View style={s.statCardHeader}>
        <Text style={s.statCardTitle}>{title}</Text>
        {icon}
      </View>
      <View style={s.statCardBody}>
        <Text style={s.statCardValue}>{value}</Text>
        {unit && <Text style={s.statCardUnit}>{unit}</Text>}
      </View>
    </View>
  );
}
