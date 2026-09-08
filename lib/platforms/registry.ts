import type { Platform, PlatformAdapter } from "@/lib/platforms/types";

const adapters = new Map<Platform, PlatformAdapter>();

/** Registers a platform adapter. Called by platform modules (M1+: youtube). */
export function registerAdapter(adapter: PlatformAdapter): void {
  adapters.set(adapter.platform, adapter);
}

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters.get(platform);
  if (!adapter) {
    throw new Error(`No adapter registered for platform: ${platform}`);
  }
  return adapter;
}

export function registeredPlatforms(): Platform[] {
  return [...adapters.keys()];
}
