const MYMEMORY = "https://api.mymemory.translated.net/get";
const CHUNK_SIZE = 450;

function isLikelyEnglish(text: string): boolean {
  const sample = text.replace(/\s+/g, " ").trim().slice(0, 800);
  if (!sample) return true;
  const nonLatin = (sample.match(/[^\u0000-\u024F\s\d\p{P}]/gu) ?? []).length;
  return nonLatin / sample.length < 0.08;
}

async function translateChunk(text: string): Promise<string> {
  const params = new URLSearchParams({
    q: text,
    langpair: "auto|en",
  });

  const res = await fetch(`${MYMEMORY}?${params}`, {
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Translation failed (${res.status})`);

  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  };

  if (data.responseStatus && data.responseStatus !== 200) {
    throw new Error("Translation service unavailable");
  }

  return data.responseData?.translatedText?.trim() ?? text;
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];

  const chunks: string[] = [];
  let current = "";

  for (const line of text.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > CHUNK_SIZE && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export async function translateToEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed || isLikelyEnglish(trimmed)) return trimmed;

  const chunks = chunkText(trimmed);
  const translated: string[] = [];

  for (const chunk of chunks) {
    translated.push(await translateChunk(chunk));
  }

  return translated.join("\n");
}

export async function translateLinesToEnglish(lines: string[]): Promise<string[]> {
  const normalized = lines.map((line) => line.trim());
  const unique = [...new Set(normalized.filter(Boolean))];
  if (unique.length === 0) return lines;
  if (isLikelyEnglish(unique.join(" "))) return lines;

  const lookup = new Map<string, string>();
  const batchSize = 6;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const joined = batch.join("\x1e");

    try {
      const translated = await translateToEnglish(joined);
      let parts = translated.split("\x1e").map((part) => part.trim());

      if (parts.length !== batch.length) {
        parts = await Promise.all(
          batch.map(async (line) => {
            try {
              return await translateToEnglish(line);
            } catch {
              return line;
            }
          })
        );
      }

      batch.forEach((line, index) => lookup.set(line, parts[index] || line));
    } catch {
      batch.forEach((line) => lookup.set(line, line));
    }
  }

  return normalized.map((line) => (line ? lookup.get(line) ?? line : line));
}
