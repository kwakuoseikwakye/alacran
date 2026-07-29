export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok?: boolean; json: () => Promise<unknown> }>

// The public releases-only mirror. Deliberately not the private source repo:
// this endpoint must work for a user with no GitHub account and no auth.
export const RELEASES_API_URL =
  "https://api.github.com/repos/kwakuoseikwakye/alacran-releases/releases/latest"

export const RELEASE_PAGE_URL =
  "https://github.com/kwakuoseikwakye/alacran-releases/releases/latest"

const defaultFetch: FetchLike = (url, init) => fetch(url, init)

/**
 * Ask GitHub for the newest published release tag.
 *
 * This is the app's only outbound call that isn't a licence check, so it is
 * kept as thin as it can possibly be: an unauthenticated GET that sends no
 * user data, no machine identifier and no query about what the user has.
 * GitHub learns an IP hit the endpoint, which is unavoidable for any check,
 * and nothing else.
 */
export async function fetchLatestReleaseImpl(fetchFn: FetchLike = defaultFetch): Promise<string | null> {
  const res = await fetchFn(RELEASES_API_URL, {
    method: "GET",
    headers: { Accept: "application/vnd.github+json" },
  })
  // Unauthenticated GitHub API calls are rate-limited (403) and the endpoint
  // 404s until a first release exists. Both are normal, not errors worth
  // surfacing — treat as "nothing to report".
  if (res.ok === false) return null
  const data = (await res.json()) as { tag_name?: unknown; draft?: unknown; prerelease?: unknown }
  if (data.draft === true || data.prerelease === true) return null
  return typeof data.tag_name === "string" ? data.tag_name : null
}
