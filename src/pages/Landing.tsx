import { Link } from "../router.ts";
import { routePath, routes } from "../routes.ts";

const chapters = routes.slice(1, 5);

export default function Landing() {
  return (
    <main>
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
    </main>
  );
}
