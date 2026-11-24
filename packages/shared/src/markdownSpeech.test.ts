import { describe, expect, it } from "vite-plus/test";

import { speakableMarkdownText } from "./markdownSpeech.ts";

describe("speakableMarkdownText", () => {
  it("drops fenced code but keeps prose and inline code", () => {
    expect(
      speakableMarkdownText(
        "Run `vp i` first.\n\n```sh\nvp i\nvp run dev\n```\n\nThen open the **app**",
      ),
    ).toBe("Run vp i first.\nThen open the app.");
  });

  it("reads link text, headings, and list items as separate sentences", () => {
    expect(
      speakableMarkdownText("# Summary\n\n- Fixed [the bug](https://x.test)\n- Added tests"),
    ).toBe("Summary.\nFixed the bug.\nAdded tests.");
  });

  it("skips images and raw HTML", () => {
    expect(speakableMarkdownText("![chart](a.png)\n\n<div>hi</div>\n\nDone!")).toBe("Done!");
  });
});
