export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok?: boolean; json: () => Promise<unknown> }>

// The public releases-only mirror. Deliberately not the source repo:
// this endpoint must work for a user with no GitHub account and no auth.
export const RELEASES_API_URL =
  "https://api.github.com/repos/kwakuoseikwakye/alacran-releases/releases/latest"

export const RELEASE_PAGE_URL =
  "https://github.com/kwakuoseikwakye/alacran-releases/releases/latest"

// Stable across every release — .github/workflows/package-linux.yml always
// publishes the .deb under this exact asset name, precisely so this URL
// never has to change or be looked up per-version.
export const DEB_ASSET_URL =
  "https://github.com/kwakuoseikwakye/alacran-releases/releases/latest/download/Alacran.deb"

// No MAC_ASSET_URL here anymore: the mac build is Electron now
// (the macOS desktop shell, maintained separately) and updates itself via
// electron-updater, which reads the release's own generated latest-mac.yml
// rather than a URL this codebase would construct.

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

export type LatestReleaseDetails = {
  tagName: string
  name: string
  publishedAt?: string
  body?: string
  htmlUrl: string
}

/**
 * Fetches rich details for the latest release (tag, title, markdown body, release URL).
 */
export async function fetchLatestReleaseDetailsImpl(
  fetchFn: FetchLike = defaultFetch
): Promise<LatestReleaseDetails | null> {
  try {
    const res = await fetchFn(RELEASES_API_URL, {
      method: "GET",
      headers: { Accept: "application/vnd.github+json" },
    })
    if (res.ok === false) return null
    const data = (await res.json()) as {
      tag_name?: unknown
      name?: unknown
      draft?: unknown
      prerelease?: unknown
      body?: unknown
      published_at?: unknown
      html_url?: unknown
    }
    if (data.draft === true || data.prerelease === true) return null
    if (typeof data.tag_name !== "string") return null
    return {
      tagName: data.tag_name,
      name: typeof data.name === "string" ? data.name : data.tag_name,
      publishedAt: typeof data.published_at === "string" ? data.published_at : undefined,
      body: typeof data.body === "string" ? data.body : undefined,
      htmlUrl: typeof data.html_url === "string" ? data.html_url : RELEASE_PAGE_URL,
    }
  } catch {
    return null
  }
}
