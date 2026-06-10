import type { ReactNode } from "react";

/**
 * Deliberately small markdown renderer for INJI responses.
 * Supports: ## / ### headers, - bullets, --- rules, **bold**, `inline code`.
 * No raw HTML ever touches the DOM.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={`${keyPrefix}-${i}`}
          className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.85em] text-inj-cyan-soft"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-inj-cyan-soft underline decoration-inj-cyan-soft/40 underline-offset-2 hover:decoration-inj-cyan-soft"
        >
          {link[1]}
        </a>
      );
    }
    return part;
  });
}

export function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={`ul-${key++}`} className="my-2 space-y-1.5 pl-1">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[9px] h-[3px] w-[3px] shrink-0 rounded-full bg-[var(--text-tertiary)]" />
            <span>{renderInline(b, `li-${key}-${i}`)}</span>
          </li>
        ))}
      </ul>
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bulletMatch = line.match(/^\s*[-•]\s+(.*)/);

    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
      continue;
    }
    flushBullets();

    if (line.trim() === "") continue;

    if (/^---+$/.test(line.trim())) {
      blocks.push(
        <hr key={`hr-${key++}`} className="my-4 border-0 border-t border-dim" />
      );
    } else if (line.startsWith("### ")) {
      blocks.push(
        <h4
          key={`h-${key++}`}
          className="mb-1.5 mt-5 font-display text-[15px] font-bold text-white"
        >
          {renderInline(line.slice(4), `h-${key}`)}
        </h4>
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3
          key={`h-${key++}`}
          className="mb-2 mt-5 font-display text-[17px] font-bold tracking-tight text-white"
        >
          {renderInline(line.slice(3), `h-${key}`)}
        </h3>
      );
    } else if (line.startsWith("*") && line.endsWith("*") && !line.startsWith("**")) {
      blocks.push(
        <p key={`p-${key++}`} className="my-2 text-[13px] italic text-txt-tertiary">
          {line.slice(1, -1)}
        </p>
      );
    } else {
      blocks.push(
        <p key={`p-${key++}`} className="my-2 leading-relaxed">
          {renderInline(line, `p-${key}`)}
        </p>
      );
    }
  }
  flushBullets();

  return <div className="text-[14px] text-txt-primary/90">{blocks}</div>;
}
