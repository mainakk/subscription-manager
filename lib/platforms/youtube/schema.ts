import { z } from "zod";

/**
 * Tolerant Zod schemas for YouTube Data API v3 responses.
 * Unknown provider fields are allowed (.passthrough()); only the fields
 * the app depends on are validated. Never trust the network blindly.
 */

const ThumbnailSchema = z
  .object({ url: z.string() })
  .passthrough();

const ThumbnailsSchema = z
  .object({
    default: ThumbnailSchema.optional(),
    medium: ThumbnailSchema.optional(),
    high: ThumbnailSchema.optional(),
  })
  .partial()
  .passthrough();

export const SubscriptionItemSchema = z
  .object({
    id: z.string(),
    snippet: z
      .object({
        title: z.string(),
        description: z.string().optional().default(""),
        publishedAt: z.string(),
        thumbnails: ThumbnailsSchema.optional(),
        resourceId: z.object({
          kind: z.string(),
          channelId: z.string(),
        }),
      })
      .passthrough(),
    contentDetails: z
      .object({
        totalItemCount: z.number().optional(),
        newItemCount: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type SubscriptionItem = z.infer<typeof SubscriptionItemSchema>;

export const SubscriptionsListResponseSchema = z
  .object({
    items: z.array(SubscriptionItemSchema).default([]),
    nextPageToken: z.string().optional(),
  })
  .passthrough();

export const ChannelItemSchema = z
  .object({
    id: z.string(),
    snippet: z
      .object({
        title: z.string(),
        description: z.string().optional(),
        publishedAt: z.string().optional(),
        thumbnails: ThumbnailsSchema.optional(),
        country: z.string().optional(),
      })
      .passthrough()
      .optional(),
    statistics: z
      .object({
        viewCount: z.union([z.string(), z.number()]).optional(),
        subscriberCount: z.union([z.string(), z.number()]).optional(),
        hiddenSubscriberCount: z.boolean().optional(),
        videoCount: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
    contentDetails: z
      .object({
        relatedPlaylists: z
          .object({
            uploads: z.string().optional(),
            likes: z.string().optional(),
          })
          .partial()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ChannelItem = z.infer<typeof ChannelItemSchema>;

export const ChannelsListResponseSchema = z
  .object({
    items: z.array(ChannelItemSchema).default([]),
  })
  .passthrough();

export const MyChannelResponseSchema = z
  .object({
    items: z.array(z.object({ id: z.string() }).passthrough()).default([]),
  })
  .passthrough();

export const PlaylistItemSchema = z
  .object({
    id: z.string(),
    snippet: z
      .object({
        title: z.string(),
        publishedAt: z.string(),
        playlistId: z.string(),
        resourceId: z
          .object({
            kind: z.string(),
            videoId: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type PlaylistItem = z.infer<typeof PlaylistItemSchema>;

export const PlaylistItemsListResponseSchema = z
  .object({
    items: z.array(PlaylistItemSchema).default([]),
  })
  .passthrough();
