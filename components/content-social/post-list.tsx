import type { Post } from "@/lib/content-social/posts"
import { PostCard } from "./post-card"

export function PostList({ posts, agentId, empty }: { posts: Post[]; agentId: string; empty: string }) {
  if (posts.length === 0) return <p className="post-list-empty">{empty}</p>
  return <div className="post-list">{posts.map((p) => <PostCard key={p.fileName} post={p} agentId={agentId} />)}</div>
}
