/// <reference lib="dom" />
// @ts-ignore
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, ZoomControl, useMapEvents } from 'react-leaflet';

import { fetchObstacleDetail, fetchObstacles, searchLocations, type Obstacle, type ObstacleDetail } from '../../api/map';
import { COLORS } from '../../constants/theme';

// Fix default Leaflet marker icons (broken in bundler environments)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const BOUN_CENTER: [number, number] = [41.0847, 29.0503];
const DEFAULT_ZOOM = 16;
// INDOOR obstacles are only shown above this zoom level
const HIGH_DETAIL_ZOOM = 18;

const CATEGORY_COLOR: Record<string, string> = {
  BROKEN_RAMP: COLORS.red500,
  NARROW_SIDEWALK: COLORS.orange500,
  DAMAGED_SURFACE: COLORS.orange500,
  ROAD_CONSTRUCTION: '#EAB308',
  BLOCKED_PATH: COLORS.red600,
  OTHER: COLORS.gray500,
};

const STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: 'Unverified',
  PASSIVE: 'Passive',
  VERIFIED: 'Verified',
  RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation',
  CLOSED: 'Closed',
};

const STATUS_COLOR: Record<string, string> = {
  UNVERIFIED: COLORS.gray400,
  PASSIVE: COLORS.gray400,
  VERIFIED: COLORS.green500,
  RESOLVED_AWAITING_VALIDATION: COLORS.blue500,
  CLOSED: COLORS.gray500,
};

// ── Sub-components (must live inside MapContainer) ──────────────────────────

function BoundsWatcher({
  onChange,
}: {
  onChange: (b: L.LatLngBounds, z: number) => void;
}) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => {
    onChange(map.getBounds(), map.getZoom());
  }, []);
  return null;
}

function PinDropper({ onDrop }: { onDrop: (ll: L.LatLng) => void }) {
  useMapEvents({ click: (e) => onDrop(e.latlng) });
  return null;
}

// ── Popup content ───────────────────────────────────────────────────────────

