export type Personnel = { id: string; name: string; role: string; departmentId: string }

export const DEPARTMENT_HEADS: Record<string, { name: string; role: string }> = {
  "dept-sales": { name: "Marco", role: "Head of Sales" },
  "dept-marketing-growth": { name: "Nadia", role: "Head of Growth & Marketing" },
  "dept-comms": { name: "Mia", role: "Executive Assistant" },
  "dept-finance": { name: "Dana", role: "Bookkeeper" },
  "dept-clients": { name: "Rae", role: "Account Manager" },
}

export function headForDepartment(departmentId: string): Personnel | null {
  const h = DEPARTMENT_HEADS[departmentId]
  return h ? { id: `head:${departmentId}`, name: h.name, role: h.role, departmentId } : null
}
