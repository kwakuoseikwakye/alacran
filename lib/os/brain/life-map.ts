export type LifeArea = {
  id: string
  label: string
  color: string
  departmentIds: string[]
}

export const LIFE_AREAS: LifeArea[] = [
  { id: "funnel", label: "Value Pipeline", color: "#3b82f6", departmentIds: ["dept-funnel", "funnel", "dept-sales"] },
  { id: "comms", label: "Communications", color: "#8b5cf6", departmentIds: ["dept-comms", "comms"] },
  { id: "content", label: "Content", color: "#ec4899", departmentIds: ["dept-content", "content", "dept-marketing-growth"] },
  { id: "social", label: "Distribution", color: "#06b6d4", departmentIds: ["dept-social", "social"] },
  { id: "finance", label: "Finance", color: "#10b981", departmentIds: ["dept-finances", "finances", "dept-finance"] },
  { id: "tech", label: "Tech", color: "#3b82f6", departmentIds: ["dept-tech", "dept-workflows", "workflows"] },
  { id: "roadmap", label: "Roadmap", color: "#14b8a6", departmentIds: ["dept-roadmap", "roadmap"] },
  { id: "clients", label: "Clients", color: "#8b5cf6", departmentIds: ["dept-clients"] },
]

export function lifeAreaForDepartment(departmentId: string): LifeArea | null {
  const norm = departmentId.toLowerCase()
  return LIFE_AREAS.find((a) => a.departmentIds.some((id) => id.toLowerCase() === norm || norm.includes(id.toLowerCase()))) ?? null
}
