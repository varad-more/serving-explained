/**
 * Records a chapter's main widget for launch posts (CHAPTER_DOD item 21):
 * Playwright drives a scripted interaction on the built site, 600 CSS px wide
 * at 2×; Chromium's screencast records it, and ffmpeg writes
 * media/<slug>.mp4 (H.264, 2×) and media/<slug>.gif (12 fps, 600 px).
 * Fails if the clip is outside 6–10 s or the GIF is 3 MB or larger.
 *
 *   pnpm capture kv-cache
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";

const PORT = 4175;
const WIDTH = 600;
const SCALE = 2;
const MAX_GIF_BYTES = 3_000_000;
const CLIP = { min: 6, max: 10 };

interface Scene {
  /** The figure number the clip frames. */
  figure: string;
  /** Capture-only layout: fits the widget in a short, 600 px frame. */
  css: string;
  /** Puts the widget in its opening state; not recorded. */
  setup: (fig: Locator, page: Page) => Promise<void>;
  /** The recorded interaction. */
  run: (fig: Locator, page: Page) => Promise<void>;
}

const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

async function keys(page: Page, key: string, times: number, gap: number) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press(key);
    await pause(page, gap);
  }
}

const SCENES: Record<string, Scene> = {
  // Context 1K → 32K, then fp8, then concurrency past the limit.
  "kv-cache": {
    figure: "1.5",
    css: `
      .site-header, .skip, .callout { display: none !important; }
      .budget { grid-template-columns: 13rem 1fr !important; }
    `,
    setup: async (fig, page) => {
      await fig.getByLabel("Context length").focus();
      await page.keyboard.press("Home");
      await keys(page, "ArrowRight", 4, 0); // 1K
      await fig.getByLabel("Requests at once").focus();
      await page.keyboard.press("Home"); // 1 request
      await fig.getByLabel("Context length").focus();
    },
    run: async (fig, page) => {
      await pause(page, 600);
      await keys(page, "ArrowRight", 10, 260); // 1K → 32K
      await pause(page, 500);
      await fig.getByLabel("fp8, 1 byte").check();
      await pause(page, 900);
      await fig.getByLabel("Requests at once").focus();
      await keys(page, "ArrowRight", 4, 550); // 1 → 2 → 3 → 4 → 6
      await pause(page, 900);
    },
  },
  // Compare mode at 2× from t = 0: the same requests on both allocators.
  "paged-attention": {
    figure: "2.4",
    css: `
      .site-header, .skip, .paged__controls, .paged__legend, .paged__keys,
      .paged__select { display: none !important; }
    `,
    setup: async (fig) => {
      await fig.getByLabel("Speed").selectOption("2");
    },
    run: async (fig, page) => {
      await fig.getByRole("button", { name: "Play" }).click();
      await pause(page, 8000);
    },
  },
  // Caching off vs. on at 2× from t = 0: the same requests, both caches.
  "prefix-caching": {
    figure: "4.6",
    css: `
      .site-header, .skip, .paged__controls, .paged__legend, .paged__keys,
      .paged__select, .cache__ttft, .cache__lookup, .cache__note { display: none !important; }
    `,
    setup: async (fig) => {
      await fig.getByLabel("Speed").selectOption("2");
    },
    run: async (fig, page) => {
      await fig.getByRole("button", { name: "Play" }).click();
      await pause(page, 8000);
    },
  },
  // Static vs. continuous at 2× from t = 0: the same requests, both schedulers.
  "continuous-batching": {
    figure: "3.3",
    css: `
      .site-header, .skip, .cb__controls, .cb__charts { display: none !important; }
    `,
    setup: async (fig) => {
      await fig.getByLabel("Speed").selectOption("2");
    },
    run: async (fig, page) => {
      await fig.getByRole("button", { name: "Play" }).click();
      await pause(page, 8000);
    },
  },
};

function run(cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  if (r.error) throw r.error;
  if (r.status !== 0)
    throw new Error(`${cmd} failed:\n${r.stderr.toString().slice(-2000)}`);
  return r.stdout.toString();
}

async function waitFor(url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`preview server did not start at ${url}`);
}

