'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '@/lib/cn';
import { resumeSanitizeSchema } from '@/lib/markdown-sanitize';

/**
 * The single Markdown renderer for resume content.
 *
 * Every place that shows `section.content`, `item.details` or a section heading to a
 * human goes through this component. There is deliberately one implementation: a
 * second renderer would drift, and the security policy below would only be applied
 * to whichever copy someone remembered to update.
 *
 * ## Security policy
 *
 * The allow-list lives in `@/lib/markdown-sanitize` so it can be asserted directly;
 * read the comment there for what is refused and why. The short version: resume text
 * is user-controlled and publicly reachable, so `rehype-raw` is never allowed to run
 * without `rehype-sanitize` right behind it.
 *
 * The pipeline order matters and is asserted in the tests:
 *
 *   1. `rehypeRaw`      — parse embedded HTML into real nodes
 *   2. `rehypeSanitize` — strip everything the schema does not permit
 *   3. `rehypeHighlight`— (not enabled here) would add syntax-highlight classes
 *
 * Sanitising before highlighting is the safe order because the schema allows only
 * the `hljs-` class family on `<code>`/`<span>`; highlight.js adds exactly that and
 * nothing else.
 */
export { resumeSanitizeSchema } from '@/lib/markdown-sanitize';

export interface ResumeMarkdownProps {
  /** Markdown source. Rendered as a block by default. */
  children: string;
  /** `inline` drops the wrapping paragraph, for a value inside a line of text. */
  inline?: boolean;
  className?: string;
}

/**
 * Renders resume Markdown with the project's design tokens.
 *
 * Styling is applied through element overrides rather than a stylesheet because
 * Tailwind utilities guarantee the Natural Organic palette: links take `text-primary`
 * (stone brown) with a slow transition, never the browser's default blue, which the
 * design system forbids. Inline styles are not an option here — `rehype-sanitize`
 * strips `style` attributes wherever they come from.
 */
export function ResumeMarkdown({ children, inline = false, className }: ResumeMarkdownProps) {
  if (!children || children.trim() === '') return null;

  return (
    // `min-w-0` only for inline: applied inside a flex row (the entry bullet), a child
    // defaults to `min-width: auto` and refuses to shrink below its content, which
    // overflows the line instead of wrapping.
    <div className={cn(inline ? 'inline min-w-0' : 'space-y-3', 'text-foreground', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, resumeSanitizeSchema]]}
        components={{
          // `inline` must not introduce a block-level <p>, or it would break the
          // surrounding line's layout.
          p: ({ children: kids }) =>
            inline ? (
              <span>{kids}</span>
            ) : (
              <p className="leading-relaxed text-default-500">{kids}</p>
            ),

          a: ({ href, children: kids }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-4 decoration-primary/30 transition-colors duration-500 ease-in-out hover:decoration-primary"
            >
              {kids}
            </a>
          ),

          strong: ({ children: kids }) => (
            // `text-foreground` rather than pure black, which the design system bans.
            <strong className="font-semibold text-foreground">{kids}</strong>
          ),

          em: ({ children: kids }) => <em className="italic text-foreground/90">{kids}</em>,

          ul: ({ children: kids }) => (
            <ul className="list-disc space-y-1 pl-5 leading-relaxed text-default-500">{kids}</ul>
          ),
          ol: ({ children: kids }) => (
            <ol className="list-decimal space-y-1 pl-5 leading-relaxed text-default-500">{kids}</ol>
          ),
          li: ({ children: kids }) => <li className="marker:text-secondary">{kids}</li>,

          h1: ({ children: kids }) => (
            <h3 className="font-serif text-xl font-semibold tracking-tight text-foreground">{kids}</h3>
          ),
          h2: ({ children: kids }) => (
            <h4 className="font-serif text-lg font-semibold tracking-tight text-foreground">{kids}</h4>
          ),
          h3: ({ children: kids }) => (
            <h5 className="font-serif text-base font-semibold tracking-tight text-foreground">{kids}</h5>
          ),
          h4: ({ children: kids }) => (
            <h6 className="font-serif text-sm font-semibold tracking-tight text-foreground">{kids}</h6>
          ),

          code: ({ children: kids, className: codeClassName }) => (
            <code className={cn('rounded-full bg-default-100 px-2 py-0.5 text-sm text-foreground', codeClassName)}>
              {kids}
            </code>
          ),
          pre: ({ children: kids }) => (
            <pre className="overflow-x-auto rounded-[2rem] bg-content2 p-4 text-sm leading-relaxed">{kids}</pre>
          ),

          blockquote: ({ children: kids }) => (
            <blockquote className="border-l-2 border-secondary/40 pl-4 italic text-default-500">
              {kids}
            </blockquote>
          ),

          hr: () => <hr className="border-default-200" />,

          table: ({ children: kids }) => (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">{kids}</table>
            </div>
          ),
          th: ({ children: kids }) => (
            <th className="border-b border-default-200 px-2 py-1 text-left font-semibold text-foreground">
              {kids}
            </th>
          ),
          td: ({ children: kids }) => (
            <td className="border-b border-default-100 px-2 py-1 text-default-500">{kids}</td>
          ),

          // Images are allowed but constrained: a raw <img> could otherwise be any
          // size and break the page layout.
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={alt ?? ''} className="max-w-full rounded-[2rem]" />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
