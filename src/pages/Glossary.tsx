import { glossary } from "../chapters/glossary.ts";
import { SourceLink } from "../viz/ui/SourceLink.tsx";

export default function Glossary() {
  return (
    <>
      <h1>Glossary</h1>
      {glossary.length === 0 ? (
        <p>No terms yet. Each chapter adds the terms it defines.</p>
      ) : (
        <dl>
          {glossary.map((entry) => (
            <div key={entry.id} id={entry.id}>
              <dt>{entry.term}</dt>
              <dd>
                {entry.definition}
                {entry.source && (
                  <>
                    {" "}
                    (<SourceLink id={entry.source.id} at={entry.source.at} />)
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}
