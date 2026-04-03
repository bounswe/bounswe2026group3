// Suppress the act(...) warnings produced by TouchableOpacity's Animated internals
// and async state updates in hooks. These are a known RNTL v12 + React 18 interaction
// and do not affect test correctness. See:
// https://github.com/callstack/react-native-testing-library/issues/1572
const originalError = console.error.bind(console);
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation((msg, ...args) => {
    if (typeof msg === 'string' && msg.includes('not wrapped in act')) return;
    originalError(msg, ...args);
  });
});
afterAll(() => {
  console.error.mockRestore?.();
});
