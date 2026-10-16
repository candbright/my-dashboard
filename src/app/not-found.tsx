import Link from 'next/link';
import { Button } from '@/components/ui';
import { PageContainer } from '@/components/layout';

/**
 * App-router 404. Without this file Next.js serves its default English overlay,
 * which would be the only user-facing string in the product that is not Chinese.
 *
 * The heading goes through `PageContainer` so it picks up `font-serif` the same
 * way every other page title does. The button is wrapped in `Link` because
 * `Button` has no `as` prop (see AGENTS.md).
 */
export default function NotFound() {
  return (
    <PageContainer
      title="页面不存在"
      subtitle="这个地址没有对应的页面，可能是链接写错了，或内容已经不在。"
    >
      <Link href="/">
        <Button color="primary">回到首页</Button>
      </Link>
    </PageContainer>
  );
}
