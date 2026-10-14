"use server"

import {
  connectCompaniesImpl,
  cutShareLinkImpl,
  previewConnectionImpl,
  updateShareScopeImpl,
} from "./actions-impl"
import type { ShareLink, ShareScope } from "./model"
import type { SharedPreview } from "./shared-context"

/**
 * The server side of the strings on the Companies page.
 *
 * Every one returns `{ ok, message }` rather than re-exporting the impl bare: a
 * thrown error in a server action reaches the page as Next's redacted
 * production digest, which says nothing a person can act on.
 */

export async function previewConnection(
  fromId: string,
  toId: string,
  scope?: ShareScope
): Promise<{ ok: true; fromName: string; toName: string; preview: SharedPreview } | { ok: false; message: string }> {
  try {
    return await previewConnectionImpl(fromId, toId, scope)
  } catch {
    return { ok: false, message: "Couldn't look at what would be shared. Try again." }
  }
}

/** The person has seen what is shared and confirmed it: this is the step that
 *  gives one company's assistant sight of another's memory. */
export async function connectCompanies(
  fromId: string,
  toId: string,
  scope?: ShareScope
): Promise<{ ok: true; link: ShareLink } | { ok: false; message: string }> {
  try {
    return await connectCompaniesImpl(fromId, toId, scope)
  } catch {
    return { ok: false, message: "Couldn't connect those companies. Try again." }
  }
}

export async function updateShareScope(
  linkId: string,
  scope: ShareScope
): Promise<{ ok: true; link: ShareLink } | { ok: false; message: string }> {
  try {
    return await updateShareScopeImpl(linkId, scope)
  } catch {
    return { ok: false, message: "Couldn't change what is shared. Try again." }
  }
}

export async function cutShareLink(linkId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const cut = await cutShareLinkImpl(linkId)
    return cut.ok ? { ok: true } : cut
  } catch {
    return { ok: false, message: "Couldn't cut that string. Try again." }
  }
}
