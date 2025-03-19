import _ from "lodash";
import { Clipping, GroupedClipping } from "../interfaces";
import { writeToFile, readFromFile, formatAuthorName } from "../utils";

export class Parser {
  private fileName = "My Clippings_3.txt";
  // private fileName = "clips.txt";
  private splitter = /=+\r*\n/gm;
  private nonUtf8 = /\uFEFF/gmu;
  private clippings: Clipping[] = [];
  private groupedClippings: GroupedClipping[] = [];
  private tempHighlights: any[] = []; // Store highlights temporarily
  private finalClippings: any[] = []; // Store the final paired highlights and notes

  /* Method to print the stats of Clippings read from My Clippings.txt */
  printStats = () => {
    console.log("\n💹 Stats for Clippings");
    for (const groupedClipping of this.groupedClippings) {
      console.log("--------------------------------------");
      console.log(`📝 Title: ${groupedClipping.title}`);
      console.log(`🙋 Author: ${groupedClipping.author}`);
      console.log(`💯 Highlights Count: ${groupedClipping.highlights.length}`);
    }
    console.log("--------------------------------------");
  };

  /* Method to export the final grouped clippings to a file */
  exportGroupedClippings = () => {
    writeToFile(this.groupedClippings, "grouped-clippings.json", "data");
  };

  /* Method add the parsed clippings to the clippings array */
  addToClippingsArray = (match: RegExpExecArray | null) => {
    if (match) {
      const title = match[1];
      let author = formatAuthorName(match[2]);
      const highlight = match[4];
      const note = match[3] || null;

      this.clippings.push({
        title,
        author,
        highlight: { text: highlight, note },
      });
    }
  };

  /* Method to parse clippings and match notes with highlights */
  parseClippings = () => {
    console.log("📋 Parsing Clippings");
    const clippingsRaw = readFromFile(this.fileName, "resources");
    console.log("clippingsRaw ->", clippingsRaw);

    // filter clippings to remove the non-UTF8 character
    const clippingsFiltered = clippingsRaw.replace(this.nonUtf8, "");
    console.log("clippingsFiltered ->", clippingsFiltered);

    // split clippings using splitter regex
    const clippingsSplit = clippingsFiltered.split(this.splitter);

    // Parse each clipping
    for (let i = 0; i < clippingsSplit.length - 1; i++) {
      const clipping = clippingsSplit[i];

      // Skip empty clippings
      if (!clipping.trim()) continue;

      // Extract title, author, page, location, and text
      const lines = clipping.trim().split("\n");

      if (lines.length < 3) continue;

      const titleAuthorLine = lines[0];
      const titleAuthorMatch = titleAuthorLine.match(/(.+) \((.+)\)/);

      if (!titleAuthorMatch) continue;

      const title = titleAuthorMatch[1].trim();
      const author = formatAuthorName(titleAuthorMatch[2]);

      const metaLine = lines[1];
      const isNote = metaLine.includes("Your Note");
      const pageLocationMatch = metaLine.match(
        /page (\d+) \| location ([\d-]+)/
      );

      if (!pageLocationMatch) continue;

      const page = pageLocationMatch[1];
      const location = pageLocationMatch[2];

      // Extract the text (which is typically after the metadata line)
      const text = lines.slice(2).join("\n").trim();

      if (isNote) {
        // This is a note - try to match with the most recent highlight
        // Find a highlight on the same page with matching end location
        const matchingHighlightIndex = this.tempHighlights.findIndex(
          (h) =>
            h.title === title &&
            h.page === page &&
            (h.location.endsWith(location) || h.location === location)
        );

        if (matchingHighlightIndex >= 0) {
          // Found a matching highlight
          const highlight = this.tempHighlights[matchingHighlightIndex];
          // Remove it from temp array to avoid duplicates
          this.tempHighlights.splice(matchingHighlightIndex, 1);

          // Add to final clippings with the note
          this.finalClippings.push({
            title,
            author,
            highlight: {
              text: highlight.text,
              note: text,
              page,
              location: highlight.location,
            },
          });
        } else {
          // No matching highlight found, store as a standalone note
          this.finalClippings.push({
            title,
            author,
            highlight: {
              text: "",
              note: text,
              page,
              location,
            },
          });
        }
      } else {
        // This is a highlight - add to temp array
        this.tempHighlights.push({
          title,
          author,
          text,
          page,
          location,
        });
      }
    }

    // Process any remaining highlights without notes
    for (const highlight of this.tempHighlights) {
      this.finalClippings.push({
        title: highlight.title,
        author: highlight.author,
        highlight: {
          text: highlight.text,
          note: null,
          page: highlight.page,
          location: highlight.location,
        },
      });
    }

    // Now convert finalClippings to clippings format for grouping
    this.clippings = this.finalClippings;
  };

  /* Method to group clippings by title */
  groupClippings = () => {
    console.log("\n➕ Grouping Clippings");
    this.groupedClippings = _.chain(this.clippings)
      .groupBy("title")
      .map((clippings, title) => ({
        title,
        author: clippings[0].author,
        highlights: clippings.map((clipping) => clipping.highlight),
      }))
      .value();

    // Remove duplicates based on text similarity
    this.groupedClippings = this.groupedClippings.map((groupedClipping) => {
      return {
        ...groupedClipping,
        highlights: _.uniqBy(groupedClipping.highlights, "text"),
      };
    });
  };

  /* Wrapper method to process clippings */
  processClippings = (): GroupedClipping[] => {
    this.parseClippings();
    this.groupClippings();
    this.exportGroupedClippings();
    this.printStats();
    return this.groupedClippings;
  };
}