async function main() {
  const slug = process.argv[2] ?? "";
  const scene = SCENES[slug];
  if (!scene) {
    console.error(
      `usage: pnpm capture <slug>; known: ${Object.keys(SCENES).join(", ")}`,
    );
    process.exit(1);
  }
  if (spawnSync("ffmpeg", ["-version"]).error) {
    console.error("ffmpeg is missing. Install it with: brew install ffmpeg");
    process.exit(1);
  }
  if (!existsSync(`dist/${slug}/index.html`)) {
    console.error(`dist/${slug}/index.html is missing. Run pnpm build first.`);
    process.exit(1);
  }

  const server = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore" },
  );
  const browser = await chromium.launch();
  try {
    const root = `http://localhost:${String(PORT)}/serving-explained/`;
    await waitFor(root);

    // Size the frame to the figure, measured with the capture layout.
    const probe = await browser.newPage({
      viewport: { width: WIDTH, height: 900 },
    });
    await probe.goto(`${root}${slug}/`);
    await probe.addStyleTag({ content: scene.css });
    const height = Math.ceil(
      await probe
        .locator(".figure", { hasText: `Fig. ${scene.figure}` })
        .evaluate((el) => el.getBoundingClientRect().height),
    );
    await probe.close();

    const dir = mkdtempSync(join(tmpdir(), "capture-"));
    const context = await browser.newContext({
      viewport: { width: WIDTH, height },
      deviceScaleFactor: SCALE,
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(`${root}${slug}/`);
    await page.addStyleTag({ content: scene.css });
    await page.evaluate(() => document.fonts.ready);
    const fig = page.locator(".figure", {
      hasText: `Fig. ${scene.figure}`,
    });
    await fig.evaluate((el) => {
      el.scrollIntoView({ block: "start" });
    });
    await scene.setup(fig, page);
    await pause(page, 300);

    // Screenshots in a loop beside the interaction: they are taken at 2×,
    // where recordVideo and Chromium's headless screencast give 1× frames.
    const frames: { file: string; at: number }[] = [];
    let done = false as boolean; // Set from outside the loop.
    const shooting = (async () => {
      while (!done) {
        const at = Date.now();
        const file = join(dir, `${String(frames.length).padStart(5, "0")}.png`);
        await page.screenshot({ path: file, caret: "hide" });
        frames.push({ file, at });
      }
    })();
    const t0 = Date.now();
    await scene.run(fig, page);
    const t1 = Date.now();
    done = true;
    await shooting;
    await context.close();
    if (frames.length === 0) throw new Error("no frames recorded");
    console.log(
      `${String(frames.length)} frames in ${((t1 - t0) / 1000).toFixed(2)} s (${(frames.length / ((t1 - t0) / 1000)).toFixed(1)} fps)`,
    );

    // Each frame lasts until the next; the first starts the clip.
    const list = join(dir, "frames.txt");
    const lines = frames.flatMap((f, i) => [
      `file '${f.file}'`,
      `duration ${(((frames[i + 1]?.at ?? t1) - (i === 0 ? t0 : f.at)) / 1000).toFixed(3)}`,
    ]);
    writeFileSync(
      list,
      [...lines, `file '${frames.at(-1)?.file ?? ""}'`].join("\n"),
    );

    mkdirSync("media", { recursive: true });
    const mp4 = `media/${slug}.mp4`;
    const gif = `media/${slug}.gif`;
    run("ffmpeg", [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-fps_mode",
      "cfr",
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-crf",
      "28",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      mp4,
    ]);
    run("ffmpeg", [
      "-y",
      "-i",
      mp4,
      "-vf",
      `fps=12,scale=${String(WIDTH)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
      gif,
    ]);

    const seconds = Number(
      run("ffprobe", [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "csv=p=0",
        mp4,
      ]).trim(),
    );
    const gifBytes = statSync(gif).size;
    console.log(
      `${mp4}: ${seconds.toFixed(2)} s, ${String(statSync(mp4).size)} bytes, ${run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", mp4]).trim()}`,
    );
    console.log(`${gif}: ${String(gifBytes)} bytes, ${String(WIDTH)} px wide`);
    if (seconds < CLIP.min || seconds > CLIP.max)
      throw new Error(
        `clip is ${seconds.toFixed(2)} s; it must be ${String(CLIP.min)}–${String(CLIP.max)} s`,
      );
    if (gifBytes >= MAX_GIF_BYTES)
      throw new Error(
        `GIF is ${String(gifBytes)} bytes; it must be under 3 MB`,
      );
  } finally {
    await browser.close();
    server.kill();
  }
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
