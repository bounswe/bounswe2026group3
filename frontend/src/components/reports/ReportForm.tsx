import { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useLocation } from '../../hooks/useLocation';
import PhotoPicker, { type PhotoEntry } from './PhotoPicker';
import { submitReport } from '../../api/reports';
import { searchLocations, searchNominatim, reverseGeocode, type SearchResult } from '../../api/map';
import { parseDRFError } from '../../services/auth';
import LocationPicker from './LocationPicker';
import type { ObstacleCategory, ReportContext, SubmitReportResponse } from '../../types/report';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const OUTDOOR_CATEGORIES: Array<{ value: ObstacleCategory; label: string; icon: IoniconName }> = [
  { value: 'BROKEN_RAMP',       label: 'Broken Ramp',    icon: 'arrow-up-circle-outline' },
  { value: 'NARROW_SIDEWALK',   label: 'Narrow Sidewalk', icon: 'resize-outline' },
  { value: 'DAMAGED_SURFACE',   label: 'Damaged Surface', icon: 'warning-outline' },
  { value: 'ROAD_CONSTRUCTION', label: 'Construction',    icon: 'construct-outline' },
  { value: 'BLOCKED_PATH',      label: 'Blocked Path',    icon: 'stop-circle-outline' },
  { value: 'OTHER',             label: 'Other',           icon: 'ellipsis-horizontal-circle-outline' },
];

const INDOOR_CATEGORIES: Array<{ value: ObstacleCategory; label: string; icon: IoniconName }> = [
  { value: 'BROKEN_ELEVATOR',      label: 'Broken Elevator',   icon: 'arrow-up-outline' },
  { value: 'INACCESSIBLE_RESTROOM',label: 'Inaccessible WC',   icon: 'man-outline' },
  { value: 'NARROW_CORRIDOR',      label: 'Narrow Corridor',   icon: 'resize-outline' },
  { value: 'HEAVY_DOOR',           label: 'Heavy Door',        icon: 'enter-outline' },
  { value: 'SLIPPERY_FLOOR',       label: 'Slippery Floor',    icon: 'warning-outline' },
  { value: 'OTHER',                label: 'Other',             icon: 'ellipsis-horizontal-circle-outline' },
];

type LocationMode = 'current' | 'pick';

interface Props { onSuccess: (r: SubmitReportResponse) => void; }

