import { Parser, Notion } from "./models";

const parser = new Parser();
const notion = new Notion();

(async () => {
  // parse clippings
  const clippings = parser.processClippings();

  console.log(clippings);

  console.log("groupedClippings ->", JSON.stringify(clippings, null, 2));

  // Filter and log only the highlights with notes
  const highlightsWithNotes = clippings
    .map((group) => {
      return {
        title: group.title,
        author: group.author,
        highlights: group.highlights.filter(
          (highlight) => highlight.note !== null
        ),
      };
    })
    .filter((group) => group.highlights.length > 0);

  console.log(
    "Highlights with notes ->",
    JSON.stringify(highlightsWithNotes, null, 2)
  );

  // sync highlights (clippings) to notion
  // await notion.syncHighlights(clippings);
})();
