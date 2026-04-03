/**
 * Fixes pg_dump plain SQL where COPY ... Part data rows are broken across
 * multiple physical lines (e.g. newlines inside image/base64 fields).
 * Reads stdin, writes stdout.
 */
import fs from "fs";
import readline from "readline";

const inPath = process.argv[2];
const outPath = process.argv[3];

if (!inPath || !outPath) {
  console.error("Usage: node fix-part-copy-lines.mjs <in.sql> <out.sql>");
  process.exit(1);
}

const PART_COPY_START = 'COPY public."Part" (';

const COLS = 29;

async function main() {
  const input = fs.createReadStream(inPath, { encoding: "utf8" });
  const out = fs.createWriteStream(outPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let mode = "normal";
  let buffer = "";

  for await (const line of rl) {
    if (mode === "normal") {
      out.write(line + "\n");
      if (line.startsWith(PART_COPY_START)) {
        mode = "part_data";
        buffer = "";
      }
      continue;
    }

    if (mode === "part_data") {
      if (line === "\\.") {
        if (buffer.length > 0) {
          const parts = buffer.split("\t");
          if (parts.length !== COLS) {
            console.error(
              `Incomplete Part row at end of COPY: ${parts.length} fields (expected ${COLS})`,
            );
            process.exit(1);
          }
          out.write(buffer + "\n");
        }
        out.write(line + "\n");
        mode = "normal";
        buffer = "";
        continue;
      }

      if (buffer.length > 0) buffer += line;
      else buffer = line;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const parts = buffer.split("\t");
        if (parts.length < COLS) break;
        const row = parts.slice(0, COLS).join("\t");
        out.write(row + "\n");
        buffer = parts.slice(COLS).join("\t");
        if (buffer.length === 0) break;
      }
    }
  }

  out.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
