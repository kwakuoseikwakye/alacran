import {
  LayoutDashboard,
  Activity,
  Filter,
  DollarSign,
  Share2,
  FileText,
  Inbox,
  Brain,
  Bot,
  Users,
  Workflow,
  ListChecks,
  FolderTree,
  Plug,
  Network,
  Settings,
  PanelLeftClose,
  Milestone,
  BarChart3,
  Sparkles,
  Layers,
  Terminal,
  Building2,
  SlidersHorizontal,
  Home,
  Search,
  CircleCheck,
  type LucideIcon,
} from "lucide-react"

export { Activity, Sparkles, Layers, Terminal, Building2, SlidersHorizontal }

/**
 * Every icon `lib/os/nav.ts` names by string, plus the rail's own collapse
 * control — nothing more.
 *
 * `lib/os/nav.ts` stores `icon` as a plain string (it has to stay JSX-free to
 * run under vitest's node environment), so something has to turn that string
 * back into a component. A namespace import plus computed access
 * (`Icons[name]`) works but defeats Next's optimizePackageImports: it can't
 * tell which of lucide-react's ~1600 icons are actually used, so it ships all
 * of them (~280kB first-load JS). Named imports are statically analyzable, so
 * only these thirteen are bundled. Add a name here (and to NAV_GROUPS) when a
 * new nav item needs one — never widen this back to `import * as Icons`.
 */
export const NAV_ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  Activity,
  Filter,
  DollarSign,
  Share2,
  FileText,
  Inbox,
  Brain,
  Bot,
  Users,
  Workflow,
  ListChecks,
  FolderTree,
  Plug,
  Network,
  Settings,
  PanelLeftClose,
  Milestone,
  BarChart3,
  Sparkles,
  Layers,
  Terminal,
  Building2,
  SlidersHorizontal,
  Home,
  Search,
  CircleCheck,
}
