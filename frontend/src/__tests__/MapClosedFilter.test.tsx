/**
 * Tests for Issue #180: CLOSED reports must NOT render as map markers.
 *
 * Covers three required cases:
 *   1. CLOSED reports are filtered out of marker rendering
 *   2. A visible marker is removed when its status updates to CLOSED
 *      mid-session (i.e. the filter applies on every render, not only
 *      at fetch time)
 *   3. The existing `includePassive` filter is unaffected — CLOSED
 *      filtering is additive/orthogonal to it
 *
 * The shared `filterVisibleObstacles()` helper is what both map renderers
 * (web and native WebView) use at render time, so testing it as a pure
 * function — plus a tiny render harness for the mid-session case — gives
 * end-to-end coverage of the behavior without dragging in react-leaflet
 * or react-native-webview.
 */

import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';

import {
  fetchObstacles,
  filterVisibleObstacles,
  type Obstacle,
} from '../api/map';

// Backend mock for fetch-level filter assertions
const mockFetch = jest.fn();
// @ts-ignore — assigning to global fetch in Jest
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

const BBOX = { north: 41.1, south: 41.0, east: 29.1, west: 29.0 };

function obstacle(over: Partial<Obstacle> = {}): Obstacle {
  return {
    id: 'o1',
    title: 'Cracked ramp',
    description: '',
    category: 'BROKEN_RAMP',
    status: 'VERIFIED',
    latitude: 41.05,
    longitude: 29.05,
    isIndoor: false,
    ...over,
  };
}

// ── Pure helper ─────────────────────────────────────────────────────────────
describe('filterVisibleObstacles', () => {
  it('removes CLOSED obstacles from the list', () => {
    const list = [
      obstacle({ id: 'a', status: 'VERIFIED' }),
      obstacle({ id: 'b', status: 'CLOSED' }),
      obstacle({ id: 'c', status: 'UNVERIFIED' }),
      obstacle({ id: 'd', status: 'CLOSED' }),
    ];
    const visible = filterVisibleObstacles(list).map((o) => o.id);
    expect(visible).toEqual(['a', 'c']);
  });

  it('does NOT touch PASSIVE obstacles (orthogonal to includePassive)', () => {
    const list = [
      obstacle({ id: 'a', status: 'PASSIVE' }),
      obstacle({ id: 'b', status: 'CLOSED' }),
      obstacle({ id: 'c', status: 'VERIFIED' }),
    ];
    const visible = filterVisibleObstacles(list).map((o) => o.id);
    // 'a' (PASSIVE) is preserved — only CLOSED is dropped.
    expect(visible).toEqual(['a', 'c']);
  });

  it('returns a new array (does not mutate input)', () => {
    const input = [obstacle({ id: 'a', status: 'CLOSED' })];
    const out = filterVisibleObstacles(input);
    expect(input.length).toBe(1);
    expect(out).not.toBe(input);
  });
});

// ── Fetch-level filter ──────────────────────────────────────────────────────
describe('fetchObstacles — CLOSED stripped at the fetch boundary', () => {
  it('drops CLOSED reports from the response array', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([
        { reportId: 'a', category: 'BROKEN_RAMP', status: 'VERIFIED',
          location: { lat: 41.05, lng: 29.05 } },
        { reportId: 'b', category: 'BROKEN_RAMP', status: 'CLOSED',
          location: { lat: 41.05, lng: 29.05 } },
      ]),
    });
    const data = await fetchObstacles(BBOX, false);
    expect(data.map((o) => o.id)).toEqual(['a']);
  });

  it('preserves the includePassive query parameter unchanged (false)', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await fetchObstacles(BBOX, false);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('includePassive=false');
  });

  it('preserves the includePassive query parameter unchanged (true)', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    await fetchObstacles(BBOX, true);
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('includePassive=true');
  });

  it('keeps PASSIVE results when includePassive=true and still drops CLOSED', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([
        { reportId: 'a', category: 'BROKEN_RAMP', status: 'PASSIVE',
          location: { lat: 41.05, lng: 29.05 } },
        { reportId: 'b', category: 'BROKEN_RAMP', status: 'CLOSED',
          location: { lat: 41.05, lng: 29.05 } },
        { reportId: 'c', category: 'BROKEN_RAMP', status: 'VERIFIED',
          location: { lat: 41.05, lng: 29.05 } },
      ]),
    });
    const data = await fetchObstacles(BBOX, true);
    expect(data.map((o) => o.id).sort()).toEqual(['a', 'c']);
    // Sanity: CLOSED is gone but PASSIVE is preserved (orthogonality).
    expect(data.find((o) => o.status === 'PASSIVE')).toBeTruthy();
    expect(data.find((o) => o.status === 'CLOSED')).toBeFalsy();
  });
});

// ── Render-time filter — mid-session status update ──────────────────────────
/**
 * Tiny render harness using the same `filterVisibleObstacles` helper that
 * both real map renderers call inside their JSX/forEach. Asserting on this
 * proves the filter applies on every render, so a status flip to CLOSED
 * removes the marker without a full reload.
 */
function MarkerList({ obstacles }: { obstacles: Obstacle[] }) {
  return (
    <View>
      {filterVisibleObstacles(obstacles).map((o) => (
        <Text key={o.id} testID={`marker-${o.id}`}>{o.id}</Text>
      ))}
    </View>
  );
}

describe('Render-time filter', () => {
  it('does not render a marker for a CLOSED obstacle (initial render)', () => {
    const list = [
      obstacle({ id: 'visible', status: 'VERIFIED' }),
      obstacle({ id: 'hidden',  status: 'CLOSED' }),
    ];
    const { getByTestId, queryByTestId } = render(<MarkerList obstacles={list} />);
    expect(getByTestId('marker-visible')).toBeTruthy();
    expect(queryByTestId('marker-hidden')).toBeNull();
  });

  it('removes a visible marker when its status updates to CLOSED mid-session', () => {
    const initial = [
      obstacle({ id: 'x', status: 'VERIFIED' }),
      obstacle({ id: 'y', status: 'UNVERIFIED' }),
    ];
    const { getByTestId, queryByTestId, rerender } = render(
      <MarkerList obstacles={initial} />,
    );
    // Both markers present initially
    expect(getByTestId('marker-x')).toBeTruthy();
    expect(getByTestId('marker-y')).toBeTruthy();

    // Status of x flips to CLOSED — same component, no remount
    const updated = [
      obstacle({ id: 'x', status: 'CLOSED' }),
      obstacle({ id: 'y', status: 'UNVERIFIED' }),
    ];
    rerender(<MarkerList obstacles={updated} />);

    expect(queryByTestId('marker-x')).toBeNull();
    expect(getByTestId('marker-y')).toBeTruthy();
  });

  it('still renders PASSIVE markers (includePassive logic is unaffected)', () => {
    const list = [
      obstacle({ id: 'p', status: 'PASSIVE' }),
      obstacle({ id: 'c', status: 'CLOSED' }),
      obstacle({ id: 'v', status: 'VERIFIED' }),
    ];
    const { getByTestId, queryByTestId } = render(<MarkerList obstacles={list} />);
    expect(getByTestId('marker-p')).toBeTruthy();   // PASSIVE preserved
    expect(getByTestId('marker-v')).toBeTruthy();
    expect(queryByTestId('marker-c')).toBeNull();   // CLOSED removed
  });
});
