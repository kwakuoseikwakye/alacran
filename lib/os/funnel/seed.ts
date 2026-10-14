import type { FunnelJourney, FunnelTouch, FunnelStageId } from "@/lib/os/departments/adapters/funnel-adapter";

const funnelDay = (daysBack: number): string =>
  new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);

type SeededTouch = [FunnelStageId, string, string, string, number];
type SeededJourney = {
  id: string;
  name: string;
  venture: string;
  relationship: "hot" | "warm" | "cold";
  likelihood: number;
  product?: string;
  amountUsd?: number;
  email?: string;
  phone?: string;
  person?: string;
  company?: string;
  role?: string;
  linkedin?: string;
  url?: string;
  touches: SeededTouch[];
};

export const RAW_SEED_JOURNEYS: SeededJourney[] = [
  // — Launchpad Cohort (mentorship) —
  {
    id: "fc-jake-moreau",
    name: "Jake Moreau",
    venture: "launchpad-cohort",
    relationship: "hot",
    likelihood: 100,
    product: "Launchpad Cohort — mentorship (PIF)",
    amountUsd: 6800,
    email: "jake@moreaudigital.example.com",
    phone: "+15550100234",
    person: "Jake Moreau",
    company: "Moreau Digital",
    role: "Founder",
    touches: [
      ["first_touch", "organic", 'IG reel: "3 AI offers that close themselves"', "trakyo", 59],
      ["engaged", "dm", 'Replied to story CTA — "wants out of retainer hell"', "manual", 57],
      ["nurtured", "email", "Day-3 email: student case study (0→22k/mo)", "manual", 54],
      ["opted_in", "call", "Booked strategy call via Trakyo link", "trakyo", 51],
      ["converted", "checkout", "Paid in full — PayKit checkout", "manual", 49],
    ],
  },
  {
    id: "fc-priya-shah",
    name: "Priya Shah",
    venture: "launchpad-cohort",
    relationship: "warm",
    likelihood: 95,
    product: "Launchpad Cohort — mentorship (3-pay)",
    amountUsd: 2600,
    email: "priya@shahmedia.example.com",
    person: "Priya Shah",
    company: "Shah Media",
    touches: [
      ["first_touch", "ads", 'Meta ad: "Agency owners — install AI in 30 days"', "meta-ads", 45],
      ["engaged", "ads", "Watched VSL to 80% — retarget pool", "meta-ads", 45],
      ["opted_in", "webinar", "Registered + attended WebinarJam training", "manual", 42],
      ["converted", "checkout", "First of 3 payments — PayKit", "manual", 40],
    ],
  },
  {
    id: "fc-danny-okafor",
    name: "Danny Okafor",
    venture: "launchpad-cohort",
    relationship: "hot",
    likelihood: 100,
    product: "Launchpad Cohort — mentorship (PIF)",
    amountUsd: 6800,
    email: "danny@okafor.example.com",
    person: "Danny Okafor",
    touches: [
      ["first_touch", "organic", 'TikTok: "day in the life running an AI agency"', "trakyo", 38],
      ["engaged", "organic", "Binged 6 reels, followed, saved lead magnet post", "trakyo", 36],
      ["nurtured", "ads", "Retargeting ad: student-wins carousel", "meta-ads", 33],
      ["opted_in", "call", "Booked call from link-in-bio (Trakyo attributed)", "trakyo", 30],
      ["converted", "checkout", "Paid in full — PayKit checkout", "manual", 29],
    ],
  },
  {
    id: "fc-sofia-reyes",
    name: "Sofia Reyes",
    venture: "launchpad-cohort",
    relationship: "warm",
    likelihood: 95,
    product: "Launchpad Cohort — mentorship (3-pay)",
    amountUsd: 2600,
    email: "sofia@reyesdesign.example.com",
    touches: [
      ["first_touch", "organic", 'YT long-form: "how I\'d start an agency in 2026"', "trakyo", 31],
      ["engaged", "email", "Joined newsletter from YT description", "manual", 30],
      ["nurtured", "email", "Newsletter: pricing-psychology issue clicked", "manual", 26],
      ["opted_in", "webinar", "Attended WebinarJam training, stayed for offer", "manual", 23],
      ["converted", "checkout", "First of 3 payments — PayKit", "manual", 22],
    ],
  },
  {
    id: "fc-liam-carter",
    name: "Liam Carter",
    venture: "launchpad-cohort",
    relationship: "cold",
    likelihood: 15,
    email: "liam@carter.example.com",
    touches: [
      ["first_touch", "ads", 'Meta ad: "stop selling hours" (cold traffic)', "meta-ads", 27],
      ["engaged", "ads", "Clicked through, watched VSL 45%", "meta-ads", 27],
      ["engaged", "ads", "Retarget click — opened application form, abandoned", "meta-ads", 23],
      ["engaged", "email", "Abandoned-form email opened, no reply yet", "manual", 21],
    ],
  },
  {
    id: "fc-marcus-webb",
    name: "Marcus Webb",
    venture: "launchpad-cohort",
    relationship: "warm",
    likelihood: 42,
    email: "marcus@webbgrowth.example.com",
    touches: [
      ["first_touch", "organic", 'IG carousel: "agency niches that print in 2026"', "trakyo", 24],
      ["engaged", "dm", 'DMFlow keyword "SCALE" → DM flow', "manual", 24],
      ["nurtured", "email", "Lead magnet delivered, day-1 email opened", "manual", 12],
      ["nurtured", "email", "Newsletter: student-win breakdown clicked", "manual", 10],
    ],
  },
  {
    id: "fc-tayla-nguyen",
    name: "Tayla Nguyen",
    venture: "launchpad-cohort",
    relationship: "hot",
    likelihood: 84,
    email: "tayla.nguyen@example.com",
    phone: "+15550100841",
    touches: [
      ["first_touch", "organic", 'TikTok: "AI receptionist demo" went semi-viral', "trakyo", 4],
      ["engaged", "organic", "Profile visit → followed + commented", "trakyo", 4],
      ["nurtured", "dm", "DM convo — asked about payment plans", "manual", 3],
      ["opted_in", "call", "Call booked for next week (Trakyo attributed)", "trakyo", 2],
    ],
  },
  {
    id: "fc-remy-cole",
    name: "Remy Cole",
    venture: "launchpad-cohort",
    relationship: "cold",
    likelihood: 25,
    touches: [
      ["first_touch", "organic", 'IG reel: "fire your lead-gen agency"', "trakyo", 84],
      ["engaged", "dm", "Story-reply convo, asked for pricing", "manual", 80],
      ["engaged", "email", "Pricing breakdown sent, opened twice", "manual", 74],
      ["engaged", "email", 'Follow-up: "circling back" — no reply since', "manual", 70],
    ],
  },
  {
    id: "fc-jordan-blake",
    name: "Jordan Blake",
    venture: "launchpad-cohort",
    relationship: "cold",
    likelihood: 20,
    touches: [
      ["first_touch", "ads", 'Meta ad: "quit your 9-5 with one client" (old campaign)', "meta-ads", 118],
      ["engaged", "ads", "Clicked through, watched VSL 30%", "meta-ads", 118],
      ["engaged", "dm", "One-word DM reply, then silence", "manual", 112],
      ["engaged", "email", "Re-engagement email bounced-opened, no click", "manual", 104],
    ],
  },
  // — Vantage (AI agency clients) —
  {
    id: "fc-ava-stone",
    name: "Ava Stone — Northwind Legal",
    venture: "vantage",
    relationship: "hot",
    likelihood: 100,
    product: "Vantage — AI intake build (sprint)",
    amountUsd: 12000,
    person: "Ava Stone",
    company: "Northwind Legal",
    role: "Managing Partner",
    email: "ava@northwindlegal.example.com",
    url: "https://app.attio.com/w/vantage/records/ava-stone",
    touches: [
      ["first_touch", "organic", "LinkedIn post: legal-intake automation teardown", "trakyo", 57],
      ["engaged", "email", 'Replied to newsletter — "this is our exact bottleneck"', "manual", 55],
      ["opted_in", "call", "Discovery call booked via site (Trakyo attributed)", "trakyo", 50],
      ["nurtured", "email", "Proposal + Loom walkthrough sent, viewed 3×", "manual", 47],
      ["converted", "checkout", "Signed — 50% deposit via Stripe invoice", "manual", 43],
    ],
  },
  {
    id: "fc-omar-haddad",
    name: "Omar Haddad — Pulse Fitness Group",
    venture: "vantage",
    relationship: "warm",
    likelihood: 95,
    product: "Vantage — AI ops retainer (monthly)",
    amountUsd: 4500,
    person: "Omar Haddad",
    company: "Pulse Fitness Group",
    role: "COO",
    email: "omar@pulsefitness.example.com",
    touches: [
      ["first_touch", "ads", 'Meta ad: "your gym\'s front desk, automated"', "meta-ads", 48],
      ["engaged", "ads", "Case-study page dwell 4m — retarget pool", "meta-ads", 47],
      ["nurtured", "email", "ROI one-pager emailed after form fill", "manual", 44],
      ["opted_in", "call", "Demo call — 3 locations scoped", "manual", 41],
      ["converted", "checkout", "Retainer live — Stripe subscription", "manual", 37],
    ],
  },
  {
    id: "fc-elena-brooks",
    name: "Elena Brooks — Harbor Dental",
    venture: "vantage",
    relationship: "hot",
    likelihood: 100,
    product: "Vantage — AI intake build (sprint)",
    amountUsd: 9500,
    person: "Elena Brooks",
    company: "Harbor Dental",
    role: "Founder",
    email: "elena@harbordental.example.com",
    touches: [
      ["first_touch", "organic", "IG reel: missed-call → booked-patient demo", "trakyo", 31],
      ["engaged", "dm", 'DM: "does this work for dental?"', "manual", 30],
      ["opted_in", "call", "Discovery call via link-in-bio (Trakyo attributed)", "trakyo", 27],
      ["converted", "checkout", "Signed — deposit via Stripe invoice", "manual", 23],
    ],
  },
  {
    id: "fc-noah-fields",
    name: "Noah Fields — Fields Roofing",
    venture: "vantage",
    relationship: "warm",
    likelihood: 66,
    person: "Noah Fields",
    company: "Fields Roofing",
    email: "noah@fieldsroofing.example.com",
    phone: "+15550100661",
    touches: [
      ["first_touch", "ads", 'Meta ad: "book 20 estimates/mo on autopilot"', "meta-ads", 8],
      ["engaged", "ads", "Lead form opened, 60% VSL", "meta-ads", 8],
      ["nurtured", "email", "Follow-up sequence day 2 — case study clicked", "manual", 5],
      ["opted_in", "call", "Discovery call booked for Friday", "manual", 2],
    ],
  },
  {
    id: "fc-grace-lin",
    name: "Grace Lin — Lin & Co Accounting",
    venture: "vantage",
    relationship: "warm",
    likelihood: 74,
    person: "Grace Lin",
    company: "Lin & Co Accounting",
    role: "Managing Partner",
    email: "grace@linandco.example.com",
    phone: "+15550100742",
    linkedin: "https://linkedin.com/in/gracelin-example",
    touches: [
      ["first_touch", "organic", "X thread: client-onboarding agent breakdown", "trakyo", 6],
      ["engaged", "organic", "Followed + bookmarked, visited site twice", "trakyo", 5],
      ["nurtured", "email", "Newsletter signup — welcome sequence started", "manual", 3],
      ["opted_in", "call", "Call request form submitted (Trakyo attributed)", "trakyo", 1],
    ],
  },
];

export function getSeedFunnelJourneys(): FunnelJourney[] {
  return RAW_SEED_JOURNEYS.map((j) => {
    const touches: FunnelTouch[] = j.touches.map((t, idx) => ({
      id: `${j.id}-t${idx + 1}`,
      stage: t[0],
      channel: t[1],
      label: t[2],
      source: t[3],
      at: funnelDay(t[4]),
    }));

    const lastTouch = touches[touches.length - 1];
    const status = lastTouch ? lastTouch.stage : "first_touch";

    return {
      id: j.id,
      name: j.name,
      venture: j.venture,
      status,
      relationship: j.relationship,
      likelihood: j.likelihood,
      amountUsd: j.amountUsd ?? 0,
      createdAt: touches[0]?.at ?? funnelDay(60),
      touches,
      url: j.url ?? null,
      email: j.email ?? null,
      phone: j.phone ?? null,
      person: j.person ?? null,
      company: j.company ?? null,
      role: j.role ?? null,
      linkedin: j.linkedin ?? null,
      product: j.product ?? null,
    };
  });
}
