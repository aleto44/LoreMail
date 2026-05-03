/**
 * CompressionPromptBuilder — builds prompts for the canon compression step.
 * Separate from prompt-builder.js because compression is a fundamentally different
 * task with different instructions, lower temperature, and different output format.
 */
export class CompressionPromptBuilder {
  /**
   * Build a compression prompt for a chunk of canon entries.
   * @param {string[]} chunk - Array of raw canon entry strings (≤5 entries)
   * @param {string[]} anchorList - Proper nouns and known facts that must survive compression
   */
  buildCompressionChunkPrompt(chunk, anchorList = []) {
    const system = `You are compressing historical records into a permanent archive.
Your output will never be revised. Write with the precision of a historian
who knows these words will outlast their author.

Rules:
- Third person, past tense, chronicle voice
- Every proper noun in the anchor list must appear in your output by name
- Do not invent anything not present in the source entries
- Do not resolve ambiguities the source entries left open
- Retain the earliest and latest established dates from the entries
- Output only the compressed block. No preamble.`;

    // Extract titles and dates from entries for the output skeleton
    const titles = chunk.map(e => {
      const titleMatch = e.match(/### (.+)/);
      return titleMatch ? titleMatch[1].trim() : 'Untitled';
    });

    const dates = chunk.map(e => {
      const dateMatch = e.match(/established: (\d{4}-\d{2}-\d{2})/);
      return dateMatch ? dateMatch[1] : null;
    }).filter(Boolean);

    const earliestDate = dates.sort()[0] ?? '';
    const latestDate = dates.sort().at(-1) ?? '';

    const anchorBlock = anchorList.length > 0
      ? `ANCHOR LIST — every item here must appear in your output:\n${anchorList.map(a => `- ${a}`).join('\n')}\n\n`
      : '';

    const user = `Compress the following ${chunk.length} history ${chunk.length === 1 ? 'entry' : 'entries'} into a single archived block.

${anchorBlock}OUTPUT FORMAT:
**${titles.join(' / ')}**
*${earliestDate}${latestDate && latestDate !== earliestDate ? ` – ${latestDate}` : ''}*

{compressed prose, 2–4 sentences per original entry, combined}

SOURCE ENTRIES:
${chunk.join('\n\n---\n\n')}`;

    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];
  }
}
