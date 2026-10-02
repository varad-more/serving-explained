import { Link } from "../router.ts";

export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>
        There is no page at this address. Start from the{" "}
        <Link to="/">table of contents</Link>.
      </p>
    </main>
  );
}
