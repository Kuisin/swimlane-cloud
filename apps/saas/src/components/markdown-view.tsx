"use client";

/**
 * Read-only Markdown rendering, for prose that is never edited in the
 * browser (the manual). `_markdown-editor.tsx`'s Milkdown surface is a real
 * editor — change listeners, history, an `editable` toggle threaded down to
 * ProseMirror — which is the wrong tool for text nobody types into; this is
 * `react-markdown` (+ `remark-gfm` for tables/strikethrough), a plain
 * string-in, DOM-out renderer with none of that machinery.
 *
 * Tailwind's Preflight strips heading sizes, list markers and link color —
 * exactly what rendered prose needs — so every element is styled here via
 * `components` overrides instead of a stylesheet, in the same spirit as
 * `markdown-editor.css` scoping under `.sw-md`.
 */
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  h1: (p) => <h1 className="mt-8 mb-3 text-2xl font-bold first:mt-0" {...p} />,
  h2: (p) => <h2 className="mt-7 mb-2.5 text-xl font-semibold" {...p} />,
  h3: (p) => <h3 className="mt-6 mb-2 text-base font-semibold" {...p} />,
  p: (p) => <p className="my-3 leading-7 text-neutral-700" {...p} />,
  ul: (p) => <ul className="my-3 list-disc space-y-1 pl-6 text-neutral-700" {...p} />,
  ol: (p) => <ol className="my-3 list-decimal space-y-1 pl-6 text-neutral-700" {...p} />,
  li: (p) => <li className="leading-6" {...p} />,
  a: (p) => (
    <a className="text-indigo-600 underline hover:text-indigo-700" target="_blank" {...p} />
  ),
  strong: (p) => <strong className="font-semibold text-neutral-900" {...p} />,
  blockquote: (p) => (
    <blockquote className="my-3 border-l-2 border-neutral-300 pl-4 text-neutral-500" {...p} />
  ),
  code: ({ className, ...p }) =>
    // A fenced block's `<code>` carries `language-xxx`; an inline one doesn't
    // — that's the only signal react-markdown gives for which wrapper it's in.
    className ? (
      <code className={`font-mono text-[13px] ${className}`} {...p} />
    ) : (
      <code
        className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[13px]"
        {...p}
      />
    ),
  pre: (p) => (
    <pre
      className="my-3 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      {...p}
    />
  ),
  hr: (p) => <hr className="my-6 border-neutral-200" {...p} />,
  table: (p) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p) => (
    <th
      className="border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-left font-medium"
      {...p}
    />
  ),
  td: (p) => <td className="border border-neutral-200 px-2.5 py-1.5" {...p} />,
  img: (p) => (
    // eslint-disable-next-line @next/next/no-img-element -- manual images are
    // repo-relative content, not something next/image's loader is set up for.
    <img className="my-3 max-w-full rounded-lg border border-neutral-200" {...p} alt={p.alt} />
  ),
};

export function MarkdownView({ text }: { text: string }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
