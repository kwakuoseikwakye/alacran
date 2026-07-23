export function AgentAvatar({ imageUrl }: { imageUrl: string | null }) {
  if (!imageUrl) return null
  // eslint-disable-next-line @next/next/no-img-element -- user-supplied URL, not a static/local asset next/image can optimize
  return <img src={imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
}
