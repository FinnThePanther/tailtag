import { StyleSheet, Text, View } from "react-native";

import { Ionicons } from "@expo/vector-icons";

import { colors, spacing } from "../../../theme";
import {
  PasswordStrength,
  validatePassword,
} from "../../../utils/authValidation";

const STRENGTH_COLORS: Record<PasswordStrength, string> = {
  weak: colors.destructive,
  fair: colors.amber,
  good: colors.primary,
  strong: "#4ade80",
};

const STRENGTH_LABELS: Record<PasswordStrength, string> = {
  weak: "Weak",
  fair: "Fair",
  good: "Good",
  strong: "Strong",
};

const REQUIREMENTS = [
  { key: "minLength" as const, label: "At least 8 characters" },
  { key: "hasUppercase" as const, label: "Uppercase letter" },
  { key: "hasLowercase" as const, label: "Lowercase letter" },
  { key: "hasNumber" as const, label: "Number" },
  { key: "hasSpecial" as const, label: "Special character (!@#$…)" },
];

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({
  password,
}: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const { strength, score, requirements } = validatePassword(password);
  const activeColor = STRENGTH_COLORS[strength];

  return (
    <View style={styles.container}>
      {/* Segmented strength bar */}
      <View style={styles.bar}>
        {[1, 2, 3, 4, 5].map((segment) => (
          <View
            key={segment}
            style={[
              styles.segment,
              { backgroundColor: score >= segment ? activeColor : "rgba(148,163,184,0.2)" },
            ]}
          />
        ))}
        <Text style={[styles.strengthLabel, { color: activeColor }]}>
          {STRENGTH_LABELS[strength]}
        </Text>
      </View>

      {/* Requirements checklist */}
      <View style={styles.checklist}>
        {REQUIREMENTS.map(({ key, label }) => {
          const met = requirements[key];
          return (
            <View key={key} style={styles.checkItem}>
              <Ionicons
                name={met ? "checkmark-circle" : "ellipse-outline"}
                size={14}
                color={met ? "#4ade80" : "rgba(148,163,184,0.5)"}
              />
              <Text style={[styles.checkLabel, met && styles.checkLabelMet]}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
    minWidth: 44,
  },
  checklist: {
    gap: 5,
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkLabel: {
    fontSize: 12,
    color: "rgba(148,163,184,0.6)",
  },
  checkLabelMet: {
    color: "rgba(148,163,184,0.9)",
  },
});
