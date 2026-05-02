import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { COLORS } from '../../constants/theme';

export interface TrustedContributorBadgeProps {
  size?: number;
  testID?: string;
  label?: string;
}

export function TrustedContributorBadge({
  size = 18,
  testID = 'trusted-contributor-badge',
  label = 'Trusted Contributor',
}: TrustedContributorBadgeProps) {
  return (
    <View
      testID={testID}
      accessibilityRole="text"
      accessibilityLabel={label}
      style={s.pill}
    >
      <Svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        testID={`${testID}-svg`}
      >
        <Defs>
          <LinearGradient id="tcShield" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLORS.green500} />
            <Stop offset="1" stopColor={COLORS.green700} />
          </LinearGradient>
        </Defs>
        {/* Shield outline */}
        <Path
          d="M12 1.5 4 4.6v6.3c0 4.7 3.3 9 8 11.6 4.7-2.6 8-6.9 8-11.6V4.6L12 1.5z"
          fill="url(#tcShield)"
          stroke={COLORS.green800}
          strokeWidth={0.6}
        />
        {/* Inner ring */}
        <Circle cx="12" cy="11" r="4.6" fill={COLORS.white} opacity={0.95} />
        {/* Checkmark */}
        <Path
          d="M9.4 11.2l1.7 1.8 3.5-3.7"
          fill="none"
          stroke={COLORS.green700}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Text style={s.label}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: COLORS.green100,
    borderWidth: 1,
    borderColor: COLORS.green200,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.green800,
    letterSpacing: 0.2,
  },
});
