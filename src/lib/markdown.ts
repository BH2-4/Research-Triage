import { marked, type Tokens } from "marked";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/") || trimmed.startsWith("./")) {
    // Browsers normalize backslashes in a path; reject them so `/\\host` can
    // never become an unintended external URL.
    return !trimmed.includes("\\");
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

function safeTitle(title?: string | null): string {
  return title ? ` title="${escapeHtml(title)}"` : "";
}

const renderer = new marked.Renderer();

renderer.html = ({ text }: Tokens.HTML) => escapeHtml(text);

renderer.link = function ({ href, title, tokens }: Tokens.Link) {
  const label = this.parser.parseInline(tokens);
  if (!isSafeUrl(href)) return label;
  const target = href.startsWith("http://") || href.startsWith("https://")
    ? ' target="_blank" rel="noreferrer"'
    : "";
  return `<a href="${escapeHtml(href)}"${safeTitle(title)}${target}>${label}</a>`;
};

renderer.image = function ({ href, title, text, tokens }: Tokens.Image) {
  const alt = tokens ? this.parser.parseInline(tokens, this.parser.textRenderer) : text;
  if (!isSafeUrl(href)) return escapeHtml(alt);
  const caption = title || text;
  const captionHtml = caption
    ? `<span class="markdown-image-caption">${escapeHtml(caption)}</span>`
    : "";
  return `<span class="markdown-image"><img data-markdown-image="true" src="${escapeHtml(href)}" alt="${escapeHtml(alt)}"${safeTitle(title)} loading="lazy" referrerpolicy="no-referrer">${captionHtml}</span>`;
};

export function renderMarkdown(markdown: string): string {
  return marked.parse(markdown, {
    async: false,
    breaks: true,
    gfm: true,
    renderer,
  }) as string;
}