export default function ReportForm({ onSuccess }: Props) {
  const loc = useLocation();
  const [context, setContext]       = useState<ReportContext>('OUTDOOR');
  const [category, setCategory]     = useState<ObstacleCategory | null>(null);
  const [photos, setPhotos]         = useState<PhotoEntry[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [apiError, setApiError]     = useState('');

  // Location mode
  const [locationMode, setLocationMode] = useState<LocationMode>('current');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedArea, setSelectedArea] = useState<SearchResult | null>(null);
  const [pickedLocation, setPickedLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [buildingName, setBuildingName]               = useState('');
  const [buildingSuggestions, setBuildingSuggestions] = useState<SearchResult[]>([]);
  const [buildingLoading, setBuildingLoading]         = useState(false);
  const [buildingUserEdited, setBuildingUserEdited]   = useState(false);
  const [floor, setFloor]                             = useState('');
  const buildingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current)   clearTimeout(searchTimerRef.current);
      if (buildingTimerRef.current) clearTimeout(buildingTimerRef.current);
    };
  }, []);

  // Auto-fill building name from coordinates when context is INDOOR.
  // Runs on every pin/location change — clears stale value and re-fetches.
  useEffect(() => {
    if (context !== 'INDOOR') return;

    // In 'pick' mode, prefer the fine-grained pinned point; fall back to the
    // centre of the selected search area when the user hasn't dragged the pin.
    const coords =
      locationMode === 'current'
        ? loc.location
        : pickedLocation ?? (selectedArea
            ? { lat: selectedArea.latitude, lng: selectedArea.longitude }
            : null);

    if (!coords) return;

    let cancelled = false;
    // Clear stale value immediately so the field shows the spinner, not old data.
    setBuildingName('');
    setBuildingUserEdited(false);
    setBuildingLoading(true);
    reverseGeocode(coords.lat, coords.lng).then((name) => {
      if (cancelled) return;
      if (name) { setBuildingName(name); setBuildingUserEdited(false); }
      setBuildingLoading(false);
    });
    return () => { cancelled = true; };
  }, [
    context,
    locationMode,
    loc.location?.lat,
    loc.location?.lng,
    pickedLocation?.lat,
    pickedLocation?.lng,
    selectedArea?.latitude,
    selectedArea?.longitude,
  ]);


  function addPhoto(p: PhotoEntry)   { setPhotos(prev => [...prev, p]); setPhotoError(''); }
  function removePhoto(i: number)    { setPhotos(prev => prev.filter((_, idx) => idx !== i)); }
  function toggleCategory(v: ObstacleCategory) { setCategory(prev => prev === v ? null : v); }

  // Debounced search
  const handleSearchInput = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      const results = await searchNominatim(text.trim());
      setSearchResults(results);
      setSearchLoading(false);
    }, 400);
  }, []);

  const handleSelectArea = useCallback((result: SearchResult) => {
    setSelectedArea(result);
    setPickedLocation(null);
    setSearchResults([]);
    setSearchQuery('');
  }, []);

  const handleResetPick = useCallback(() => {
    setSelectedArea(null);
    setPickedLocation(null);
    setSearchQuery('');
    setSearchResults([]);
  }, []);

  const handleContextChange = useCallback((c: ReportContext) => {
    setContext(c);
    setCategory(null); // reset category — selections don't carry across contexts
    if (c === 'OUTDOOR') {
      setBuildingName('');
      setBuildingSuggestions([]);
      setBuildingUserEdited(false);
      setFloor('');
    }
  }, []);

  const handleBuildingInput = useCallback((text: string) => {
    setBuildingName(text);
    setBuildingUserEdited(true);
    if (buildingTimerRef.current) clearTimeout(buildingTimerRef.current);
    if (text.trim().length < 2) { setBuildingSuggestions([]); return; }
    buildingTimerRef.current = setTimeout(async () => {
      setBuildingLoading(true);
      const results = await searchLocations(text.trim());
      setBuildingSuggestions(results);
      setBuildingLoading(false);
    }, 400);
  }, []);

  const handleSelectBuilding = useCallback((result: SearchResult) => {
    setBuildingName(result.name);
    setBuildingSuggestions([]);
  }, []);

  const handleSwitchMode = useCallback((mode: LocationMode) => {
    setLocationMode(mode);
    if (mode === 'current') {
      setSelectedArea(null);
      setPickedLocation(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, []);

  const handleLocationPick = useCallback((loc: { lat: number; lng: number }) => {
    setPickedLocation(loc);
  }, []);

  // Determine final location for submission
  const finalLocation = locationMode === 'current' ? loc.location : pickedLocation;

  async function handleSubmit() {
    setApiError('');
    if (photos.length === 0) { setPhotoError('At least one photo is required.'); return; }
    if (context === 'INDOOR' && !buildingName.trim()) {
      setApiError('Building name is required for indoor reports.');
      return;
    }
    if (!finalLocation) {
      setApiError(locationMode === 'current'
        ? 'Location not available yet — please wait or tap Retry.'
        : 'Please select a location on the map.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await submitReport({
        location: finalLocation,
        context,
        category,
        description: description.trim(),
        photos: photos.map(p => p.b64),
        ...(context === 'INDOOR' && {
          buildingName: buildingName.trim(),
          floor: floor.trim() || undefined,
          isIndoor: true,
        }),
      });
      if (res.ok) {
        onSuccess(res.data as SubmitReportResponse);
      } else {
        setApiError(parseDRFError(res.data));
      }
    } catch {
      setApiError('Unexpected error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = submitting || (locationMode === 'current' && loc.loading) || (locationMode === 'pick' && !pickedLocation);

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.page} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Location ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="location-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Location</Text>
          </View>

          {/* Mode toggle */}
          <View style={s.toggleRow}>
            <TouchableOpacity
              style={[s.pill, locationMode === 'current' && s.pillActive]}
              onPress={() => handleSwitchMode('current')}
              activeOpacity={0.8}
            >
              <Ionicons name="navigate-outline" size={14} color={locationMode === 'current' ? COLORS.white : COLORS.gray500} />
              <Text style={[s.pillLabel, locationMode === 'current' && s.pillLabelActive]}>Current Location</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.pill, locationMode === 'pick' && s.pillActive]}
              onPress={() => handleSwitchMode('pick')}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={14} color={locationMode === 'pick' ? COLORS.white : COLORS.gray500} />
              <Text style={[s.pillLabel, locationMode === 'pick' && s.pillLabelActive]}>Choose on Map</Text>
            </TouchableOpacity>
          </View>

          {/* Current location display */}
          {locationMode === 'current' && (
            <View style={{ marginTop: 12 }}>
              {loc.loading && (
                <View style={s.locRow}>
                  <ActivityIndicator size="small" color={COLORS.green600} />
                  <Text style={s.locText}>Detecting your location…</Text>
                </View>
              )}
              {!loc.loading && loc.location && (
                <View style={s.locRow}>
                  <Ionicons name="checkmark-circle" size={16} color={COLORS.green600} />
                  <Text style={s.locText} numberOfLines={1}>
                    {loc.location.lat.toFixed(5)}, {loc.location.lng.toFixed(5)}
                  </Text>
                  <TouchableOpacity onPress={loc.refetch}>
                    <Text style={s.locAction}>Refresh</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!loc.loading && loc.permissionDenied && (
                <View style={s.locRow}>
                  <Ionicons name="warning-outline" size={16} color={COLORS.orange500} />
                  <Text style={[s.locText, s.locWarn, { flex: 1 }]}>Location access denied.</Text>
                  <TouchableOpacity onPress={() => Linking.openSettings()}>
                    <Text style={s.locAction}>Settings</Text>
                  </TouchableOpacity>
                </View>
              )}
              {!loc.loading && !loc.permissionDenied && !!loc.error && (
                <View style={s.locRow}>
                  <Ionicons name="alert-circle-outline" size={16} color={COLORS.red500} />
                  <Text style={[s.locText, s.locErr, { flex: 1 }]} numberOfLines={2}>{loc.error}</Text>
                  <TouchableOpacity onPress={loc.refetch}>
                    <Text style={s.locAction}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Pick location - Search */}
          {locationMode === 'pick' && !selectedArea && (
            <View style={{ marginTop: 12 }}>
              <View style={s.searchRow}>
                <Ionicons name="search" size={16} color={COLORS.gray400} />
                <TextInput
                  style={s.searchInput}
                  placeholder="Search neighborhood, street, building…"
                  placeholderTextColor={COLORS.gray400}
                  value={searchQuery}
                  onChangeText={handleSearchInput}
                  autoFocus
                />
                {searchLoading && <ActivityIndicator size="small" color={COLORS.green600} />}
              </View>
              {searchResults.length > 0 && (
                <View style={s.resultsList}>
                  {searchResults.map((result) => (
                    <TouchableOpacity
                      key={result.id}
                      style={s.resultItem}
                      onPress={() => handleSelectArea(result)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location" size={16} color={COLORS.green600} />
                      <Text style={s.resultText} numberOfLines={2}>{result.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
                <Text style={s.noResults}>No results found. Try a different search.</Text>
              )}
            </View>
          )}

          {/* Pick location - Map with pin */}
          {locationMode === 'pick' && selectedArea && (
            <View style={{ marginTop: 12 }}>
              <View style={s.selectedAreaRow}>
                <Ionicons name="location" size={16} color={COLORS.green600} />
                <Text style={s.selectedAreaText} numberOfLines={2}>{selectedArea.name}</Text>
                <TouchableOpacity onPress={handleResetPick}>
                  <Ionicons name="close-circle" size={20} color={COLORS.gray400} />
                </TouchableOpacity>
              </View>
              <LocationPicker
                center={{ lat: selectedArea.latitude, lng: selectedArea.longitude }}
                onLocationPick={handleLocationPick}
              />
            </View>
          )}
        </View>

        {/* ── Context ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="business-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Context</Text>
          </View>
          <View style={s.toggleRow}>
            {(['OUTDOOR', 'INDOOR'] as ReportContext[]).map(c => (
              <TouchableOpacity
                key={c}
                style={[s.pill, context === c && s.pillActive]}
                onPress={() => handleContextChange(c)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={c === 'OUTDOOR' ? 'sunny-outline' : 'home-outline'}
                  size={14}
                  color={context === c ? COLORS.white : COLORS.gray500}
                />
                <Text style={[s.pillLabel, context === c && s.pillLabelActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Indoor Details ── */}
        {context === 'INDOOR' && (
          <View style={s.card}>
            <View style={s.cardTitleRow}>
              <Ionicons name="business-outline" size={18} color={COLORS.green600} />
              <Text style={s.cardTitle}>Indoor Details</Text>
            </View>

            <Text style={s.fieldLabel}>
              Building name <Text style={s.required}>*</Text>
            </Text>
            <View style={s.searchRow}>
              <Ionicons name="search" size={16} color={COLORS.gray400} />
              <TextInput
                style={s.searchInput}
                placeholder="Search building…"
                placeholderTextColor={COLORS.gray400}
                value={buildingName}
                onChangeText={handleBuildingInput}
              />
              {buildingLoading && <ActivityIndicator size="small" color={COLORS.green600} />}
            </View>
            {buildingSuggestions.length > 0 && (
              <View style={s.resultsList}>
                {buildingSuggestions.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={s.resultItem}
                    onPress={() => handleSelectBuilding(r)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="business-outline" size={16} color={COLORS.green600} />
                    <Text style={s.resultText} numberOfLines={2}>{r.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {buildingUserEdited && buildingName.trim().length >= 2 && !buildingLoading && buildingSuggestions.length === 0 && (
              <Text style={s.noResults}>No results found. Try a different search.</Text>
            )}

            <Text style={[s.fieldLabel, { marginTop: 12 }]}>
              Floor <Text style={s.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={s.floorInput}
              placeholder="e.g. Ground Floor, 2nd Floor, Basement"
              placeholderTextColor={COLORS.gray400}
              value={floor}
              onChangeText={setFloor}
            />
          </View>
        )}

        {/* ── Category ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="list-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>
              Category <Text style={s.optional}>(optional)</Text>
            </Text>
          </View>
          <View style={s.grid}>
            {(context === 'INDOOR' ? INDOOR_CATEGORIES : OUTDOOR_CATEGORIES).map(cat => {
              const active = category === cat.value;
              return (
                <TouchableOpacity
                  key={cat.value}
                  style={[s.tile, active && s.tileActive]}
                  onPress={() => toggleCategory(cat.value)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={cat.icon} size={22} color={active ? COLORS.green700 : COLORS.gray500} />
                  <Text style={[s.tileLabel, active && s.tileLabelActive]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Photo ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="camera-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Photo</Text>
          </View>
          <PhotoPicker photos={photos} onAdd={addPhoto} onRemove={removePhoto} error={photoError} />
        </View>

        {/* ── Description ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="document-text-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>
              Description <Text style={s.optional}>(optional)</Text>
            </Text>
          </View>
          <TextInput
            style={s.textarea}
            placeholder="Describe the obstacle — size, severity, how it affects accessibility…"
            placeholderTextColor={COLORS.gray400}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── API error ── */}
        {!!apiError && (
          <View style={s.apiBanner}>
            <Ionicons name="close-circle" size={18} color={COLORS.red600} />
            <Text style={s.apiBannerText}>{apiError}</Text>
          </View>
        )}

        {/* ── Submit ── */}
        <TouchableOpacity
          style={[s.submitBtn, submitDisabled && s.submitBtnOff]}
          onPress={handleSubmit}
          disabled={submitDisabled}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <View style={s.submitRow}>
              <Ionicons name="flag" size={16} color={COLORS.white} />
              <Text style={s.submitLabel}>Submit Report</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:            { flex: 1 },
  page:            { flex: 1, backgroundColor: COLORS.gray100 },
  scroll:          { paddingTop: 12 },
  card:            { backgroundColor: COLORS.white, marginHorizontal: 14, marginBottom: 12, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow:    { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 12 },
  cardTitle:       { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  optional:        { fontSize: 12, fontWeight: '400', color: COLORS.gray400 },
  // Location
  locRow:          { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  locText:         { fontSize: 13, color: COLORS.gray700, flex: 1 },
  locWarn:         { color: COLORS.orange500 },
  locErr:          { color: COLORS.red500 },
  locAction:       { fontSize: 12, fontWeight: '600', color: COLORS.blue600 },
  // Context toggle
  toggleRow:       { flexDirection: 'row' as const, gap: 8 },
  pill:            { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray300, backgroundColor: COLORS.white },
  pillActive:      { backgroundColor: COLORS.green700, borderColor: COLORS.green700 },
  pillLabel:       { fontSize: 13, fontWeight: '700', color: COLORS.gray500 },
  pillLabelActive: { color: COLORS.white },
  // Category grid
  grid:            { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  tile:            { width: '47%' as const, alignItems: 'center' as const, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white, gap: 6 },
  tileActive:      { borderColor: COLORS.green600, backgroundColor: COLORS.green50 },
  tileLabel:       { fontSize: 12, fontWeight: '600', color: COLORS.gray500, textAlign: 'center' as const },
  tileLabelActive: { color: COLORS.green700 },
  // Description
  textarea:        { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.gray900, minHeight: 96 },
  // Error banner
  apiBanner:       { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginHorizontal: 14, marginBottom: 12, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText:   { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  // Submit
  submitBtn:       { marginHorizontal: 14, paddingVertical: 16, borderRadius: 12, backgroundColor: COLORS.blue600, alignItems: 'center' as const, justifyContent: 'center' as const },
  submitBtnOff:    { backgroundColor: COLORS.gray300 },
  submitRow:       { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  submitLabel:     { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  // Search
  searchRow:       { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchInput:     { flex: 1, fontSize: 14, color: COLORS.gray900, paddingVertical: 0, outlineStyle: 'none' },
  resultsList:     { marginTop: 8, borderWidth: 1, borderColor: COLORS.gray200, borderRadius: 10, overflow: 'hidden' as const },
  resultItem:      { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.gray200 },
  resultText:      { fontSize: 13, color: COLORS.gray700, flex: 1 },
  noResults:       { marginTop: 8, fontSize: 13, color: COLORS.gray400, textAlign: 'center' as const },
  // Selected area
  selectedAreaRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: COLORS.green50, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: COLORS.green200 },
  selectedAreaText:{ fontSize: 13, color: COLORS.green700, fontWeight: '600', flex: 1 },
  // Indoor Details
  fieldLabel:  { fontSize: 13, fontWeight: '600', color: COLORS.gray700, marginBottom: 6 },
  required:    { color: COLORS.red500 },
  floorInput:  {
    borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: COLORS.gray900,
  },
});
