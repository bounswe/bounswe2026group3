import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ResolveModal from '../components/authority/ResolveModal';
import * as authorityApi from '../api/authority';

jest.mock('../api/authority');
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

// PhotoPicker uses expo-image-picker which we don't want to invoke in tests.
// The mock exposes onAdd/onRemove so we can simulate selecting a photo.
jest.mock('../components/reports/PhotoPicker', () => {
  const { Text, TouchableOpacity, View } = require('react-native');
  function MockPhotoPicker({ photos, onAdd, onRemove, error }: any) {
    return (
      <View>
        <Text testID="photo-count">{`photos:${photos.length}`}</Text>
        <TouchableOpacity
          testID="mock-add-photo"
          onPress={() => onAdd({ uri: 'mock://photo.jpg', b64: 'BASE64DATA' })}
        >
          <Text>add</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="mock-remove-photo" onPress={() => onRemove(0)}>
          <Text>remove</Text>
        </TouchableOpacity>
        {!!error && <Text testID="photo-error-text">{error}</Text>}
      </View>
    );
  }
  return { __esModule: true, default: MockPhotoPicker };
});

const mockResolveReport = authorityApi.resolveReport as jest.MockedFunction<
  typeof authorityApi.resolveReport
>;

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveReport.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      reportId: 'r1',
      status: 'RESOLVED_AWAITING_VALIDATION',
      repairPhotoUrl: 'https://cdn/r1.jpg',
      updatedAt: '2026-05-08T12:00:00Z',
    },
  });
});

function setup(props: Partial<React.ComponentProps<typeof ResolveModal>> = {}) {
  const onClose = jest.fn();
  const onResolved = jest.fn();
  const utils = render(
    <ResolveModal
      visible
      reportId="r1"
      reportTitle="Broken Ramp at Atatürk Cd."
      onClose={onClose}
      onResolved={onResolved}
      {...props}
    />,
  );
  return { ...utils, onClose, onResolved };
}

it('shows a validation error and does not call the API when no photo is attached', async () => {
  const { getByTestId, onResolved } = setup();

  await act(async () => {
    fireEvent.press(getByTestId('resolve-submit'));
  });

  expect(getByTestId('photo-error-text').props.children).toBe('A post-repair photo is required.');
  expect(mockResolveReport).not.toHaveBeenCalled();
  expect(onResolved).not.toHaveBeenCalled();
});

it('calls resolveReport with the base64 photo and notes when valid', async () => {
  const { getByTestId, onResolved } = setup();

  await act(async () => {
    fireEvent.press(getByTestId('mock-add-photo'));
  });
  fireEvent.changeText(getByTestId('resolve-notes'), 'Patched the ramp.');

  await act(async () => {
    fireEvent.press(getByTestId('resolve-submit'));
  });

  await waitFor(() => {
    expect(mockResolveReport).toHaveBeenCalledWith('r1', {
      repairPhoto: 'BASE64DATA',
      repairNotes: 'Patched the ramp.',
    });
  });
  expect(onResolved).toHaveBeenCalled();
});

it('keeps the modal open and surfaces a 409 conflict error', async () => {
  mockResolveReport.mockResolvedValue({
    ok: false,
    status: 409,
    data: { detail: 'already resolved' },
  });
  const { getByTestId, getByText, onResolved } = setup();

  await act(async () => {
    fireEvent.press(getByTestId('mock-add-photo'));
  });

  await act(async () => {
    fireEvent.press(getByTestId('resolve-submit'));
  });

  await waitFor(() => expect(getByText('Report is already resolved.')).toBeTruthy());
  expect(onResolved).not.toHaveBeenCalled();
});

it('clears the photo when remove is tapped', async () => {
  const { getByTestId } = setup();

  await act(async () => {
    fireEvent.press(getByTestId('mock-add-photo'));
  });
  expect(getByTestId('photo-count').props.children).toBe('photos:1');

  await act(async () => {
    fireEvent.press(getByTestId('mock-remove-photo'));
  });
  expect(getByTestId('photo-count').props.children).toBe('photos:0');
});

it('surfaces a 403 error when the authority lacks permission', async () => {
  mockResolveReport.mockResolvedValue({
    ok: false, status: 403, data: { detail: 'forbidden' },
  });
  const { getByTestId, getByText, onResolved } = setup();

  await act(async () => { fireEvent.press(getByTestId('mock-add-photo')); });
  await act(async () => { fireEvent.press(getByTestId('resolve-submit')); });

  expect(getByText('You do not have permission to resolve this report.')).toBeTruthy();
  expect(onResolved).not.toHaveBeenCalled();
});

it('surfaces a 404 error when the report no longer exists', async () => {
  mockResolveReport.mockResolvedValue({
    ok: false, status: 404, data: { detail: 'not found' },
  });
  const { getByTestId, getByText, onResolved } = setup();

  await act(async () => { fireEvent.press(getByTestId('mock-add-photo')); });
  await act(async () => { fireEvent.press(getByTestId('resolve-submit')); });

  expect(getByText('Report not found.')).toBeTruthy();
  expect(onResolved).not.toHaveBeenCalled();
});

it('does not call the API when the user cancels', async () => {
  const { getByText, onClose } = setup();

  await act(async () => { fireEvent.press(getByText('Cancel')); });

  expect(mockResolveReport).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

it('only calls the API once even if submit is pressed twice quickly', async () => {
  let resolveSubmit: (v: any) => void = () => {};
  mockResolveReport.mockImplementation(
    () => new Promise((r) => { resolveSubmit = r; }),
  );
  const { getByTestId } = setup();

  await act(async () => { fireEvent.press(getByTestId('mock-add-photo')); });
  await act(async () => {
    fireEvent.press(getByTestId('resolve-submit'));
    fireEvent.press(getByTestId('resolve-submit'));
  });

  expect(mockResolveReport).toHaveBeenCalledTimes(1);

  // Resolve the in-flight request so the test exits cleanly.
  await act(async () => {
    resolveSubmit({
      ok: true, status: 200,
      data: {
        reportId: 'r1', status: 'RESOLVED_AWAITING_VALIDATION',
        repairPhotoUrl: 'https://cdn/r1.jpg',
        updatedAt: '2026-05-08T12:00:00Z',
      },
    });
  });
});

it('omits repairNotes from the payload when notes are blank', async () => {
  const { getByTestId } = setup();

  await act(async () => { fireEvent.press(getByTestId('mock-add-photo')); });
  // notes intentionally left empty
  await act(async () => { fireEvent.press(getByTestId('resolve-submit')); });

  expect(mockResolveReport).toHaveBeenCalledWith('r1', {
    repairPhoto: 'BASE64DATA',
    repairNotes: undefined,
  });
});
