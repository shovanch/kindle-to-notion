require("dotenv").config();
import { NotionAdapter } from "../adapters";
import { GroupedClipping } from "../interfaces";
import { CreatePageParams, Emoji, BlockType } from "../interfaces";
import {
  makeHighlightsBlocks,
  updateSync,
  getUnsyncedHighlights,
  makeBlocks,
} from "../utils";

// Helper function to split long text into chunks of specified max length
function chunkText(text: string, maxLength: number = 2000): string[] {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    // Find a good break point (space, period, etc.) near the maxLength
    let breakPoint = maxLength;
    if (remainingText.length > maxLength) {
      // Try to find a good break point (space, newline, period)
      const lastSpace = remainingText.substring(0, maxLength).lastIndexOf(" ");
      const lastNewline = remainingText
        .substring(0, maxLength)
        .lastIndexOf("\n");
      const lastPeriod = remainingText.substring(0, maxLength).lastIndexOf(".");

      // Use the break point that's closest to maxLength but still within bounds
      if (lastSpace > maxLength * 0.8) breakPoint = lastSpace;
      if (lastNewline > maxLength * 0.8 && lastNewline > lastSpace)
        breakPoint = lastNewline;
      if (lastPeriod > maxLength * 0.8 && lastPeriod > breakPoint)
        breakPoint = lastPeriod + 1;
    }

    // Add the chunk and remove it from remaining text
    chunks.push(remainingText.substring(0, breakPoint));
    remainingText = remainingText.substring(breakPoint).trim();
  }

  return chunks;
}

/**
 * Creates formatted blocks for Notion based on highlight data.
 * Handles both the 100-block limit per request and 2000-character limit per text block.
 * Each highlight is formatted with:
 * - The highlight text as paragraph(s)
 * - Page & location info in italic
 * - Note with italic "Notes:" label followed by the note content in quote block
 * - A divider for separation
 *
 * @param highlights - Array of highlight objects to convert to blocks
 * @returns Object containing the blocks array and number of highlights processed
 */
function createFormattedBlocks(highlights: any[]) {
  const blocks: any[] = [];

  // Notion has a limit of 100 blocks per request
  const maxBlocksPerRequest = 100;
  let blockCount = 0;
  let highlightIndex = 0;

  // Process highlights until we reach the limit or run out of highlights
  while (
    highlightIndex < highlights.length &&
    blockCount < maxBlocksPerRequest
  ) {
    const highlight = highlights[highlightIndex];
    let highlightBlocks = 0; // Count blocks created for this highlight

    // Add the main highlight text
    if (highlight.text && highlight.text.trim()) {
      // Split long texts into chunks to handle Notion's 2000 character limit
      const textChunks = chunkText(highlight.text);

      textChunks.forEach((chunk) => {
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: chunk,
                },
              },
            ],
          },
        });
        highlightBlocks++;
      });
    }

    // Add page and location in italic
    blocks.push({
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: {
              // Use default values if page or location is missing
              content: `Page: ${highlight.page || "N/A"}, Location: ${
                highlight.location || "N/A"
              }`,
            },
            annotations: {
              italic: true, // Format as italic text
            },
          },
        ],
      },
    });
    highlightBlocks++;

    // Add note with "Notes:" label if it exists
    if (highlight.note) {
      // Format note content for the quote blocks
      const noteChunks = chunkText(highlight.note);

      // Create the quote block with "Notes:" prefix in italic for the first chunk
      blocks.push({
        object: "block",
        type: "quote",
        quote: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "Note: ",
              },
              annotations: {
                italic: true, // Format the label as italic
              },
            },
            {
              type: "text",
              text: {
                content: noteChunks[0],
              },
            },
          ],
        },
      });
      highlightBlocks++;

      // Add any remaining chunks as separate quote blocks (without the "Notes:" prefix)
      for (let i = 1; i < noteChunks.length; i++) {
        blocks.push({
          object: "block",
          type: "quote",
          quote: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: noteChunks[i],
                },
              },
            ],
          },
        });
        highlightBlocks++;
      }
    }

    // Add a divider between highlights for better visual separation
    blocks.push({
      object: "block",
      type: "divider",
      divider: {},
    });
    highlightBlocks++;

    // Update counters
    blockCount += highlightBlocks;
    highlightIndex++;

    // If we're getting close to the limit, stop adding more highlights
    // Allow a buffer to avoid potentially exceeding the limit
    if (blockCount + 5 >= maxBlocksPerRequest) {
      break;
    }
  }

  console.log(
    `Created ${blocks.length} blocks for ${highlightIndex} highlights`
  );
  // Return both the blocks and the number of highlights processed for batch tracking
  return { blocks, processedCount: highlightIndex };
}

