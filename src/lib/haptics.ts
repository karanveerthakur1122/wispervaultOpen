/** Trigger haptic feedback via the Vibration API (mobile browsers). */
export const haptic = {
  light: () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(25),
  heavy: () => navigator.vibrate?.(50),
  success: () => navigator.vibrate?.([10, 30, 10]),
};
