import Link from 'next/link';
import { Button } from '@/components/ui';
import { PageContainer } from '@/components/layout';
import type { ResumeLookupFailure } from '@/lib/resume-lookup';
import { slugPathSegment } from '@/lib/resume-slug';

/**
 * What `/resume/[slug]` shows when it cannot show the resume — for the two reasons that are not
 * 「没有这份简历」.
 *
 * `404` is not here on purpose: a slug that does not exist is a genuine 404 and goes through
 * `notFound()`, the same as any other unknown address. These two states are the ones the page used
 * to render as a 404, which said something false about a resume that exists.
 *
 * `NEXT_PUBLIC_BASE_PATH` is prefixed by hand: `next/link` adds the deployment's base path to its
 * hrefs, but a plain `<a>` does not, and the retry below has to be a plain `<a>`. See `RetryLink`.
 */

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

interface ResumeUnavailablePageProps {
  reason: Exclude<ResumeLookupFailure, 'missing'>;
  slug: string;
  /** The server's own message, when it sent one. Shown so a bug report can name the failure. */
  detail?: string;
}

/**
 * A retry that really re-asks the server.
 *
 * Deliberately an `<a>` rather than `<Link>`: the overwhelmingly likely cause of a `403` here is
 * that the page was served before the browser's cookie caught up with the client's token (the
 * cookie is written on hydration — see `syncTokenCookie` in `api-client.ts`). By the time the user
 * can click, that write has happened, and what is needed is a **document** request carrying the new
 * cookie. A `<Link>` would be answered by the client router instead, so it can serve the same
 * refusal back without ever asking the backend.
 */
function RetryLink({ slug, children }: { slug: string; children: string }) {
  return (
    <a href={`${BASE_PATH}/resume/${slugPathSegment(slug)}`}>
      <Button color="primary">{children}</Button>
    </a>
  );
}

export function ResumeUnavailablePage({ reason, slug, detail }: ResumeUnavailablePageProps) {
  const isForbidden = reason === 'forbidden';

  return (
    <PageContainer
      title={isForbidden ? '无法访问这份简历' : '暂时无法加载这份简历'}
      subtitle={
        isForbidden
          ? '这份简历只对它的所有者可见。如果它属于你，通常是登录状态还没有同步到这里——重试即可；如果仍未打开，请重新登录后再试。'
          : '服务器没有给出答复，简历本身没有任何问题。稍后重试通常就好了。'
      }
    >
      {detail && <p className="mb-5 text-sm text-default-500">{detail}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <RetryLink slug={slug}>{isForbidden ? '重试' : '重新加载'}</RetryLink>

        {isForbidden && (
          <Link href="/login">
            <Button variant="bordered">重新登录</Button>
          </Link>
        )}

        <Link href="/my">
          <Button variant="light">返回我的简历</Button>
        </Link>
      </div>
    </PageContainer>
  );
}