// Helper function to create a new book page with initial highlights
async function createNewbookHighlights(
  title: string,
  author: string,
  highlights: any[],
  notionInstance: NotionAdapter
) {
  console.log(`Creating new book page for "${title}"`);

  const { blocks, processedCount } = createFormattedBlocks(highlights);
  console.log(
    `Initial page will contain ${processedCount} highlights (${blocks.length} blocks)`
  );

  const createPageParams: CreatePageParams = {
    parentDatabaseId: process.env.BOOK_DB_ID as string,
    properties: {
      title: title,
      author: author,
      bookName: title,
    },
    children: blocks,
    icon: Emoji["🔖"],
  };

  await notionInstance.createPage(createPageParams);
  return processedCount;
}

export class Notion {
  private notion;

  constructor() {
    this.notion = new NotionAdapter();
  }

  /* Method to get Notion block id of the Notion page given the book name */
  getIdFromBookName = async (bookName: string) => {
    const response = await this.notion.queryDatabase({
      database_id: process.env.BOOK_DB_ID as string,
      filter: {
        or: [
          {
            property: "Book Name",
            text: {
              equals: bookName,
            },
          },
        ],
      },
    });
    const [book] = response.results;
    if (book) {
      return book.id;
    } else {
      return null;
    }
  };

  /* Method to sync highlights to notion */
  syncHighlights = async (books: GroupedClipping[]) => {
    try {
      // get unsynced highlights from each book
      const unsyncedBooks = getUnsyncedHighlights(books);
      // if unsynced books are present
      if (unsyncedBooks.length > 0) {
        console.log("\n🚀 Syncing highlights to Notion");
        for (const book of unsyncedBooks) {
          console.log(`\n🔁 Syncing book: ${book.title}`);
          const bookId = await this.getIdFromBookName(book.title);

          // if the book is already present in Notion
          if (bookId) {
            console.log(`📚 Book already present, appending highlights`);

            // Process highlights in batches
            let processedCount = 0;

            while (processedCount < book.highlights.length) {
              const batch = book.highlights.slice(processedCount);
              const { blocks, processedCount: batchProcessed } =
                createFormattedBlocks(batch);

              console.log(
                `Syncing batch of ${batchProcessed} highlights (${
                  processedCount + 1
                } to ${processedCount + batchProcessed})`
              );

              await this.notion.appendBlockChildren(bookId, blocks);

              processedCount += batchProcessed;

              // Add a small delay to avoid rate limiting
              if (processedCount < book.highlights.length) {
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            }
          } else {
            console.log(`📚 Book not present, creating notion page`);

            // Create initial page with first batch of highlights
            const processedCount = await createNewbookHighlights(
              book.title,
              book.author,
              book.highlights,
              this.notion
            );

            // If there are more highlights, get the new page ID and append the rest in batches
            if (processedCount < book.highlights.length) {
              const newBookId = await this.getIdFromBookName(book.title);

              if (newBookId) {
                let remainingCount = processedCount;

                while (remainingCount < book.highlights.length) {
                  const batch = book.highlights.slice(remainingCount);
                  const { blocks, processedCount: batchProcessed } =
                    createFormattedBlocks(batch);

                  console.log(
                    `Syncing batch of ${batchProcessed} highlights (${
                      remainingCount + 1
                    } to ${remainingCount + batchProcessed})`
                  );

                  await this.notion.appendBlockChildren(newBookId, blocks);

                  remainingCount += batchProcessed;

                  // Add a small delay to avoid rate limiting
                  if (remainingCount < book.highlights.length) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                  }
                }
              }
            }
          }

          // after each book is successfully synced, update the sync metadata (cache)
          updateSync(book);
        }
        console.log("\n✅ Successfully synced highlights to Notion");
      } else {
        console.log("🟢 Every book is already synced!");
      }
    } catch (error: unknown) {
      console.error("❌ Failed to sync highlights", error);
      throw error;
    } finally {
      console.log("--------------------------------------");
    }
  };
}
