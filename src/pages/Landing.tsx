import { Link } from "../router.ts";
import { routePath, routes } from "../routes.ts";

const chapters = routes.slice(1, 5);

export default function Landing() {
  return (
    <>
      <h1>serving-explained</h1>
      <p>
        Each chapter explains one mechanism inside an LLM server, using a small
        simulated engine that you drive with sliders.
      </p>
      <p>
        After a chapter, you can explain its mechanism in two sentences. You can
        also predict how one setting changes the result before you run the sim.
      </p>
      <nav aria-label="Chapters">
        <ol>
          {chapters.map((r) => (
            <li key={r.slug}>
              <Link to={routePath(r.slug)}>{r.title}</Link>
            </li>
          ))}
        </ol>
      </nav>
      <p>
        Then try them together in the <Link to="/sandbox/">sandbox</Link>, or
        look up a term in the <Link to="/glossary/">glossary</Link>.
      </p>

      <section aria-labelledby="about">
        <h2 id="about">About</h2>
        <p>
          I&apos;m Varad More. I made this for developers who call LLM APIs or
          run local models but have never read a serving engine&apos;s source.
          Each chapter shows one idea that decides how many requests a GPU can
          serve, and how fast.
        </p>
        <p>
          I work on serving engines myself. I have two merged pull requests in{" "}
          <a href="https://github.com/vllm-project/vllm-metal">vllm-metal</a>,
          the community plugin that runs vLLM on Apple silicon:{" "}
          <a href="https://github.com/vllm-project/vllm-metal/pull/549">#549</a>{" "}
          and{" "}
          <a href="https://github.com/vllm-project/vllm-metal/pull/550">#550</a>
          . I also publish benchmarks. One repo{" "}
          <a href="https://github.com/varad-more/inference-engine-benchmark-system">
            compares vLLM and SGLang on an NVIDIA A10G
          </a>
          ; another{" "}
          <a href="https://github.com/varad-more/kv-transfer-tax">
            measures the cost of moving the KV cache between GPUs
          </a>
          . Every measured number on this site links to a result file in one of
          them.
        </p>
        <p>
          Every claim cites a paper, official docs, or source code at a pinned
          commit. Each claim about the simulation has a test that runs its
          preset, so the prose fails if the engine disagrees.
        </p>
        <p>
          I built it with Claude, an AI coding assistant, and every commit
          credits it. The plan and each decision I made are in{" "}
          <a href="https://github.com/varad-more/serving-explained/blob/main/tasks/todo.md">
            tasks/todo.md
          </a>
          .
        </p>
        <p>
          If you find a mistake, please{" "}
          <a href="https://github.com/varad-more/serving-explained/issues/new/choose">
            open an issue
          </a>
          . Corrections are the most useful feedback.
        </p>
      </section>
    </>
  );
}
