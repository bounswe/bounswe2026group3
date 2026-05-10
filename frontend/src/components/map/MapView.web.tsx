/// <reference lib="dom" />
// @ts-ignore
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, ScrollView, StyleSheet, Switch,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CircleMarker, MapContainer, Marker, Polyline, Popup,
  TileLayer, ZoomControl, useMap, useMapEvents,
} from 'react-leaflet';

import {
  fetchObstacleDetail, fetchObstacles, filterVisibleObstacles, searchLocations,
  type Obstacle, type ObstacleDetail, type SearchResult,
} from '../../api/map';
import { calculateRoute, type GuestPreferences, type RouteResult } from '../../api/routes';
import { getSavedPlaces, createSavedPlace, type SavedPlace } from '../../api/savedPlaces';
import { isLoggedIn } from '../../services/auth';
import SavePlaceModal from './SavePlaceModal';
import { useLocation } from '../../hooks/useLocation';
import { COLORS } from '../../constants/theme';
import { HIGH_DETAIL_ZOOM } from '../../constants/mapConstants';
import { useRouter } from 'expo-router';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatTime(sec: number): string {
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), rem = mins % 60;
  return rem > 0 ? `${h}h ${rem}min` : `${h}h`;
}

// ── Leaflet icon setup ──────────────────────────────────────────────────────

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const makeCircleIcon = (color: string) =>
  L.divIcon({
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35)"></div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

const ORIGIN_ICON = makeCircleIcon(COLORS.green700);
const DEST_ICON = makeCircleIcon(COLORS.red500);
const SEARCH_PIN_ICON = makeCircleIcon(COLORS.red500);

/** Indoor obstacle: circle with a small white 'i' badge — same colour coding as outdoor.
 *  When `hollow` is true (unverified), inverts to white background +
 *  dashed category-colored border + category-colored 'i'. */
const makeIndoorCircleIcon = (color: string, hollow = false) =>
  L.divIcon({
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${hollow ? 'white' : color};
      border:3px ${hollow ? 'dashed' : 'solid'} ${hollow ? color : 'white'};
      box-shadow:0 3px 8px rgba(0,0,0,0.45);
      display:flex;align-items:center;justify-content:center;
      font-size:11px;font-weight:800;color:${hollow ? color : 'white'};
      font-family:system-ui,sans-serif;line-height:1;
    ">i</div>`,
    className: '',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

// ── Constants ───────────────────────────────────────────────────────────────

const BOUN_CENTER: [number, number] = [41.0847, 29.0503];
const DEFAULT_ZOOM = 16;
const DEFAULT_BBOX = { north: 41.095, south: 41.074, east: 29.065, west: 29.035 };

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

interface MapPoint { lat: number; lng: number; label: string; }

// ── Sub-components (must live inside MapContainer) ──────────────────────────

function BoundsWatcher({ onChange }: { onChange: (b: L.LatLngBounds, z: number) => void }) {
  const map = useMapEvents({
    moveend: () => onChange(map.getBounds(), map.getZoom()),
    zoomend: () => onChange(map.getBounds(), map.getZoom()),
  });
  useEffect(() => { onChange(map.getBounds(), map.getZoom()); }, []);
  return null;
}

function ClickHandler({ active, onPick }: { active: boolean; onPick: (ll: L.LatLng) => void }) {
  useMapEvents({ click: (e) => { if (active) onPick(e.latlng); } });
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  const prev = useRef<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const key = `${target[0]},${target[1]}`;
    if (key !== prev.current) {
      map.flyTo(target, 18);
      prev.current = key;
    }
  }, [target]);
  return null;
}

function FitRoute({ waypoints }: { waypoints: [number, number][] | null }) {
  const map = useMap();
  useEffect(() => {
    if (waypoints && waypoints.length > 1) {
      map.fitBounds(waypoints as L.LatLngBoundsExpression, { padding: [60, 60] });
      setTimeout(() => map.invalidateSize(), 100);
    }
  }, [waypoints]);
  return null;
}

// ── Popup content ───────────────────────────────────────────────────────────

function ObstaclePopup({
  obs, detail, loading, onViewDetails,
}: { obs: Obstacle; detail: ObstacleDetail | undefined; loading: boolean; onViewDetails: () => void }) {
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
      {loading && <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>Loading details…</div>}
      {!loading && detail && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#555', fontSize: 12, marginTop: 4, borderTop: '1px solid #eee', paddingTop: 6 }}>
          <span>👍 {detail.upvoteCount ?? 0} upvote{detail.upvoteCount !== 1 ? 's' : ''}</span>
        </div>
      )}
      <button
        onClick={onViewDetails}
        style={{ marginTop: 8, width: '100%', padding: '5px 0', background: 'none', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#374151' }}
      >
        View details →
      </button>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export default function MapView() {
  const router = useRouter();
  const mapRef = useRef<L.Map | null>(null);
  const autocompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Obstacle state
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [currentBounds, setCurrentBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [boundsKey, setBoundsKey] = useState('');
  const [detailMap, setDetailMap] = useState<Record<string, ObstacleDetail | 'loading'>>({});
  const prefetchedRef = useRef(false);
  const [showPassive, setShowPassive] = useState(false);

  // Search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<SearchResult | null>(null);
  const [searchPinLL, setSearchPinLL] = useState<[number, number] | null>(null);

  // Route planning state
  const [routePanelOpen, setRoutePanelOpen] = useState(false);
  const [origin, setOrigin] = useState<MapPoint | null>(null);
  const [dest, setDest] = useState<MapPoint | null>(null);
  const [originQ, setOriginQ] = useState('');
  const [destQ, setDestQ] = useState('');
  const [pinMode, setPinMode] = useState<'origin' | 'dest' | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [showPrefs, setShowPrefs] = useState(false);
  const [prefs, setPrefs] = useState<GuestPreferences>({
    avoidStairs: true,
    avoidSteepSlopes: false,
    maxSlopeGradient: 8,
  });

  // Saved places state
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [saveTarget, setSaveTarget] = useState<{ kind: 'origin' | 'dest'; lat: number; lng: number; address: string } | null>(null);
  const [saveLabel, setSaveLabel] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Origin/Dest autocomplete state
  const [originSuggestions, setOriginSuggestions] = useState<SearchResult[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<SearchResult[]>([]);
  const originAutoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destAutoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);

  const { location: currentLocation } = useLocation();

  // ── Saved places ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (isLoggedIn()) getSavedPlaces().then(setSavedPlaces);
  }, []);

  const handleSavePlace = useCallback(async () => {
    if (!saveTarget || !saveLabel.trim()) return;
    setSavingPlace(true);
    setSaveError('');
    const result = await createSavedPlace({
      label: saveLabel.trim(),
      latitude: saveTarget.lat,
      longitude: saveTarget.lng,
      address: saveTarget.address || undefined,
    });
    setSavingPlace(false);
    if (result.ok) {
      setSavedPlaces((prev) => [...prev, result.data]);
      setSaveTarget(null);
      setSaveLabel('');
      setSaveSuccessMsg(`Saved "${result.data.label}" to your places.`);
      setTimeout(() => setSaveSuccessMsg(''), 3000);
    } else {
      setSaveError(result.error);
    }
  }, [saveTarget, saveLabel]);

  const openSaveModal = (kind: 'origin' | 'dest') => {
    const point = kind === 'origin' ? origin : dest;
    if (!point) return;
    setSaveTarget({ kind, lat: point.lat, lng: point.lng, address: point.label });
    setSaveLabel('');
    setSaveError('');
  };

  // ── Obstacle loading ─────────────────────────────────────────────────────

  useEffect(() => {
    prefetchedRef.current = true;
    fetchObstacles(DEFAULT_BBOX, false).then((data) => {
      setObstacles((prev) => (prev.length === 0 ? data : prev));
    });
  }, []);

  useEffect(() => {
    if (!currentBounds) return;
    let cancelled = false;
    fetchObstacles(
      {
        north: currentBounds.getNorth(),
        south: currentBounds.getSouth(),
        east: currentBounds.getEast(),
        west: currentBounds.getWest(),
      },
      showPassive,
    ).then((data) => { if (!cancelled) setObstacles(data); });
    return () => { cancelled = true; };
  }, [boundsKey, showPassive]);

  const handleBoundsChange = useCallback((b: L.LatLngBounds, z: number) => {
    setCurrentBounds(b);
    setZoom(z);
    const key = `${b.getNorth().toFixed(4)},${b.getSouth().toFixed(4)},${b.getEast().toFixed(4)},${b.getWest().toFixed(4)}`;
    setBoundsKey(key);
  }, []);

  const handlePinClick = useCallback(async (id: string) => {
    setDetailMap((prev) => {
      if (prev[id]) return prev;
      return { ...prev, [id]: 'loading' };
    });
    const detail = await fetchObstacleDetail(id);
    setDetailMap((prev) => {
      if (!detail) { const next = { ...prev }; delete next[id]; return next; }
      return { ...prev, [id]: detail };
    });
  }, []);

  // ── Search autocomplete ──────────────────────────────────────────────────

  const handleQueryChange = (text: string) => {
    setQuery(text);
    setSelectedLocation(null);
    setSearchPinLL(null);
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (text.trim().length < 2) { setSuggestions([]); return; }
    autocompleteTimer.current = setTimeout(async () => {
      const results = await searchLocations(text.trim());
      setSuggestions(results);
    }, 300);
  };

  const handleSelectSuggestion = (result: SearchResult) => {
    setQuery(result.name);
    setSuggestions([]);
    setSelectedLocation(result);
    setSearchFocused(false);
    setSearchPinLL([result.latitude, result.longitude]);
    // Auto-fill destination
    setDest({ lat: result.latitude, lng: result.longitude, label: result.name });
    setDestQ(result.name);
  };

  const handlePlanRoute = () => {
    setRoutePanelOpen(true);
    setSearchPinLL(null);
  };

  // ── Origin / Destination autocomplete ────────────────────────────────────

  const handleOriginQChange = (text: string) => {
    setOriginQ(text);
    if (originAutoTimer.current) clearTimeout(originAutoTimer.current);
    if (text.trim().length < 2) { setOriginSuggestions([]); return; }
    originAutoTimer.current = setTimeout(async () => {
      const results = await searchLocations(text.trim());
      setOriginSuggestions(results);
    }, 300);
  };

  const handleDestQChange = (text: string) => {
    setDestQ(text);
    if (destAutoTimer.current) clearTimeout(destAutoTimer.current);
    if (text.trim().length < 2) { setDestSuggestions([]); return; }
    destAutoTimer.current = setTimeout(async () => {
      const results = await searchLocations(text.trim());
      setDestSuggestions(results);
    }, 300);
  };

  const clearRouteOnChange = () => {
    if (route) setRoute(null);
  };

  const selectOriginSuggestion = (r: SearchResult) => {
    setOrigin({ lat: r.latitude, lng: r.longitude, label: r.name });
    setOriginQ(r.name);
    setOriginSuggestions([]);
    setOriginFocused(false);
    clearRouteOnChange();
  };

  const selectDestSuggestion = (r: SearchResult) => {
    setDest({ lat: r.latitude, lng: r.longitude, label: r.name });
    setDestQ(r.name);
    setDestSuggestions([]);
    setDestFocused(false);
    clearRouteOnChange();
  };

  const useCurrentLocation = async () => {
    if (!currentLocation) return;
    const { lat, lng } = currentLocation;
    const coordLabel = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setOrigin({ lat, lng, label: coordLabel });
    setOriginQ(coordLabel);
    setOriginSuggestions([]);
    clearRouteOnChange();
    // Reverse-geocode to get a real address
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'AccessMap/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const short = (data.display_name ?? coordLabel).split(',').slice(0, 3).join(',').trim();
        setOrigin({ lat, lng, label: short });
        setOriginQ(short);
      }
    } catch {}
  };

  // ── Map click for pin drop ───────────────────────────────────────────────

  const handleMapClick = useCallback(async (ll: L.LatLng) => {
    const coordLabel = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
    const point: MapPoint = { lat: ll.lat, lng: ll.lng, label: coordLabel };
    if (pinMode === 'origin') { setOrigin(point); setOriginQ(coordLabel); }
    else { setDest(point); setDestQ(coordLabel); }
    setPinMode(null);
    clearRouteOnChange();

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${ll.lat}&lon=${ll.lng}&format=json&accept-language=en`,
        { headers: { 'User-Agent': 'AccessMap/1.0' } },
      );
      if (res.ok) {
        const data = await res.json();
        const short = (data.display_name ?? coordLabel).split(',').slice(0, 3).join(',').trim();
        const named: MapPoint = { lat: ll.lat, lng: ll.lng, label: short };
        if (pinMode === 'origin') { setOrigin(named); setOriginQ(short); }
        else { setDest(named); setDestQ(short); }
      }
    } catch {}
  }, [pinMode, route]);

  // ── Route calculation ────────────────────────────────────────────────────

  const doCalculate = useCallback(async (guestPrefs?: GuestPreferences) => {
    if (!origin || !dest) return;
    setShowPrefs(false);
    setRouteLoading(true);
    setRouteError(null);
    setRoute(null);
    const result = await calculateRoute({
      originLat: origin.lat, originLng: origin.lng,
      destinationLat: dest.lat, destinationLng: dest.lng,
      preferences: guestPrefs,
    });
    setRouteLoading(false);
    if (result) setRoute(result);
    else setRouteError('Could not calculate route. Please try again.');
  }, [origin, dest]);

  const handleGetRoute = useCallback(() => {
    if (!origin || !dest) { setRouteError('Please set both origin and destination.'); return; }
    if (isLoggedIn()) doCalculate();
    else setShowPrefs(true);
  }, [origin, dest, doCalculate]);

  const closeRoutePanel = () => {
    setRoutePanelOpen(false);
    setOrigin(null);
    setDest(null);
    setOriginQ('');
    setDestQ('');
    setRoute(null);
    setRouteError(null);
    setPinMode(null);
    if (selectedLocation) {
      setSearchPinLL([selectedLocation.latitude, selectedLocation.longitude]);
    }
  };

  // ── Derived values ───────────────────────────────────────────────────────

  const originLL: [number, number] | null = origin ? [origin.lat, origin.lng] : null;
  const destLL: [number, number] | null = dest ? [dest.lat, dest.lng] : null;
  const flyTarget = searchPinLL && !routePanelOpen ? searchPinLL : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>

      {/* ── Full-screen map ── */}
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
          <ClickHandler active={!!pinMode} onPick={handleMapClick} />
          <FlyTo target={flyTarget} />
          <FitRoute waypoints={route?.waypoints ?? null} />

          {/* Obstacle markers — re-applied every render so an in-session
              status update to CLOSED removes the marker without a reload. */}
          {filterVisibleObstacles(obstacles).map((obs) => {
            if (obs.isIndoor && zoom < HIGH_DETAIL_ZOOM) return null;
            const isPassive = obs.status === 'PASSIVE';
            const isUnverified = obs.status === 'UNVERIFIED';
            const color = CATEGORY_COLOR[obs.category] ?? COLORS.gray500;
            const cached = detailMap[obs.id];
            const detail = cached && cached !== 'loading' ? (cached as ObstacleDetail) : undefined;
            const detailLoading = cached === 'loading';

            if (obs.isIndoor) {
              return (
                <Marker
                  key={obs.id}
                  position={[obs.latitude, obs.longitude]}
                  icon={makeIndoorCircleIcon(color, isUnverified)}
                  opacity={isPassive ? 0.5 : 1}
                  eventHandlers={{ click: () => handlePinClick(obs.id) }}
                >
                  <Popup>
                    <ObstaclePopup
                      obs={obs}
                      detail={detail}
                      loading={detailLoading}
                      onViewDetails={() => router.push(`/report/${obs.id}`)}
                    />
                  </Popup>
                </Marker>
              );
            }

            return (
              <CircleMarker
                key={obs.id}
                center={[obs.latitude, obs.longitude]}
                radius={10}
                pathOptions={{
                  color,
                  fillColor: isUnverified ? 'white' : color,
                  fillOpacity: isPassive ? 0.4 : (isUnverified ? 1 : 0.85),
                  weight: isPassive ? 1 : (isUnverified ? 3 : 2),
                  opacity: isPassive ? 0.5 : 1,
                  dashArray: isUnverified ? '4 3' : undefined,
                }}
                eventHandlers={{ click: () => handlePinClick(obs.id) }}
              >
                <Popup>
                  <ObstaclePopup
                    obs={obs}
                    detail={detail}
                    loading={detailLoading}
                    onViewDetails={() => router.push(`/report/${obs.id}`)}
                  />
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Search pin */}
          {searchPinLL && !routePanelOpen && (
            <Marker position={searchPinLL} icon={SEARCH_PIN_ICON} />
          )}

          {/* Route markers */}
          {routePanelOpen && originLL && <Marker position={originLL} icon={ORIGIN_ICON} />}
          {routePanelOpen && destLL && <Marker position={destLL} icon={DEST_ICON} />}

          {/* Route polyline */}
          {route && route.waypoints.length > 1 && (
            <Polyline
              positions={route.waypoints}
              pathOptions={{ color: COLORS.blue500, weight: 5, opacity: 0.85, lineJoin: 'round' }}
            />
          )}
        </MapContainer>
      </View>

      {/* ── Overlaid UI ── */}
      <View style={s.overlayContainer} pointerEvents="box-none">

        {/* Success toast — shown for 3s after a place is saved */}
        {!!saveSuccessMsg && (
          <View style={s.okToast} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green700} />
            <Text style={s.okToastText}>{saveSuccessMsg}</Text>
          </View>
        )}

        {/* Top area */}
        <View style={s.topArea} pointerEvents="box-none">

          {!routePanelOpen ? (
            /* ── Default: Search bar ── */
            <View style={s.searchCard}>
              <View style={s.searchWrap}>
                <Ionicons name="search-outline" size={18} color={COLORS.gray400} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search for a location"
                  placeholderTextColor={COLORS.gray400}
                  value={query}
                  onChangeText={handleQueryChange}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                  returnKeyType="search"
                />
                {query.length > 0 ? (
                  <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); setSelectedLocation(null); setSearchPinLL(null); }}>
                    <Ionicons name="close-circle" size={20} color={COLORS.gray400} />
                  </TouchableOpacity>
                ) : null}
              </View>

              {/* Autocomplete suggestions */}
              {searchFocused && suggestions.length > 0 && (
                <View style={s.suggestionsBox}>
                  <FlatList
                    data={suggestions}
                    keyExtractor={(item) => item.id}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => (
                      <TouchableOpacity style={s.suggestionItem} onPress={() => handleSelectSuggestion(item)}>
                        <Ionicons name="location-outline" size={16} color={COLORS.gray500} />
                        <Text style={s.suggestionText} numberOfLines={1}>{item.name}</Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}

              {/* "Plan Route" chip */}
              {selectedLocation && (
                <TouchableOpacity style={s.planRouteChip} onPress={handlePlanRoute}>
                  <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
                  <Text style={s.planRouteChipText}>Plan Route</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            /* ── Route panel ── */
            <View style={s.routeCard}>
              <View style={s.routeCardHeader}>
                <Text style={s.routeCardTitle}>Plan Route</Text>
                <TouchableOpacity onPress={closeRoutePanel}>
                  <Ionicons name="close-outline" size={22} color={COLORS.gray500} />
                </TouchableOpacity>
              </View>

              {/* Saved places quick-select for origin */}
              {originFocused && savedPlaces.length > 0 && originQ.length === 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.savedChips} keyboardShouldPersistTaps="handled">
                  {savedPlaces.map((p) => (
                    <TouchableOpacity key={p.id} style={s.savedChip} onPress={() => selectOriginSuggestion({ id: p.id, name: p.label, latitude: p.latitude, longitude: p.longitude })}>
                      <Ionicons name="bookmark" size={11} color={COLORS.green700} />
                      <Text style={s.savedChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Origin row */}
              <View style={s.inputRow}>
                <View style={[s.dot, s.dotOrigin]} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={s.input}
                    placeholder="Origin — search or drop pin"
                    placeholderTextColor={COLORS.gray400}
                    value={originQ}
                    onChangeText={handleOriginQChange}
                    onFocus={() => setOriginFocused(true)}
                    onBlur={() => setTimeout(() => setOriginFocused(false), 200)}
                    onSubmitEditing={() => {
                      if (originSuggestions.length > 0) selectOriginSuggestion(originSuggestions[0]);
                    }}
                    returnKeyType="search"
                  />
                  {originFocused && originSuggestions.length > 0 && (
                    <View style={s.fieldSuggestions}>
                      <FlatList
                        data={originSuggestions}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity style={s.suggestionItem} onPress={() => selectOriginSuggestion(item)}>
                            <Ionicons name="location-outline" size={14} color={COLORS.gray500} />
                            <Text style={s.suggestionText} numberOfLines={1}>{item.name}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[s.pinBtn, pinMode === 'origin' && s.pinBtnActive]}
                  onPress={() => setPinMode(pinMode === 'origin' ? null : 'origin')}
                >
                  <Ionicons name="location-outline" size={20}
                    color={pinMode === 'origin' ? COLORS.green700 : COLORS.gray400} />
                </TouchableOpacity>
                {origin && isLoggedIn() && (
                  <TouchableOpacity style={s.bookmarkBtn} onPress={() => openSaveModal('origin')}>
                    <Ionicons name="bookmark-outline" size={16} color={COLORS.green700} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Use current location */}
              <TouchableOpacity style={s.currentLocBtn} onPress={useCurrentLocation} disabled={!currentLocation}>
                <Ionicons name="navigate-circle-outline" size={16} color={currentLocation ? COLORS.blue600 : COLORS.gray300} />
                <Text style={[s.currentLocText, !currentLocation && { color: COLORS.gray300 }]}>Use current location</Text>
              </TouchableOpacity>

              <View style={s.connector}><View style={s.connectorLine} /></View>

              {/* Saved places quick-select for destination */}
              {destFocused && savedPlaces.length > 0 && destQ.length === 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.savedChips} keyboardShouldPersistTaps="handled">
                  {savedPlaces.map((p) => (
                    <TouchableOpacity key={p.id} style={s.savedChip} onPress={() => selectDestSuggestion({ id: p.id, name: p.label, latitude: p.latitude, longitude: p.longitude })}>
                      <Ionicons name="bookmark" size={11} color={COLORS.green700} />
                      <Text style={s.savedChipText}>{p.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Destination row */}
              <View style={s.inputRow}>
                <View style={[s.dot, s.dotDest]} />
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={s.input}
                    placeholder="Destination — search or drop pin"
                    placeholderTextColor={COLORS.gray400}
                    value={destQ}
                    onChangeText={handleDestQChange}
                    onFocus={() => setDestFocused(true)}
                    onBlur={() => setTimeout(() => setDestFocused(false), 200)}
                    onSubmitEditing={() => {
                      if (destSuggestions.length > 0) selectDestSuggestion(destSuggestions[0]);
                    }}
                    returnKeyType="search"
                  />
                  {destFocused && destSuggestions.length > 0 && (
                    <View style={s.fieldSuggestions}>
                      <FlatList
                        data={destSuggestions}
                        keyExtractor={(item) => item.id}
                        keyboardShouldPersistTaps="handled"
                        renderItem={({ item }) => (
                          <TouchableOpacity style={s.suggestionItem} onPress={() => selectDestSuggestion(item)}>
                            <Ionicons name="location-outline" size={14} color={COLORS.gray500} />
                            <Text style={s.suggestionText} numberOfLines={1}>{item.name}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={[s.pinBtn, pinMode === 'dest' && s.pinBtnActive]}
                  onPress={() => setPinMode(pinMode === 'dest' ? null : 'dest')}
                >
                  <Ionicons name="location-outline" size={20}
                    color={pinMode === 'dest' ? COLORS.red500 : COLORS.gray400} />
                </TouchableOpacity>
                {dest && isLoggedIn() && (
                  <TouchableOpacity style={s.bookmarkBtn} onPress={() => openSaveModal('dest')}>
                    <Ionicons name="bookmark-outline" size={16} color={COLORS.green700} />
                  </TouchableOpacity>
                )}
              </View>

              {/* Get Route button */}
              <TouchableOpacity
                style={[s.routeBtn, (!origin || !dest) && s.routeBtnDisabled]}
                onPress={handleGetRoute}
                disabled={routeLoading}
              >
                {routeLoading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
                    <Text style={s.routeBtnText}>Get Route</Text>
                  </>
                )}
              </TouchableOpacity>

              {routeError && (
                <View style={s.errorRow}>
                  <Ionicons name="alert-circle-outline" size={14} color={COLORS.red500} />
                  <Text style={s.errorText}>{routeError}</Text>
                </View>
              )}

              {route && (
                <View style={s.summaryCard}>
                  <View style={s.summaryRow}>
                    <View style={s.summaryItem}>
                      <Ionicons name="walk-outline" size={16} color={COLORS.green700} />
                      <Text style={s.summaryValue}>{formatDistance(route.distanceMeters)}</Text>
                      <Text style={s.summaryLabel}>Distance</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                      <Ionicons name="time-outline" size={16} color={COLORS.green700} />
                      <Text style={s.summaryValue}>{formatTime(route.estimatedTimeSeconds)}</Text>
                      <Text style={s.summaryLabel}>Est. time</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                      <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.green700} />
                      <Text style={s.summaryValue}>{route.avoidedObstaclesCount ?? 0}</Text>
                      <Text style={s.summaryLabel}>Avoided</Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Passive toggle chip */}
        <View style={s.passiveToggleWrap} pointerEvents="box-none">
          <TouchableOpacity
            style={[s.passiveChip, showPassive && s.passiveChipActive]}
            onPress={() => setShowPassive((v) => !v)}
          >
            <Ionicons name="layers-outline" size={13} color={showPassive ? COLORS.white : COLORS.gray600} />
            <Text style={[s.passiveChipText, showPassive && { color: COLORS.white }]}>
              {showPassive ? 'Showing inactive' : 'Show inactive'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Pin mode banner */}
        {pinMode && (
          <View style={s.pinBanner}>
            <Ionicons name="finger-print-outline" size={14} color={COLORS.green700} />
            <Text style={s.pinBannerText}>
              Tap the map to set {pinMode === 'origin' ? 'origin' : 'destination'}
            </Text>
            <TouchableOpacity onPress={() => setPinMode(null)}>
              <Ionicons name="close-outline" size={18} color={COLORS.gray500} />
            </TouchableOpacity>
          </View>
        )}

      </View>

      {/* Save place modal */}
      {saveTarget && (
        <SavePlaceModal
          label={saveLabel}
          onLabelChange={(t) => { setSaveLabel(t); setSaveError(''); }}
          saving={savingPlace}
          error={saveError}
          onSave={handleSavePlace}
          onCancel={() => { setSaveTarget(null); setSaveError(''); }}
        />
      )}

      {/* Guest preferences overlay */}
      {showPrefs && (
        <View style={s.prefsOverlay}>
          <View style={s.prefsCard}>
            <Text style={s.prefsTitle}>Route Preferences</Text>
            <Text style={s.prefsSubtitle}>
              Sign in to save your profile. For now, set your preferences below.
            </Text>

            <View style={s.prefRow}>
              <View style={s.prefLabel}>
                <Ionicons name="footsteps-outline" size={16} color={COLORS.gray700} />
                <Text style={s.prefLabelText}>Avoid stairs</Text>
              </View>
              <Switch
                value={prefs.avoidStairs}
                onValueChange={(v) => setPrefs((p) => ({ ...p, avoidStairs: v }))}
                trackColor={{ false: COLORS.gray200, true: COLORS.green400 }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={s.prefRow}>
              <View style={s.prefLabel}>
                <Ionicons name="trending-up-outline" size={16} color={COLORS.gray700} />
                <Text style={s.prefLabelText}>Avoid steep slopes</Text>
              </View>
              <Switch
                value={prefs.avoidSteepSlopes}
                onValueChange={(v) => setPrefs((p) => ({ ...p, avoidSteepSlopes: v }))}
                trackColor={{ false: COLORS.gray200, true: COLORS.green400 }}
                thumbColor={COLORS.white}
              />
            </View>

            <View style={s.prefRow}>
              <View style={s.prefLabel}>
                <Ionicons name="speedometer-outline" size={16} color={COLORS.gray700} />
                <Text style={s.prefLabelText}>Max slope gradient (%)</Text>
              </View>
              <TextInput
                style={s.slopeInput}
                keyboardType="numeric"
                value={String(prefs.maxSlopeGradient)}
                onChangeText={(v) => {
                  const n = parseInt(v, 10);
                  if (!isNaN(n) && n >= 1 && n <= 30) setPrefs((p) => ({ ...p, maxSlopeGradient: n }));
                }}
              />
            </View>

            <TouchableOpacity style={s.prefsCalcBtn} onPress={() => doCalculate(prefs)}>
              <Ionicons name="navigate-outline" size={16} color={COLORS.white} />
              <Text style={s.prefsCalcBtnText}>Calculate Route</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.prefsCancelBtn} onPress={() => setShowPrefs(false)}>
              <Text style={s.prefsCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  mapWrapper: { ...StyleSheet.absoluteFillObject },

  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  topArea: { paddingTop: 8 },

  okToast: {
    position: 'absolute', top: 50, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.green50,
    borderWidth: 1, borderColor: 'rgba(39,114,74,0.18)',
    borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 6, elevation: 4,
    zIndex: 1000,
  },
  okToastText: { flex: 1, fontSize: 13, color: COLORS.green700, fontWeight: '500' },

  // ── Search card ──────────────────────────────────────────────────────────
  searchCard: {
    marginHorizontal: 14,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  searchWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    height: 48, backgroundColor: COLORS.gray100, borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.gray200,
  },
  searchInput: { flex: 1, height: 48, fontSize: 15, color: COLORS.gray800, paddingHorizontal: 4, outlineStyle: 'none' },

  // ── Suggestions ──────────────────────────────────────────────────────────
  suggestionsBox: {
    marginTop: 6, maxHeight: 180,
    borderTopWidth: 1, borderTopColor: COLORS.gray200,
  },
  suggestionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.gray200,
  },
  suggestionText: { flex: 1, fontSize: 14, color: COLORS.gray800 },

  // ── Plan Route chip ──────────────────────────────────────────────────────
  planRouteChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, height: 40, borderRadius: 10,
    backgroundColor: COLORS.green700,
  },
  planRouteChipText: { color: COLORS.white, fontWeight: '700', fontSize: 14 },

  // ── Route panel ──────────────────────────────────────────────────────────
  routeCard: {
    marginHorizontal: 12,
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    gap: 6,
  },
  routeCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  routeCardTitle: { fontSize: 17, fontWeight: '700', color: COLORS.gray800 },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 48, gap: 10 },
  dot: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2.5,
    borderColor: COLORS.white, flexShrink: 0,
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  dotOrigin: { backgroundColor: COLORS.green700 },
  dotDest: { backgroundColor: COLORS.red500 },
  connector: { paddingLeft: 5, height: 12, justifyContent: 'center' },
  connectorLine: { width: 1.5, height: 12, backgroundColor: COLORS.gray300, marginLeft: 4 },
  input: {
    flex: 1, height: 44, backgroundColor: COLORS.gray100,
    borderRadius: 10, paddingHorizontal: 14, fontSize: 15,
    color: COLORS.gray800, borderWidth: 1, borderColor: COLORS.gray200,
    outlineStyle: 'none',
  },
  pinBtn: {
    width: 44, height: 44, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.white, flexShrink: 0,
  },
  pinBtnActive: { borderColor: COLORS.green500, backgroundColor: COLORS.green50 },
  currentLocBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingLeft: 24, paddingVertical: 4,
  },
  currentLocText: { fontSize: 13, color: COLORS.blue600, fontWeight: '600' },
  fieldSuggestions: {
    position: 'absolute', top: 42, left: 0, right: 0, zIndex: 100,
    backgroundColor: COLORS.white, borderRadius: 8, maxHeight: 150,
    borderWidth: 1, borderColor: COLORS.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
  },
  routeBtn: {
    marginTop: 10, height: 46, borderRadius: 12, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  routeBtnDisabled: { backgroundColor: COLORS.gray300 },
  routeBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errorText: { fontSize: 12, color: COLORS.red500 },

  // ── Saved places ─────────────────────────────────────────────────────────
  savedChips: { flexDirection: 'row', paddingVertical: 6, gap: 6 },
  savedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: COLORS.green50, borderRadius: 100,
    borderWidth: 1, borderColor: COLORS.green200,
  },
  savedChipText: { fontSize: 12, fontWeight: '600', color: COLORS.green700 },
  bookmarkBtn: {
    width: 44, height: 44, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.green200, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.green50, flexShrink: 0,
  },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  presetChip: {
    flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.gray300, backgroundColor: COLORS.white,
  },
  presetChipActive: { borderColor: COLORS.green600, backgroundColor: COLORS.green50 },
  presetChipText: { fontSize: 14, fontWeight: '600', color: COLORS.gray600 },
  presetChipTextActive: { color: COLORS.green700 },

  // ── Route summary ────────────────────────────────────────────────────────
  summaryCard: {
    marginTop: 10,
    backgroundColor: COLORS.green50,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.green200,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  summaryItem: { alignItems: 'center', gap: 2, flex: 1 },
  summaryDivider: { width: 1, height: 32, backgroundColor: COLORS.green200 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  summaryLabel: { fontSize: 10, color: COLORS.gray400, fontWeight: '500' },

  // ── Pin mode banner ──────────────────────────────────────────────────────
  pinBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 12, marginTop: 8,
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.green50, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.green200,
  },
  pinBannerText: { flex: 1, fontSize: 13, color: COLORS.green700, fontWeight: '500' },

  // ── Guest preferences overlay ────────────────────────────────────────────
  prefsOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center', zIndex: 2000,
  },
  prefsCard: {
    width: '90%', maxWidth: 400, backgroundColor: COLORS.white,
    borderRadius: 16, padding: 24, gap: 16,
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, elevation: 10,
  },
  prefsTitle: { fontSize: 18, fontWeight: '700', color: COLORS.gray800 },
  prefsSubtitle: { fontSize: 13, color: COLORS.gray500, lineHeight: 18, marginTop: -8 },
  prefRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingVertical: 4,
  },
  prefLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prefLabelText: { fontSize: 14, color: COLORS.gray700, fontWeight: '500' },
  slopeInput: {
    width: 56, height: 36, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.gray300,
    textAlign: 'center', fontSize: 15, fontWeight: '600', color: COLORS.gray800,
  },
  prefsCalcBtn: {
    height: 46, borderRadius: 11, backgroundColor: COLORS.green700,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 4,
  },
  prefsCalcBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  prefsCancelBtn: { alignItems: 'center', paddingVertical: 4 },
  prefsCancelText: { fontSize: 14, color: COLORS.gray400 },

  passiveToggleWrap: { position: 'absolute', bottom: 80, left: 12 },
  passiveChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.white,
    paddingHorizontal: 11, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.gray200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 3,
  },
  passiveChipActive: { backgroundColor: COLORS.green700, borderColor: COLORS.green700 },
  passiveChipText: { fontSize: 12, fontWeight: '600', color: COLORS.gray600 },
});
