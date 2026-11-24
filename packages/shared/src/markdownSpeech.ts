import type { Root, RootContent } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);

const SKIPPED = new Set(["code", "html", "image", "imageReference", "math", "yaml", "definition"]);
const BLOCKS = new Set([
  "paragraph",
  "heading",
  "listItem",
  "blockquote",
  "tableRow",
  "tableCell",
  "thematicBreak",
]);

/** Prose a reader would say aloud: fenced code, HTML, images, and math are left out. */
export function speakableMarkdownText(markdown: string): string {
  const parts: string[] = [];
  const visit = (node: Root | RootContent) => {
    if (SKIPPED.has(node.type)) return;
    if (node.type === "text" || node.type === "inlineCode") {
      parts.push(node.value);
      return;
    }
    if (node.type === "break") {
      parts.push(" ");
      return;
    }
    if ("children" in node) for (const child of node.children) visit(child);
    if (BLOCKS.has(node.type)) parts.push("\n");
  };
  visit(parser.parse(markdown));
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .map((line) => (/[.!?:;…]$/.test(line) ? line : `${line}.`))
    .join("\n");
}
