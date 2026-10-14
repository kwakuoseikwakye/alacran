import {
  SEED_NEWSLETTERS,
  type Newsletter,
  type NewsletterSummary,
} from "./types";

/** Roll a newsletter list into headline figures. Empty-safe. */
export function newsletterSummary(list: Newsletter[]): NewsletterSummary {
  if (list.length === 0) {
    return { count: 0, totalRecipients: 0, avgOpenRate: 0, bestOpenRate: 0 };
  }
  const totalRecipients = list.reduce((s, n) => s + n.recipients, 0);
  const avgOpenRate = list.reduce((s, n) => s + n.openRate, 0) / list.length;
  const bestOpenRate = Math.max(...list.map((n) => n.openRate));
  return {
    count: list.length,
    totalRecipients,
    avgOpenRate: Math.round(avgOpenRate * 100) / 100,
    bestOpenRate,
  };
}

export async function readNewsletters(
  _companyRoot?: string,
  options?: { fallbackToSeed?: boolean }
): Promise<{
  newsletters: Newsletter[];
  subscribers: number | null;
  summary: NewsletterSummary;
  isLive: boolean;
}> {
  const key = process.env.BEEHIIV_API_KEY;
  const pub = process.env.BEEHIIV_PUBLICATION_ID;
  const isLive = Boolean(key && pub);

  const newsletters = options?.fallbackToSeed ? SEED_NEWSLETTERS : [];
  const summary = newsletterSummary(newsletters);
  const subscribers = isLive ? null : options?.fallbackToSeed ? 15400 : null;

  return {
    newsletters,
    subscribers,
    summary,
    isLive,
  };
}
