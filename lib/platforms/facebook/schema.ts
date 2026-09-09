import { z } from "zod";

export const PageSchema = z.object({
  id: z.string(),
  name: z.string(),
  link: z.string().url().optional(),
  access_token: z.string().optional(),
  picture: z.object({ data: z.object({ url: z.string().url() }).optional() }).optional(),
  category: z.string().optional(),
});
export const PagesResponseSchema = z.object({
  data: z.array(PageSchema),
  paging: z.object({ next: z.string().url().optional() }).optional(),
});
export type FacebookPage = z.infer<typeof PageSchema>;
