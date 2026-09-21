import React from "react";
import { parseTaskDescriptionBlocks, TaskDescriptionBlock } from "../../lib/taskDescription";

interface RichTaskDescriptionProps {
  content: string | undefined | null;
  className?: string;
}

/**
 * Render inline formatting (bold, italic, code, URLs).
 */
function renderInlineFormatting(text: string): React.ReactNode {
  if (!text) return null;

  // Split by inline markdown tokens: `code`, **bold**, *italic*, http(s) URLs
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s]+)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Inline code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-slate-100 text-purple-700 font-mono text-[11px] border border-slate-200"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold: **bold**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={idx} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *italic*
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={idx} className="italic text-foreground">
          {part.slice(1, -1)}
        </em>
      );
    }

    // URL: http(s)://...
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline font-medium break-all"
        >
          {part}
        </a>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export const RichTaskDescription: React.FC<RichTaskDescriptionProps> = ({ content, className = "" }) => {
  if (!content || !content.trim()) {
    return (
      <p className={`text-xs text-muted-foreground italic ${className}`}>
        Belum ada deskripsi untuk tugas ini.
      </p>
    );
  }

  const blocks = parseTaskDescriptionBlocks(content);

  return (
    <div className={`text-xs text-foreground space-y-2 leading-relaxed ${className}`}>
      {blocks.map((block: TaskDescriptionBlock, index: number) => {
        switch (block.type) {
          case "header": {
            const HeaderTag =
              block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
            const sizeClass =
              block.level === 1
                ? "text-base font-black text-foreground mt-4 mb-2"
                : block.level === 2
                ? "text-sm font-black text-foreground mt-3 mb-1.5"
                : "text-xs font-black text-foreground mt-2 mb-1 uppercase tracking-wider";

            return (
              <HeaderTag key={index} className={sizeClass}>
                {renderInlineFormatting(block.text)}
              </HeaderTag>
            );
          }

          case "section":
            return (
              <div key={index} className="pt-2 pb-0.5">
                <h4 className="text-xs font-black text-foreground uppercase tracking-wider pb-1 border-b border-border/60">
                  {renderInlineFormatting(block.title)}
                </h4>
              </div>
            );

          case "table":
            return (
              <div key={index} className="overflow-x-auto my-3 rounded-xl border border-border shadow-2xs">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-100 text-foreground border-b border-border">
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th key={hIdx} className="px-3.5 py-2.5 font-bold tracking-wide">
                          {renderInlineFormatting(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-white">
                    {block.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={block.headers.length}
                          className="px-3.5 py-2.5 text-center text-muted-foreground italic"
                        >
                          (Format tabel telah disiapkan untuk diisi)
                        </td>
                      </tr>
                    ) : (
                      block.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="px-3.5 py-2.5 text-slate-700 align-top">
                              {renderInlineFormatting(cell)}
                            </td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            );

          case "list":
            if (block.ordered) {
              return (
                <ol key={index} className="list-decimal list-outside ml-4 space-y-1.5 my-2 text-slate-700">
                  {block.items.map((item, itemIdx) => (
                    <li key={itemIdx} className="leading-relaxed">
                      {renderInlineFormatting(item)}
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={index} className="list-disc list-outside ml-4 space-y-1.5 my-2 text-slate-700">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="leading-relaxed">
                    {renderInlineFormatting(item)}
                  </li>
                ))}
              </ul>
            );

          case "paragraph":
            return (
              <p key={index} className="whitespace-pre-line text-slate-700 my-2 leading-relaxed">
                {renderInlineFormatting(block.text)}
              </p>
            );

          default:
            return null;
        }
      })}
    </div>
  );
};
