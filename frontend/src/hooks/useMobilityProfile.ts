import { useState, useEffect, useCallback } from 'react';
import {
  getMobilityProfile,
  createMobilityProfile,
  updateMobilityProfile,
} from '../api/mobilityProfile';
import { MobilityProfile, MobilityProfilePayload } from '../types/mobilityProfile';

export function useMobilityProfile() {
  const [profile, setProfile] = useState<MobilityProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getMobilityProfile();
      setProfile(data);
    } catch {
      setError('Failed to load mobility profile.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(payload: MobilityProfilePayload): Promise<void> {
    const result = profile
      ? await updateMobilityProfile(payload)
      : await createMobilityProfile(payload);
    setProfile(result);
  }

  return { profile, loading, error, save, reload: load };
}
