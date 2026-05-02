import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders markdown images with safe preview metadata", () => {
    const html = renderMarkdown("![示意图](https://example.com/a.png \"来源说明\")");

    expect(html).toContain('data-markdown-image="true"');
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('class="markdown-image-caption"');
    expect(html).toContain("来源说明");
  });

  it("does not render unsafe links or raw html as executable html", () => {
    const html = renderMarkdown("[bad](javascript:alert(1))\n\n<script>alert(1)</script>");

    expect(html).not.toContain("javascript:alert");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

