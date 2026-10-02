import { glossary } from "../chapters/glossary.ts";

export default function Glossary() {
  return (
    <main>
      <h1>Glossary</h1>
      {glossary.length === 0 ? (
        <p>No terms yet. Each chapter adds the terms it defines.</p>
      ) : (
        <dl>
          {glossary.map((entry) => (
            <div key={entry.id} id={entry.id}>
              <dt>{entry.term}</dt>
              <dd>{entry.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
