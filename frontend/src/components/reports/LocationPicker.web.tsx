/// <reference lib="dom" />
// @ts-ignore
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import { COLORS } from '../../constants/theme';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface Props {
  center: { lat: number; lng: number };
  onLocationPick: (loc: { lat: number; lng: number }) => void;
}

function ClickHandler({ onLocationPick }: { onLocationPick: (loc: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onLocationPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function FlyToCenter({ center }: { center: { lat: number; lng: number } }) {
  const map = useMapEvents({} as any);
  const prevCenter = useRef(center);

  useEffect(() => {
    if (prevCenter.current.lat !== center.lat || prevCenter.current.lng !== center.lng) {
      map.flyTo([center.lat, center.lng], 17);
      prevCenter.current = center;
    }
  }, [center, map]);

  return null;
}

export default function LocationPicker({ center, onLocationPick }: Props) {
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  const handleClick = (loc: { lat: number; lng: number }) => {
    setPin(loc);
    onLocationPick(loc);
  };

  return (
    <View style={s.container}>
      <Text style={s.hint}>Tap on the map to drop a pin</Text>
      <View style={s.mapWrap}>
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={17}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onLocationPick={handleClick} />
          <FlyToCenter center={center} />
          {pin && <Marker position={[pin.lat, pin.lng]} />}
        </MapContainer>
      </View>
      {pin && (
        <Text style={s.coords}>
          {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
        </Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { marginTop: 10 },
  hint: { fontSize: 12, color: COLORS.gray500, marginBottom: 6 },
  mapWrap: { height: 250, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.gray300 },
  coords: { fontSize: 13, color: COLORS.gray600, marginTop: 6, fontFamily: 'monospace' },
});
