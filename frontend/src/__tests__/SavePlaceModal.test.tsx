import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SavePlaceModal from '../components/map/SavePlaceModal';

const baseProps = {
  label: '',
  onLabelChange: jest.fn(),
  saving: false,
  error: '',
  onSave: jest.fn(),
  onCancel: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

it('renders Home and Work preset chips', () => {
  const { getByTestId } = render(<SavePlaceModal {...baseProps} />);
  expect(getByTestId('preset-chip-home')).toBeTruthy();
  expect(getByTestId('preset-chip-work')).toBeTruthy();
});

it('pressing a preset chip calls onLabelChange with that preset', () => {
  const onLabelChange = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} onLabelChange={onLabelChange} />);

  fireEvent.press(getByTestId('preset-chip-home'));

  expect(onLabelChange).toHaveBeenCalledWith('Home');
});

it('pressing Work preset chip calls onLabelChange with "Work"', () => {
  const onLabelChange = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} onLabelChange={onLabelChange} />);

  fireEvent.press(getByTestId('preset-chip-work'));

  expect(onLabelChange).toHaveBeenCalledWith('Work');
});

it('save button is disabled when label is empty', () => {
  const onSave = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} label="" onSave={onSave} />);

  fireEvent.press(getByTestId('save-btn'));

  expect(onSave).not.toHaveBeenCalled();
});

it('save button is disabled while saving is true', () => {
  const onSave = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} label="Home" saving={true} onSave={onSave} />);

  fireEvent.press(getByTestId('save-btn'));

  expect(onSave).not.toHaveBeenCalled();
});

it('calls onSave when label is set and save button is pressed', () => {
  const onSave = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} label="Home" onSave={onSave} />);

  fireEvent.press(getByTestId('save-btn'));

  expect(onSave).toHaveBeenCalledTimes(1);
});

it('does not show error banner when error is empty', () => {
  const { queryByTestId } = render(<SavePlaceModal {...baseProps} error="" />);
  expect(queryByTestId('save-error-banner')).toBeNull();
});

it('shows error banner with message when error is set', () => {
  const { getByTestId, getByText } = render(
    <SavePlaceModal {...baseProps} error="Failed to save place. Please try again." />,
  );
  expect(getByTestId('save-error-banner')).toBeTruthy();
  expect(getByText('Failed to save place. Please try again.')).toBeTruthy();
});

it('calls onCancel when cancel button is pressed', () => {
  const onCancel = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} onCancel={onCancel} />);

  fireEvent.press(getByTestId('cancel-btn'));

  expect(onCancel).toHaveBeenCalledTimes(1);
});

it('typing in the label input calls onLabelChange', () => {
  const onLabelChange = jest.fn();
  const { getByTestId } = render(<SavePlaceModal {...baseProps} onLabelChange={onLabelChange} />);

  fireEvent.changeText(getByTestId('save-label-input'), 'Gym');

  expect(onLabelChange).toHaveBeenCalledWith('Gym');
});
