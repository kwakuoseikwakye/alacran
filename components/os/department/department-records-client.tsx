"use client"

import type { Lead } from "@/lib/os/schemas/funnel"
import type { Transaction } from "@/lib/os/schemas/finances"
import type { SocialAccount } from "@/lib/os/schemas/social"
import type { ContentItem } from "@/lib/os/schemas/content"
import { RecordsTable, type ColumnDef } from "./records-table"
import {
  LeadStageStepper,
  TransactionStatusStepper,
  ContentStatusStepper,
} from "./interactive-status"

export function FunnelRecordsTable({
  records,
  emptyMessage,
  recordPath,
  companyId,
}: {
  records: Lead[]
  emptyMessage?: string
  recordPath: string
  companyId?: string
}) {
  const columns: ColumnDef<Lead>[] = [
    {
      header: "Lead / Company",
      accessor: (lead) => (
        <div>
          <span className="font-semibold text-foreground">{lead.name}</span>
          <span className="block text-[11px] text-muted-foreground font-mono">{lead.id}</span>
        </div>
      ),
    },
    {
      header: "Stage",
      accessor: (lead) =>
        companyId ? (
          <LeadStageStepper
            companyId={companyId}
            leadId={lead.id}
            currentStage={lead.stage}
          />
        ) : (
          <span className="inline-block px-2 py-0.5 rounded text-[11px] font-mono capitalize border border-border/60 bg-muted/30 text-foreground">
            {lead.stage}
          </span>
        ),
    },
    {
      header: "Value",
      accessor: (lead) => (
        <span className="font-mono font-bold text-foreground">
          ${lead.value.toLocaleString()} {lead.currency}
        </span>
      ),
    },
    {
      header: "Owner",
      accessor: (lead) => (
        <span className="text-muted-foreground capitalize">{lead.owner}</span>
      ),
    },
    {
      header: "Source",
      accessor: (lead) => (
        <span className="text-muted-foreground">{lead.source}</span>
      ),
    },
    {
      header: "Last Touch",
      accessor: (lead) => (
        <span className="font-mono text-muted-foreground">{lead.last_touch}</span>
      ),
    },
    {
      header: "Provenance",
      accessor: (lead) =>
        lead.provenance && lead.provenance.length > 0 ? (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
            title={`${lead.provenance[0].claim} (via ${lead.provenance[0].source} by ${lead.provenance[0].said_by})`}
          >
            {lead.provenance[0].source}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
  ]

  return (
    <RecordsTable<Lead>
      records={records}
      columns={columns}
      emptyMessage={emptyMessage}
      recordPath={recordPath}
      departmentName="funnel"
      companyId={companyId}
    />
  )
}

export function FinancesRecordsTable({
  records,
  emptyMessage,
  recordPath,
  companyId,
}: {
  records: Transaction[]
  emptyMessage?: string
  recordPath: string
  companyId?: string
}) {
  const columns: ColumnDef<Transaction>[] = [
    {
      header: "Date",
      accessor: (tx) => <span className="font-mono text-muted-foreground">{tx.date}</span>,
    },
    {
      header: "Description",
      accessor: (tx) => (
        <div>
          <span className="font-semibold text-foreground">{tx.description}</span>
          <span className="block text-[11px] text-muted-foreground font-mono capitalize">
            {tx.category} • {tx.account}
          </span>
        </div>
      ),
    },
    {
      header: "Amount",
      accessor: (tx) => (
        <span
          className={`font-mono font-bold ${
            tx.type === "income" ? "text-emerald-400" : "text-red-400"
          }`}
        >
          {tx.type === "income" ? "+" : "-"}${tx.amount.toLocaleString()} {tx.currency}
        </span>
      ),
    },
    {
      header: "Type",
      accessor: (tx) => (
        <span
          className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono capitalize border ${
            tx.type === "income"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {tx.type}
        </span>
      ),
    },
    {
      header: "Status",
      accessor: (tx) =>
        companyId ? (
          <TransactionStatusStepper
            companyId={companyId}
            txnId={tx.id}
            currentStatus={tx.status}
          />
        ) : (
          <span className="text-muted-foreground capitalize font-mono text-[11px]">
            {tx.status}
          </span>
        ),
    },
    {
      header: "Provenance",
      accessor: (tx) =>
        tx.provenance && tx.provenance.length > 0 ? (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
            title={`${tx.provenance[0].claim} (via ${tx.provenance[0].source} by ${tx.provenance[0].said_by})`}
          >
            {tx.provenance[0].source}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
  ]

  return (
    <RecordsTable<Transaction>
      records={records}
      columns={columns}
      emptyMessage={emptyMessage}
      recordPath={recordPath}
      departmentName="finances"
      companyId={companyId}
    />
  )
}

export function SocialRecordsTable({
  records,
  emptyMessage,
  recordPath,
  companyId,
}: {
  records: SocialAccount[]
  emptyMessage?: string
  recordPath: string
  companyId?: string
}) {
  const columns: ColumnDef<SocialAccount>[] = [
    {
      header: "Account / Platform",
      accessor: (acc) => (
        <div>
          {acc.url ? (
            <a
              href={acc.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground hover:text-primary transition-colors underline"
            >
              {acc.handle}
            </a>
          ) : (
            <span className="font-semibold text-foreground">{acc.handle}</span>
          )}
          <span className="block text-[11px] text-muted-foreground font-mono capitalize">
            {acc.platform}
          </span>
        </div>
      ),
    },
    {
      header: "Followers",
      accessor: (acc) => (
        <span className="font-mono font-bold text-foreground">
          {acc.followers.toLocaleString()}
        </span>
      ),
    },
    {
      header: "Profile URL",
      accessor: (acc) => (
        <a
          href={acc.url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors truncate max-w-[200px] block"
        >
          {acc.url}
        </a>
      ),
    },
    {
      header: "Last Sync",
      accessor: (acc) => (
        <span className="font-mono text-muted-foreground text-[11px]">
          {acc.last_sync ?? "—"}
        </span>
      ),
    },
    {
      header: "Provenance",
      accessor: (acc) =>
        acc.provenance && acc.provenance.length > 0 ? (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
            title={`${acc.provenance[0].claim} (via ${acc.provenance[0].source} by ${acc.provenance[0].said_by})`}
          >
            {acc.provenance[0].source}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
  ]

  return (
    <RecordsTable<SocialAccount>
      records={records}
      columns={columns}
      emptyMessage={emptyMessage}
      recordPath={recordPath}
      departmentName="social"
      companyId={companyId}
    />
  )
}

export function ContentRecordsTable({
  records,
  emptyMessage,
  recordPath,
  companyId,
}: {
  records: ContentItem[]
  emptyMessage?: string
  recordPath: string
  companyId?: string
}) {
  const columns: ColumnDef<ContentItem>[] = [
    {
      header: "Title / Type",
      accessor: (item) => (
        <div>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-foreground hover:text-primary transition-colors underline"
            >
              {item.title}
            </a>
          ) : (
            <span className="font-semibold text-foreground">{item.title}</span>
          )}
          <span className="block text-[11px] text-muted-foreground font-mono capitalize">
            {item.type} • {item.channel}
          </span>
        </div>
      ),
    },
    {
      header: "Status",
      accessor: (item) =>
        companyId ? (
          <ContentStatusStepper
            companyId={companyId}
            itemId={item.id}
            currentStatus={item.status}
          />
        ) : (
          <span
            className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono capitalize border ${
              item.status === "published"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : item.status === "scheduled"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
                : "border-border/60 bg-muted/30 text-foreground"
            }`}
          >
            {item.status}
          </span>
        ),
    },
    {
      header: "Channel",
      accessor: (item) => (
        <span className="text-muted-foreground capitalize">{item.channel}</span>
      ),
    },
    {
      header: "Author",
      accessor: (item) => (
        <span className="text-muted-foreground font-mono text-[11px] capitalize">
          {item.author}
        </span>
      ),
    },
    {
      header: "Date",
      accessor: (item) => (
        <span className="font-mono text-muted-foreground text-[11px]">
          {item.publish_date ?? "—"}
        </span>
      ),
    },
    {
      header: "Provenance",
      accessor: (item) =>
        item.provenance && item.provenance.length > 0 ? (
          <span
            className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground"
            title={`${item.provenance[0].claim} (via ${item.provenance[0].source} by ${item.provenance[0].said_by})`}
          >
            {item.provenance[0].source}
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        ),
    },
  ]

  return (
    <RecordsTable<ContentItem>
      records={records}
      columns={columns}
      emptyMessage={emptyMessage}
      recordPath={recordPath}
      departmentName="content"
      companyId={companyId}
    />
  )
}