function ObstaclePopup({
  obs,
  detail,
  loading,
}: {
  obs: Obstacle;
  detail: ObstacleDetail | undefined;
  loading: boolean;
}) {
  const color = CATEGORY_COLOR[obs.category] ?? COLORS.gray500;
  const statusColor = STATUS_COLOR[obs.status] ?? COLORS.gray400;

  return (
    <div style={{ minWidth: 200, maxWidth: 240, fontFamily: 'system-ui, sans-serif' }}>
      {detail?.photos?.[0] && (
        <img
          src={detail.photos[0].imageUrl}
          alt="obstacle"
          style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 4, marginBottom: 8, display: 'block' }}
        />
      )}

      <strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>{obs.title}</strong>

      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>
        <span style={{ background: color, color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
          {obs.category.replace(/_/g, ' ')}
        </span>
        <span style={{ background: statusColor, color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600 }}>
          {STATUS_LABEL[obs.status] ?? obs.status}
        </span>
      </div>

      {obs.description ? (
        <p style={{ margin: '0 0 6px', fontSize: 12, color: '#444', lineHeight: 1.4 }}>{obs.description}</p>
      ) : null}

      {loading && (
        <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>Loading details…</div>
      )}
      {!loading && detail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#555', fontSize: 12, marginTop: 4, borderTop: '1px solid #eee', paddingTop: 6 }}>
          <span>👍 {detail.upvoteCount ?? 0} upvote{detail.upvoteCount !== 1 ? 's' : ''}</span>
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function MapView() {
  const mapRef = useRef<L.Map | null>(null);

  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [loading, setLoading] = useState(false);
  const [showPassive, setShowPassive] = useState(false);
  const [currentBounds, setCurrentBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const [droppedPin, setDroppedPin] = useState<L.LatLng | null>(null);
  const [query, setQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);

  // Detail cache stored in state so updates trigger re-renders
  const [detailMap, setDetailMap] = useState<Record<string, ObstacleDetail | 'loading'>>({});

  // Re-fetch whenever viewport or passive toggle changes
  useEffect(() => {
    if (!currentBounds) return;
    let cancelled = false;
    setLoading(true);
    fetchObstacles(
      {
        north: currentBounds.getNorth(),
        south: currentBounds.getSouth(),
        east: currentBounds.getEast(),
        west: currentBounds.getWest(),
      },
      showPassive,
    ).then((data) => {
      if (!cancelled) {
        setObstacles(data);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [currentBounds, showPassive]);

  const handleBoundsChange = useCallback((b: L.LatLngBounds, z: number) => {
    setCurrentBounds(b);
    setZoom(z);
  }, []);

  const handlePinClick = useCallback(async (id: string) => {
    setDetailMap((prev: Record<string, ObstacleDetail | 'loading'>) => {
      if (prev[id]) return prev; // already loading or cached
      return { ...prev, [id]: 'loading' };
    });

    const detail = await fetchObstacleDetail(id);
    setDetailMap((prev: Record<string, ObstacleDetail | 'loading'>) => {
      if (!detail) {
        // allow retry: remove the loading entry
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: detail };
    });
  }, []);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const results = await searchLocations(q);
      if (results.length > 0 && mapRef.current) {
        mapRef.current.flyTo([results[0].latitude, results[0].longitude], 18);
      }
    } finally {
      setSearchLoading(false);
    }
  };

  return (
    <View style={s.container}>

      {/* ── Toolbar: search + passive filter ── */}
      <View style={s.toolbar}>
        <View style={s.searchWrap}>
          <Ionicons name="search-outline" size={16} color={COLORS.gray400} />
          <TextInput
            style={s.searchInput}
            placeholder="Search campus locations…"
            placeholderTextColor={COLORS.gray400}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchLoading ? (
            <ActivityIndicator size="small" color={COLORS.green600} />
          ) : query.length > 0 ? (
            <TouchableOpacity onPress={handleSearch} style={s.searchGoBtn}>
              <Ionicons name="arrow-forward-circle" size={28} color={COLORS.green700} />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[s.passiveChip, showPassive && s.passiveChipActive]}
          onPress={() => setShowPassive((v: boolean) => !v)}
        >
          <View style={[s.chipDot, showPassive && s.chipDotActive]} />
          <Text style={[s.chipText, showPassive && s.chipTextActive]}>Passive</Text>
        </TouchableOpacity>
      </View>

      {/* ── Loading bar (top edge of map) ── */}
      {loading && <View style={s.loadingBar} />}

      {/* ── Map ── */}
      <View style={s.mapWrapper}>
        <MapContainer
          center={BOUN_CENTER}
          zoom={DEFAULT_ZOOM}
          zoomControl={false}
          style={{ width: '100%', height: '100%' }}
          ref={mapRef}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />
          <ZoomControl position="bottomright" />

          <BoundsWatcher onChange={handleBoundsChange} />
          <PinDropper onDrop={setDroppedPin} />

          {droppedPin && (
            <Marker position={droppedPin}>
              <Popup>
                <strong>Dropped Pin</strong>
                <br />
                {droppedPin.lat.toFixed(6)}, {droppedPin.lng.toFixed(6)}
              </Popup>
            </Marker>
          )}

          {obstacles.map((obs) => {
            if (obs.isIndoor && zoom < HIGH_DETAIL_ZOOM) return null;

            const isPassive = obs.status === 'PASSIVE';
            const color = CATEGORY_COLOR[obs.category] ?? COLORS.gray500;
            const cached = detailMap[obs.id];
            const detail = cached && cached !== 'loading' ? (cached as ObstacleDetail) : undefined;
            const detailLoading = cached === 'loading';

            return (
              <CircleMarker
                key={obs.id}
                center={[obs.latitude, obs.longitude]}
                radius={10}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: isPassive ? 0.4 : 0.85,
                  weight: isPassive ? 1 : 2,
                  opacity: isPassive ? 0.5 : 1,
                }}
                eventHandlers={{ click: () => handlePinClick(obs.id) }}
              >
                <Popup>
                  <ObstaclePopup obs={obs} detail={detail} loading={detailLoading} />
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },

  // ── Toolbar ───────────────────────────────────────────────────────────────
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray200,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    backgroundColor: COLORS.gray100,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: COLORS.gray800,
    paddingHorizontal: 4,
  },
  searchGoBtn: { padding: 2 },

  // ── Passive chip ──────────────────────────────────────────────────────────
  passiveChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    backgroundColor: COLORS.white,
  },
  passiveChipActive: {
    borderColor: COLORS.green500,
    backgroundColor: COLORS.green50,
  },
  chipDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.gray300,
  },
  chipDotActive: { backgroundColor: COLORS.green500 },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.gray500 },
  chipTextActive: { color: COLORS.green700 },

  // ── Map wrapper ───────────────────────────────────────────────────────────
  mapWrapper: { flex: 1 },

  // ── Loading bar ───────────────────────────────────────────────────────────
  loadingBar: {
    height: 3,
    backgroundColor: COLORS.green500,
  },
});
