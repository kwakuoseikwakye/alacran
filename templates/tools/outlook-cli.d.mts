// Types for outlook-cli.mjs, which is plain JavaScript so any AI can run it with
// nothing but `node`. Loose on purpose: the context object carries injectable
// seams (fetch, clock, folder) that tests replace with fakes.
export const DEFAULT_CLIENT_ID: string
export const AUTHORITY: string
export const GRAPH: string
export const SCOPES: string
export const UNTRUSTED_NOTICE: string
export const HELP: string

export class OutlookError extends Error {
  code: number
  constructor(message: string, code?: number)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctx = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

export function homeDir(env?: Record<string, string | undefined>): string
export function readToken(dir: string): Promise<Json | null>
export function writeToken(dir: string, token: Json): Promise<void>
export function clearToken(dir: string): Promise<void>
export function beginLogin(ctx?: Ctx): Promise<{ deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }>
export function pollLogin(deviceCode: string, ctx?: Ctx): Promise<{ status: string; slowDown?: boolean; account?: { name: string; email: string }; message?: string }>
export function accessToken(ctx?: Ctx): Promise<string>
export function authStatus(ctx?: Ctx): Promise<Json>
export function mailList(options?: Json, ctx?: Ctx): Promise<{ notice: string; messages: Json[] }>
export function mailGet(id: string, ctx?: Ctx): Promise<Json>
export function mailSend(options?: Json, ctx?: Ctx): Promise<Json>
export function mailReply(id: string, options?: Json, ctx?: Ctx): Promise<Json>
export function calendarList(options?: Json, ctx?: Ctx): Promise<{ notice: string; timezone: string; events: Json[] }>
export function calendarCreate(options?: Json, ctx?: Ctx): Promise<Json>
export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, Json> }
export function run(argv: string[], ctx?: Ctx): Promise<string>
