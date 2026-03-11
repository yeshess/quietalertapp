export interface Alert {
  id: string;
  timestamp_utc: number;
  timestamp_local: string;
  location: string;
  type: string;
  category: number;
}

export interface UserSettings {
  vibration_profile: 'short' | 'long' | 'intense' | 'pulse';
  night_mode_enabled: boolean;
  night_mode_start: string;
  night_mode_end: string;
  flashlight_enabled: boolean;
}

export interface Location {
  id: number;
  name: string;
}

export const VIBRATION_PATTERNS = {
  short: [200, 100, 200],
  long: [1000, 500, 1000],
  intense: [100, 50, 100, 50, 100, 50, 100],
  pulse: [500, 200, 500, 200, 500]
};
