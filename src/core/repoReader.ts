/** Read-only view of a program's GitHub repository: the file list in one request, then individual files. */
import type { PlatformRecord } from './types.ts';
import type { RepoFile } from './logo.ts';

export interface RepoReader {
  files: RepoFile[];
  /** Raw file contents (default branch), or null. Bounded by `max` bytes. */
  read(path: string, max: number): Promise<Uint8Array | null>;
  /** Repository metadata as GitHub reports it. */
  meta(): Promise<{ homepage?: string; defaultBranch?: string } | null>;
}

export async function openRepo(p: Pick<PlatformRecord, 'owner' | 'repoName'>, token: string | undefined, budget = 24): Promise<RepoReader> {
  const headers: Record<string, string> = { 'User-Agent': 'ORBIT-Watch/1 (+read-only)' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(p.owner)}/${encodeURIComponent(p.repoName)}`;
  let requests = 0, blocked = false;
  const get = async (apiPath: string, accept: string, max: number): Promise<Uint8Array | null> => {
    if (blocked || requests >= budget) return null;
    requests += 1;
    try {
      const response = await fetch(`${base}${apiPath}`, { headers: { ...headers, Accept: accept }, signal: AbortSignal.timeout(6000) });
      if (response.status === 403 || response.status === 429) blocked = true;
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return bytes.length <= max ? bytes : null;
    } catch { return null; }
  };
  let files: RepoFile[] = [];
  const tree = await get('/git/trees/HEAD?recursive=1', 'application/vnd.github+json', 8_000_000);
  if (tree) {
    try {
      const list = (JSON.parse(new TextDecoder().decode(tree)) as { tree?: Array<{ path?: string; type?: string; size?: number }> }).tree || [];
      files = list.filter(t => t.type === 'blob' && typeof t.path === 'string').map(t => ({ path: t.path as string, size: Number(t.size) || 0 }));
    } catch { /* unreadable tree */ }
  }
  return {
    files,
    read: (path, max) => get(`/contents/${path.split('/').map(encodeURIComponent).join('/')}`, 'application/vnd.github.raw+json', max),
    meta: async () => {
      const bytes = await get('', 'application/vnd.github+json', 200_000);
      if (!bytes) return null;
      try {
        const data = JSON.parse(new TextDecoder().decode(bytes)) as { homepage?: unknown; default_branch?: unknown };
        return { homepage: typeof data.homepage === 'string' ? data.homepage : undefined, defaultBranch: typeof data.default_branch === 'string' ? data.default_branch : undefined };
      } catch { return null; }
    },
  };
}
