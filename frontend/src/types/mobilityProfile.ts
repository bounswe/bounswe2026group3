export type MobilityAidType =
  | 'WHEELCHAIR'
  | 'ELECTRIC_WHEELCHAIR'
  | 'WALKER'
  | 'CRUTCHES'
  | 'STROLLER'
  | 'HAND_CART'
  | 'NONE';

export interface MobilityProfile {
  profileId: string;
  mobilityAid: MobilityAidType;
  avoidStairs: boolean;
  avoidSteepSlopes: boolean;
  maxSlopeGradient: number | null;
  createdAt: string;
}

export interface MobilityProfilePayload {
  mobilityAid: MobilityAidType;
  avoidStairs: boolean;
  avoidSteepSlopes: boolean;
  maxSlopeGradient: number | null;
}
