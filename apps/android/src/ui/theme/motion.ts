/**
 * Motion tokens and the reduced-motion hook. Presses and state settles use
 * springs; reveals use short timing curves. Nothing blocks input.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing, Platform } from 'react-native';
import { duration, spring } from './primitives';

export const easing = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  decelerate: Easing.bezier(0.05, 0.7, 0.1, 1),
  accelerate: Easing.bezier(0.3, 0, 0.8, 0.15),
};

/** Native driver is unavailable on web, so callers gate on this. */
export const useNativeDriver = Platform.OS !== 'web';

export const motion = { duration, easing, spring };

/** Tracks the OS reduce-motion setting, with a safe web fallback. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value: boolean) => {
        if (active) setReduced(value);
      })
      .catch(() => {
        // Older platforms: assume motion is allowed.
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => setReduced(value),
    );
    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return reduced;
}