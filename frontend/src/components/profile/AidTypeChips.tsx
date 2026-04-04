import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { MobilityAidType } from '../../types/mobilityProfile';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type MCIconName  = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface AidOption {
  value: MobilityAidType;
  label: string;
  icon: IoniconName | MCIconName;
  iconLib?: 'MCIcon'; // omit for Ionicons (default)
}

const AID_OPTIONS: AidOption[] = [
  { value: 'WHEELCHAIR',          label: 'Wheelchair',   icon: 'wheelchair-accessibility', iconLib: 'MCIcon' },
  { value: 'ELECTRIC_WHEELCHAIR', label: 'Elec. Chair',  icon: 'flash-outline' },
  { value: 'WALKER',              label: 'Walker',       icon: 'walk-outline' },
  { value: 'CRUTCHES',            label: 'Crutches',     icon: 'medical-outline' },
  { value: 'STROLLER',            label: 'Stroller',     icon: 'happy-outline' },
  { value: 'HAND_CART',           label: 'Hand Cart',    icon: 'cart-outline' },
];

function ChipIcon({
  icon,
  iconLib,
  color,
  size,
}: {
  icon: IoniconName | MCIconName;
  iconLib?: 'MCIcon';
  color: string;
  size: number;
}) {
  if (iconLib === 'MCIcon') {
    return <MaterialCommunityIcons name={icon as MCIconName} size={size} color={color} />;
  }
  return <Ionicons name={icon as IoniconName} size={size} color={color} />;
}

const NONE_OPTION: AidOption = {
  value: 'NONE',
  label: 'No Mobility Aid',
  icon: 'person-outline',
};

const ALL_OPTIONS: AidOption[] = [...AID_OPTIONS, NONE_OPTION];

interface Props {
  selected: MobilityAidType;
  onChange: (value: MobilityAidType) => void;
  disabled?: boolean;
  viewOnly?: boolean;
}

export function AidTypeChips({ selected, onChange, disabled = false, viewOnly = false }: Props) {
  if (viewOnly) {
    const opt = ALL_OPTIONS.find(o => o.value === selected) ?? NONE_OPTION;
    return (
      <View style={s.viewBadge}>
        <ChipIcon
          icon={opt.icon}
          iconLib={opt.iconLib}
          size={20}
          color={COLORS.white}
        />
        <Text style={s.viewBadgeLabel}>{opt.label}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={s.grid}>
        {AID_OPTIONS.map(opt => {
          const active = selected === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              testID={`chip-${opt.value}`}
              style={[s.chip, active && s.chipActive]}
              onPress={() => !disabled && onChange(opt.value)}
              activeOpacity={disabled ? 1 : 0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={opt.label}
            >
              <ChipIcon
                icon={opt.icon}
                iconLib={opt.iconLib}
                size={22}
                color={active ? COLORS.white : COLORS.gray600}
              />
              <Text
                style={[s.chipLabel, active && s.chipLabelActive]}
                numberOfLines={2}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* "None" spans full width to visually signal it is a reset option */}
      <TouchableOpacity
        testID="chip-NONE"
        style={[s.noneChip, selected === 'NONE' && s.chipActive]}
        onPress={() => !disabled && onChange('NONE')}
        activeOpacity={disabled ? 1 : 0.7}
        accessibilityRole="radio"
        accessibilityState={{ checked: selected === 'NONE' }}
        accessibilityLabel="No Mobility Aid"
      >
        <Ionicons
          name="person-outline"
          size={18}
          color={selected === 'NONE' ? COLORS.white : COLORS.gray500}
        />
        <Text style={[s.noneLabel, selected === 'NONE' && s.chipLabelActive]}>
          No Mobility Aid
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  viewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    backgroundColor: COLORS.green700,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 4,
  },
  viewBadgeLabel: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  chip: {
    width: '31%',
    minHeight: 80,
    backgroundColor: COLORS.gray50,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 6,
  },
  chipActive: {
    backgroundColor: COLORS.green700,
    borderColor: COLORS.green700,
  },
  chipLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gray600,
    textAlign: 'center',
    lineHeight: 14,
  },
  chipLabelActive: {
    color: COLORS.white,
  },
  noneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.gray50,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: COLORS.gray300,
    borderRadius: 12,
    paddingVertical: 12,
  },
  noneLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray500,
  },
});
