import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

interface LocationState {
  location: { lat: number; lng: number } | null;
  loading: boolean;
  permissionDenied: boolean;
  error: string;
}

const INITIAL: LocationState = { location: null, loading: true, permissionDenied: false, error: '' };

export function useLocation() {
  const [state, setState] = useState<LocationState>(INITIAL);

  async function fetchLocation() {
    setState(prev => ({ ...prev, loading: true, error: '' }));
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      setState({ location: null, loading: false, permissionDenied: true, error: '' });
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setState({
        location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        loading: false,
        permissionDenied: false,
        error: '',
      });
    } catch {
      setState(prev => ({ ...prev, loading: false, error: 'Could not get location. Please try again.' }));
    }
  }

  useEffect(() => { fetchLocation(); }, []);

  return { ...state, refetch: fetchLocation };
}
