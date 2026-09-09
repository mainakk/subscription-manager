/**
 * Platform adapter abstraction (M0 types only; implementations land in M1+).
 * The UI and domain logic depend on this interface, never on YouTube specifics.
 */

export type Platform = "youtube" | "facebook";

export interface PlatformCapabilities {
  /** Can list the user's sources on this platform. */
  readSources: boolean;
  /** Can unsubscribe/remove the source externally (vs local-only removal). */
  unsubscribe: boolean;
  /** Removal only deletes the local record; the external subscription is untouched. */
  localOnlyUnsubscribe?: boolean;
  /** Can read content metadata (uploads, counts) for enrichment. */
  readContent: boolean;
}

export type SourceStatus = "active" | "unsubscribed" | "unavailable_externally";

export interface NormalizedSource {
  /** Platform-native channel/feed/account id (YouTube: channelId). */
  externalId: string;
  /** Platform subscription resource id when applicable (YouTube subscriptions.delete needs this). */
  subscriptionExternalId: string | null;
  name: string;
  url: string;
  imageUrl: string | null;
  providerDescription: string | null;
  subscribedAt: string | null;
  videoCount: number | null;
  subscriberCount: number | null;
  lastUploadAt: string | null;
  metadata: Record<string, unknown>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

export interface PlatformAdapterContext {
  accessToken: string;
}

export interface PlatformAdapter {
  readonly platform: Platform;
  readonly capabilities: PlatformCapabilities;
  listSources(
    ctx: PlatformAdapterContext,
  ): AsyncIterable<NormalizedSource[]>;
  unsubscribe(
    ctx: PlatformAdapterContext,
    subscriptionExternalId: string,
  ): Promise<void>;
  refreshToken(refreshToken: string): Promise<TokenPair>;
}
